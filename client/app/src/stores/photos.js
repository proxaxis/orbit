import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';
import * as gCalAPI from '@/services/google-calendar-api.js';
import * as photosAPI from '@/services/google-photo-api.js';

/** イベントの shared 拡張プロパティに保存するキー */
const ALBUM_ID_PROP = 'photoAlbumId';
const ALBUM_URL_PROP = 'photoAlbumShareUrl';
const ALBUM_TOKEN_PROP = 'photoAlbumShareToken';
/** Picker セッションの最大待ち時間（安全側の上限） */
const PICKER_TIMEOUT_MS = 10 * 60_000;
/** Picker セッションのポーリング最小間隔 */
const PICKER_MIN_POLL_MS = 2000;

/**
 * ポーリング間隔文字列（例: "3s"）をミリ秒に変換する
 * @param {string|undefined} duration protobuf Duration 形式
 * @returns {number}
 */
function durationToMs(duration) {
  const seconds = Number.parseFloat(String(duration ?? '').replace(/s$/, ''));
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : PICKER_MIN_POLL_MS;
}

export const usePhotosStore = defineStore('photos', () => {
  const authStore = useAuthStore();
  const userStore = useUserStore();

  /** @type {Ref<boolean>} 写真操作を実行中かどうか */
  const isPhotoBusy = ref(false);
  /** @type {Ref<string>} 実行中の処理の説明 */
  const photoStatus = ref('');

  /**
   * 写真共有機能が利用可能かどうか（設定で有効化済み + OAuth 認証済み + オンライン）
   * @returns {boolean}
   */
  function canUsePhotoSharing() {
    return userStore.usePhotoSharing && authStore.isPhotoSharingAuthorized && authStore.isAuthenticated && !userStore.isOffline;
  }

  /**
   * イベントに紐づいた共有アルバム情報を返す
   * @param {HandyCalendarEvent|null} evt
   * @returns {OrbitEventPhotoAlbum|null}
   */
  function bindingOf(evt) {
    const shared = evt?.raw?.extendedProperties?.shared ?? {};
    const albumId = shared[ALBUM_ID_PROP];
    const shareToken = shared[ALBUM_TOKEN_PROP];
    if (typeof albumId !== 'string' || !albumId) return null;
    return {
      albumId,
      shareUrl: typeof shared[ALBUM_URL_PROP] === 'string' ? shared[ALBUM_URL_PROP] : '',
      shareToken: typeof shareToken === 'string' ? shareToken : '',
    };
  }

  /**
   * アルバム情報をイベントの shared 拡張プロパティへ書き込む（他のプロパティは保持）
   * @param {HandyCalendarEvent} evt
   * @param {OrbitEventPhotoAlbum} binding
   * @returns {Promise<void>}
   */
  async function persistBinding(evt, binding) {
    const extendedProperties = {
      ...(evt.raw?.extendedProperties?.private ? { private: evt.raw.extendedProperties.private } : {}),
      shared: {
        ...(evt.raw?.extendedProperties?.shared ?? {}),
        [ALBUM_ID_PROP]: binding.albumId,
        [ALBUM_URL_PROP]: binding.shareUrl,
        [ALBUM_TOKEN_PROP]: binding.shareToken,
      },
    };
    await gCalAPI.patchEvent(authStore.token, evt.calendarId, evt.id, { extendedProperties });
    evt.raw = { ...evt.raw, extendedProperties };
  }

  /**
   * イベントに共有アルバムを紐づける。未作成ならアルバムを作成して共有する。
   * 参加者がいるイベントでは、shared プロパティ経由で参加者がリンクを入手できる。
   * @param {HandyCalendarEvent} evt
   * @returns {Promise<OrbitEventPhotoAlbum>} 紐づけ情報
   */
  async function ensureEventAlbum(evt) {
    const existing = bindingOf(evt);
    if (existing) return existing;
    if (!canUsePhotoSharing()) throw new Error('写真共有が有効になっていません。ユーザー設定で認証してください。');

    photoStatus.value = 'アルバムを作成しています...';
    const album = await photosAPI.createAlbum(authStore.photoToken, `${evt.summary ?? '予定'} (${evt.startDateTime?.format?.('YYYY-MM-DD') ?? ''})`);
    if (!album?.id) throw new Error('アルバムを作成できませんでした。');

    // 他の参加者がいる場合はコラボレーション可能な共有アルバムにして公開する
    const hasAttendees = (evt.raw?.attendees ?? []).some((attendee) => !attendee.self);
    photoStatus.value = 'アルバムを共有しています...';
    const shareInfo = await photosAPI.shareAlbum(authStore.photoToken, album.id, { isCollaborative: hasAttendees, isCommentable: hasAttendees });
    const binding = {
      albumId: album.id,
      shareUrl: shareInfo?.shareableUrl ?? album.productUrl ?? '',
      shareToken: shareInfo?.shareToken ?? '',
    };
    await persistBinding(evt, binding);
    return binding;
  }

  /**
   * 共有された側としてアルバムに参加する（未参加の場合）
   * @param {OrbitEventPhotoAlbum} binding
   * @returns {Promise<GooglePhotosAlbum>}
   */
  async function openAlbum(binding) {
    try {
      return await photosAPI.getAlbum(authStore.photoToken, binding.albumId);
    } catch (error) {
      if (!binding.shareToken || (error?.status !== 403 && error?.status !== 404)) throw error;
      const joined = await photosAPI.joinSharedAlbum(authStore.photoToken, binding.shareToken);
      if (joined?.album) return joined.album;
      return photosAPI.getAlbum(authStore.photoToken, binding.albumId);
    }
  }

  /**
   * アルバム内の写真一覧を取得する
   * @param {OrbitEventPhotoAlbum} binding
   * @returns {Promise<GooglePhotosMediaItem[]>}
   */
  function listAlbumPhotos(binding) {
    return photosAPI.listAlbumMediaItems(authStore.photoToken, binding.albumId);
  }

  /**
   * ファイルをアルバムへアップロードする（アルバム未作成なら自動で作成・共有される）
   * @param {HandyCalendarEvent} evt
   * @param {{blob: Blob, fileName: string, mimeType: string}[]} files アップロードするファイル
   * @returns {Promise<OrbitEventPhotoAlbum>} 紐づけ情報
   */
  async function uploadFiles(evt, files) {
    if (!files.length) return bindingOf(evt);
    if (!canUsePhotoSharing()) throw new Error('写真共有が有効になっていません。ユーザー設定で認証してください。');
    isPhotoBusy.value = true;
    try {
      const binding = await ensureEventAlbum(evt);
      const uploadTokens = [];
      for (const [index, file] of files.entries()) {
        photoStatus.value = `写真をアップロードしています... (${index + 1}/${files.length})`;
        const uploadToken = await photosAPI.uploadMediaBytes(authStore.photoToken, file.blob, file.fileName, file.mimeType);
        if (uploadToken) uploadTokens.push({ uploadToken, fileName: file.fileName });
      }
      photoStatus.value = 'アルバムに追加しています...';
      await photosAPI.batchCreateMediaItems(
        authStore.photoToken,
        uploadTokens.map((item) => ({ simpleMediaItem: { uploadToken: item.uploadToken, fileName: item.fileName } })),
        binding.albumId,
      );
      return binding;
    } finally {
      isPhotoBusy.value = false;
      photoStatus.value = '';
    }
  }

  /**
   * Google Photos Picker で選択した写真をアルバムへコピーする。
   * Picker API の選択結果は既存ライブラリ内のため、アルバム追加には再アップロードが必要。
   * @param {HandyCalendarEvent} evt
   * @param {Window|null} pickerWindow 事前に開いたウィンドウ（ポップアップブロック回避用）
   * @returns {Promise<OrbitEventPhotoAlbum|null>} 紐づけ情報（キャンセル時は null）
   */
  async function uploadPickedPhotos(evt, pickerWindow) {
    if (!canUsePhotoSharing()) throw new Error('写真共有が有効になっていません。ユーザー設定で認証してください。');
    const session = await photosAPI.createPickerSession(authStore.photoToken);
    if (!session?.id || !session.pickerUri) throw new Error('写真の選択画面を作成できませんでした。');

    if (pickerWindow && !pickerWindow.closed) pickerWindow.location.href = `${session.pickerUri}/autoclose`;
    else window.open(`${session.pickerUri}/autoclose`, '_blank', 'noopener');

    try {
      const pollInterval = Math.max(PICKER_MIN_POLL_MS, durationToMs(session.pollingConfig?.pollInterval));
      const timeoutMs = Math.max(pollInterval, durationToMs(session.pollingConfig?.timeoutIn) || PICKER_TIMEOUT_MS);
      const deadline = Date.now() + timeoutMs;
      let current = session;
      while (!current.mediaItemsSet) {
        if (Date.now() > deadline) throw new Error('写真の選択がタイムアウトしました。');
        await new Promise((resolve) => window.setTimeout(resolve, pollInterval));
        current = await photosAPI.getPickerSession(authStore.photoToken, session.id);
      }

      const pickedItems = await photosAPI.listPickedMediaItems(authStore.photoToken, session.id);
      if (!pickedItems.length) return null;

      const files = [];
      for (const [index, item] of pickedItems.entries()) {
        photoStatus.value = `選択した写真を取得しています... (${index + 1}/${pickedItems.length})`;
        if (!item.mediaFile?.baseUrl) continue;
        const blob = await photosAPI.downloadMediaFile(authStore.photoToken, item.mediaFile.baseUrl);
        files.push({ blob, fileName: item.mediaFile.filename ?? `photo-${index + 1}`, mimeType: item.mediaFile.mimeType ?? 'application/octet-stream' });
      }
      return await uploadFiles(evt, files);
    } finally {
      photosAPI.deletePickerSession(authStore.photoToken, session.id).catch(() => null);
    }
  }

  return {
    isPhotoBusy,
    photoStatus,
    canUsePhotoSharing,
    bindingOf,
    ensureEventAlbum,
    openAlbum,
    listAlbumPhotos,
    uploadFiles,
    uploadPickedPhotos,
  };
});
