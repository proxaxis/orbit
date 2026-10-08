/**
 * イベントへの写真アルバム紐づけと Google Photos へのアップロードを担うコンポーザブル。
 * Google Photos / Picker API の呼び出しとイベント拡張プロパティへの永続化をここに集約する。
 */
import dayjs, { toDayjs } from '@/services/dayjs.js';
import * as gCalAPI from '@/services/google-calendar-api.js';
import * as photosAPI from '@/services/google-photo-api.js';
import { useAuthStore } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';

/** イベントの shared 拡張プロパティに保存するキー */
const ALBUM_ID_PROP = 'photoAlbumId';
const ALBUM_URL_PROP = 'photoAlbumProductUrl';
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

/**
 * 写真共有操作を提供するコンポーザブル
 * @returns {Object} 写真共有操作関数群
 */
export function usePhotos() {
  const authStore = useAuthStore();
  const userStore = useUserStore();

  /**
   * 写真共有機能が利用可能かどうか（設定で有効化済み + OAuth 認証済み + オンライン）
   * @returns {boolean}
   */
  function canUsePhotoSharing() {
    return userStore.usePhotoSharing && authStore.isPhotoSharingAuthorized && authStore.isAuthenticated && !userStore.isOffline;
  }

  /**
   * イベントに紐づいたアルバム情報を返す
   * @param {HandyCalendarEvent|null} evt 対象イベント
   * @returns {OrbitEventPhotoAlbum|null}
   */
  function bindingOf(evt) {
    const shared = evt?.raw?.extendedProperties?.shared ?? {};
    const albumId = shared[ALBUM_ID_PROP];
    if (typeof albumId !== 'string' || !albumId) return null;
    return {
      albumId,
      productUrl: typeof shared[ALBUM_URL_PROP] === 'string' ? shared[ALBUM_URL_PROP] : '',
    };
  }

  /**
   * アルバム情報をイベントの shared 拡張プロパティへ書き込む（他のプロパティは保持）
   * @param {HandyCalendarEvent} evt 対象イベント
   * @param {OrbitEventPhotoAlbum} binding アルバム紐づけ情報
   * @returns {Promise<void>}
   */
  async function persistBinding(evt, binding) {
    const extendedProperties = {
      ...(evt.raw?.extendedProperties?.private ? { private: evt.raw.extendedProperties.private } : {}),
      shared: {
        ...(evt.raw?.extendedProperties?.shared ?? {}),
        [ALBUM_ID_PROP]: binding.albumId,
        [ALBUM_URL_PROP]: binding.productUrl,
      },
    };
    await gCalAPI.patchEvent(authStore.token, evt.calendarId, evt.id, { extendedProperties });
    evt.raw = { ...evt.raw, extendedProperties };
  }

  /**
   * イベントにアルバムを紐づける。未作成ならアルバムを作成する。
   * アルバムは作成者の Google フォトに保存され、共有は Google フォト側で行う。
   * @param {HandyCalendarEvent} evt 対象イベント
   * @returns {Promise<OrbitEventPhotoAlbum>} 紐づけ情報
   */
  async function ensureEventAlbum(evt) {
    const existing = bindingOf(evt);
    if (existing) return existing;
    if (!canUsePhotoSharing()) throw new Error('写真共有が有効になっていません。ユーザー設定で認証してください。');

    userStore.setLoading(true, 'アルバムを作成しています...');
    const album = await photosAPI.createAlbum(authStore.photoToken, `${evt.summary ?? '予定'} (${evt.startDateTime?.format?.('YYYY-MM-DD') ?? ''})`);
    if (!album?.id) throw new Error('アルバムを作成できませんでした。');

    const binding = {
      albumId: album.id,
      productUrl: album.productUrl ?? '',
    };
    await persistBinding(evt, binding);
    return binding;
  }

  /**
   * フォームの送信ペイロードを既存イベントへ反映したイベントオブジェクトを組み立てる。
   * ensureEventAlbum のアルバム名（summary / 日付）に保存した最新の入力を使うためのヘルパー。
   * @param {HandyCalendarEvent|null} evt 対象イベント
   * @param {Record<string, any>} body 送信したイベントペイロード
   * @returns {HandyCalendarEvent|null}
   */
  function applySubmitBody(evt, body = {}) {
    if (!evt) return evt;
    const start = body.start?.dateTime ?? body.start?.date;
    return {
      ...evt,
      summary: typeof body.summary === 'string' && body.summary ? body.summary : evt.summary,
      startDateTime: start ? toDayjs(start) : evt.startDateTime,
      raw: {
        ...(evt.raw ?? {}),
        ...(body.attendees ? { attendees: body.attendees } : {}),
        extendedProperties: {
          private: { ...(evt.raw?.extendedProperties?.private ?? {}), ...(body.extendedProperties?.private ?? {}) },
          shared: { ...(evt.raw?.extendedProperties?.shared ?? {}), ...(body.extendedProperties?.shared ?? {}) },
        },
      },
    };
  }

  /**
   * アルバム情報を取得する。API で読めるのは自分のアプリ作成アルバムのみのため、
   * 他の参加者が開く場合は 403/404 を分かりやすいメッセージに変換する。
   * @param {OrbitEventPhotoAlbum} binding アルバム紐づけ情報
   * @returns {Promise<GooglePhotosAlbum>}
   */
  async function openAlbum(binding) {
    try {
      return await photosAPI.getAlbum(authStore.photoToken, binding.albumId);
    } catch (error) {
      if (/** @type {any} */ (error)?.status === 403 || /** @type {any} */ (error)?.status === 404) {
        throw new Error('このアルバムは作成者の Google フォトにあります。開くには作成者から共有してもらってください。');
      }
      throw error;
    }
  }

  /**
   * アルバム内の写真一覧を取得する
   * @param {OrbitEventPhotoAlbum} binding アルバム紐づけ情報
   * @returns {Promise<GooglePhotosMediaItem[]>}
   */
  function listAlbumPhotos(binding) {
    return photosAPI.listAlbumMediaItems(authStore.photoToken, binding.albumId);
  }

  /**
   * ファイルをアルバムへアップロードする（アルバム未作成なら自動で作成・共有される）
   * @param {HandyCalendarEvent} evt 対象イベント
   * @param {{blob: Blob, fileName: string, mimeType: string}[]} files アップロードするファイル
   * @returns {Promise<OrbitEventPhotoAlbum|null>} 紐づけ情報
   */
  async function uploadFiles(evt, files) {
    if (!files.length) return bindingOf(evt);
    if (!canUsePhotoSharing()) throw new Error('写真共有が有効になっていません。ユーザー設定で認証してください。');
    userStore.setLoading(true);
    try {
      const binding = await ensureEventAlbum(evt);
      /** @type {{uploadToken: string, fileName: string}[]} */
      const uploadTokens = [];
      for (const [index, file] of files.entries()) {
        userStore.setLoading(true, `写真をアップロードしています... (${index + 1}/${files.length})`);
        const uploadToken = await photosAPI.uploadMediaBytes(authStore.photoToken, file.blob, file.fileName, file.mimeType);
        if (uploadToken) uploadTokens.push({ uploadToken, fileName: file.fileName });
      }
      userStore.setLoading(true, 'アルバムに追加しています...');
      await photosAPI.batchCreateMediaItems(
        authStore.photoToken,
        uploadTokens.map((item) => ({ simpleMediaItem: { uploadToken: item.uploadToken, fileName: item.fileName } })),
        binding.albumId,
      );
      return binding;
    } finally {
      userStore.setLoading(false);
    }
  }

  /**
   * Google Photos Picker で選択した写真をアルバムへコピーする。
   * Picker API の選択結果は既存ライブラリ内のため、アルバム追加には再アップロードが必要。
   * @param {HandyCalendarEvent} evt 対象イベント
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
      const deadline = dayjs().valueOf() + timeoutMs;
      let current = session;
      while (!current.mediaItemsSet) {
        if (dayjs().valueOf() > deadline) throw new Error('写真の選択がタイムアウトしました。');
        await new Promise((resolve) => window.setTimeout(resolve, pollInterval));
        current = await photosAPI.getPickerSession(authStore.photoToken, session.id);
      }

      const pickedItems = await photosAPI.listPickedMediaItems(authStore.photoToken, session.id);
      if (!pickedItems.length) return null;

      /** @type {{blob: Blob, fileName: string, mimeType: string}[]} */
      const files = [];
      for (const [index, item] of pickedItems.entries()) {
        userStore.setLoading(true, `選択した写真を取得しています... (${index + 1}/${pickedItems.length})`);
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
    canUsePhotoSharing,
    bindingOf,
    ensureEventAlbum,
    applySubmitBody,
    openAlbum,
    listAlbumPhotos,
    uploadFiles,
    uploadPickedPhotos,
  };
}
