import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import dayjs from '@/services/dayjs.js';

const mocks = vi.hoisted(() => ({
  patchEvent: vi.fn(async () => ({})),
  createAlbum: vi.fn(async () => ({ id: 'album-1', productUrl: 'https://photos.google.com/album/1' })),
  getAlbum: vi.fn(async () => ({ id: 'album-1' })),
  uploadMediaBytes: vi.fn(async () => 'upload-token-1'),
  batchCreateMediaItems: vi.fn(async () => ({})),
  listAlbumMediaItems: vi.fn(async () => [{ id: 'm1' }]),
  downloadMediaFile: vi.fn(async () => new Blob(['x'])),
  createPickerSession: vi.fn(async () => ({ id: 'sess-1', pickerUri: 'https://picker/x', mediaItemsSet: true })),
  getPickerSession: vi.fn(async () => ({ id: 'sess-1', mediaItemsSet: true })),
  listPickedMediaItems: vi.fn(async () => []),
  deletePickerSession: vi.fn(async () => null),
}));

const authState = vi.hoisted(() => ({
  token: 'cal-token',
  isAuthenticated: true,
  photoToken: 'photo-token',
  isPhotoSharingAuthorized: true,
  fetchPhotoToken: vi.fn(async () => 'photo-token'),
  clearPhotoToken: vi.fn(),
}));

vi.mock('@/services/google-calendar-api.js', () => ({ patchEvent: mocks.patchEvent }));
vi.mock('@/services/google-photo-api.js', () => mocks);
vi.mock('@/stores/auth.js', () => ({ BFF_BASE_URL: '', useAuthStore: () => authState }));

const { usePhotosStore } = await import('@/stores/photos.js');
const { useUserStore } = await import('@/stores/user.js');

function handyEvent(overrides = {}) {
  return {
    id: 'evt-1',
    calendarId: 'cal-1',
    summary: '旅行',
    startDateTime: dayjs('2026-10-05T10:00:00'),
    raw: { start: { dateTime: '2026-10-05T10:00:00' }, end: { dateTime: '2026-10-05T12:00:00' }, extendedProperties: { shared: { otherKey: 'keep' } } },
    ...overrides,
  };
}

describe('usePhotosStore', () => {
  /** @type {ReturnType<typeof usePhotosStore>} */
  let store;
  /** @type {ReturnType<typeof useUserStore>} */
  let userStore;

  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.stubGlobal('open', vi.fn());
    store = usePhotosStore();
    userStore = useUserStore();
    userStore.setUsePhotoSharing(true);
    authState.isPhotoSharingAuthorized = true;
    authState.isAuthenticated = true;
  });

  describe('bindingOf', () => {
    it('extendedProperties.shared からアルバム情報を読む', () => {
      const evt = handyEvent({
        raw: { extendedProperties: { shared: { photoAlbumId: 'a1', photoAlbumProductUrl: 'u' } } },
      });
      expect(store.bindingOf(evt)).toEqual({ albumId: 'a1', productUrl: 'u' });
    });

    it('紐づけなしは null', () => {
      expect(store.bindingOf(handyEvent())).toBeNull();
      expect(store.bindingOf(null)).toBeNull();
    });
  });

  describe('applySubmitBody', () => {
    it('送信ボディのタイトル・日付・参加者を反映する', () => {
      const evt = handyEvent();
      const merged = store.applySubmitBody(evt, {
        summary: '新しいタイトル',
        start: { dateTime: '2026-11-20T14:00:00' },
        attendees: [{ email: 'other@x.com' }],
        extendedProperties: { shared: { icon: '🎉' } },
      });

      expect(merged.summary).toBe('新しいタイトル');
      expect(merged.startDateTime.format('YYYY-MM-DD')).toBe('2026-11-20');
      expect(merged.raw.attendees).toEqual([{ email: 'other@x.com' }]);
      expect(merged.raw.extendedProperties.shared).toEqual({ otherKey: 'keep', icon: '🎉' });
      // 元のイベントは変更されない
      expect(evt.summary).toBe('旅行');
    });

    it('既存のアルバム紐づけを保持する', () => {
      const evt = handyEvent({
        raw: { extendedProperties: { shared: { photoAlbumId: 'a9', photoAlbumProductUrl: 'u' } } },
      });
      const merged = store.applySubmitBody(evt, { extendedProperties: { shared: { icon: '🎉' } } });
      expect(store.bindingOf(merged).albumId).toBe('a9');
    });

    it('空のボディでは元の値を維持する', () => {
      const evt = handyEvent();
      const merged = store.applySubmitBody(evt, {});
      expect(merged.summary).toBe('旅行');
      expect(merged.startDateTime.format('YYYY-MM-DD')).toBe('2026-10-05');
      expect(store.applySubmitBody(null)).toBeNull();
    });
  });

  describe('canUsePhotoSharing', () => {
    it('設定有効 + 認証済みで true', () => {
      expect(store.canUsePhotoSharing()).toBe(true);
    });

    it('設定無効・OAuth 未認証・未ログインでは false', () => {
      userStore.setUsePhotoSharing(false);
      expect(store.canUsePhotoSharing()).toBe(false);
      userStore.setUsePhotoSharing(true);
      authState.isPhotoSharingAuthorized = false;
      expect(store.canUsePhotoSharing()).toBe(false);
      authState.isPhotoSharingAuthorized = true;
      authState.isAuthenticated = false;
      expect(store.canUsePhotoSharing()).toBe(false);
    });
  });

  describe('ensureEventAlbum', () => {
    it('既存の紐づけがあれば API を呼ばず返す', async () => {
      const evt = handyEvent({ raw: { extendedProperties: { shared: { photoAlbumId: 'a9' } } } });
      const binding = await store.ensureEventAlbum(evt);
      expect(binding.albumId).toBe('a9');
      expect(mocks.createAlbum).not.toHaveBeenCalled();
    });

    it('アルバムを自動作成し shared プロパティへ保存する（他プロパティ保持）', async () => {
      const evt = handyEvent();
      const binding = await store.ensureEventAlbum(evt);

      expect(mocks.createAlbum).toHaveBeenCalledWith('photo-token', '旅行 (2026-10-05)');
      expect(mocks.patchEvent).toHaveBeenCalledWith('cal-token', 'cal-1', 'evt-1', {
        extendedProperties: {
          shared: { otherKey: 'keep', photoAlbumId: 'album-1', photoAlbumProductUrl: 'https://photos.google.com/album/1' },
        },
      });
      expect(binding).toEqual({ albumId: 'album-1', productUrl: 'https://photos.google.com/album/1' });
      // ローカルのイベントにも反映される
      expect(evt.raw.extendedProperties.shared.photoAlbumId).toBe('album-1');
    });

    it('機能未使用状態ではエラー', async () => {
      userStore.setUsePhotoSharing(false);
      await expect(store.ensureEventAlbum(handyEvent())).rejects.toThrow('写真共有');
    });
  });

  describe('uploadFiles', () => {
    const files = [{ blob: new Blob(['x']), fileName: 'a.jpg', mimeType: 'image/jpeg' }];

    it('バイトアップロード→batchCreate でアルバム末尾に追加する', async () => {
      const evt = handyEvent();
      await store.uploadFiles(evt, files);

      expect(mocks.uploadMediaBytes).toHaveBeenCalledWith('photo-token', files[0].blob, 'a.jpg', 'image/jpeg');
      expect(mocks.batchCreateMediaItems).toHaveBeenCalledWith('photo-token', [{ simpleMediaItem: { uploadToken: 'upload-token-1', fileName: 'a.jpg' } }], 'album-1');
    });

    it('アルバム未作成でも ensureEventAlbum 経由で作成される', async () => {
      await store.uploadFiles(handyEvent(), files);
      expect(mocks.createAlbum).toHaveBeenCalled();
    });

    it('空のファイル一覧は何もしない', async () => {
      const result = await store.uploadFiles(handyEvent(), []);
      expect(result).toBeNull();
      expect(mocks.uploadMediaBytes).not.toHaveBeenCalled();
    });
  });

  describe('openAlbum', () => {
    const binding = { albumId: 'album-1', productUrl: 'u' };

    it('自分のアプリ作成アルバムなら getAlbum の結果を返す', async () => {
      mocks.getAlbum.mockResolvedValue({ id: 'album-1' });
      const album = await store.openAlbum(binding);
      expect(album.id).toBe('album-1');
    });

    it('他人のアルバム（403/404）は分かりやすいメッセージのエラーになる', async () => {
      const err = new Error('forbidden');
      err.status = 403;
      mocks.getAlbum.mockRejectedValue(err);
      await expect(store.openAlbum(binding)).rejects.toThrow('作成者の Google フォト');
    });
  });

  describe('uploadPickedPhotos', () => {
    it('Picker 選択物をダウンロード→再アップロードしてアルバムへ入れる', async () => {
      mocks.listPickedMediaItems.mockResolvedValue([
        { mediaFile: { baseUrl: 'https://lh3/x', filename: 'picked.jpg', mimeType: 'image/jpeg' } },
      ]);
      const binding = await store.uploadPickedPhotos(handyEvent(), null);

      expect(mocks.downloadMediaFile).toHaveBeenCalledWith('photo-token', 'https://lh3/x');
      expect(mocks.batchCreateMediaItems).toHaveBeenCalledWith('photo-token', [{ simpleMediaItem: { uploadToken: 'upload-token-1', fileName: 'picked.jpg' } }], 'album-1');
      expect(mocks.deletePickerSession).toHaveBeenCalledWith('photo-token', 'sess-1');
      expect(binding.albumId).toBe('album-1');
    });

    it('選択なし（キャンセル）は null を返す', async () => {
      mocks.listPickedMediaItems.mockResolvedValue([]);
      const result = await store.uploadPickedPhotos(handyEvent(), null);
      expect(result).toBeNull();
      expect(mocks.uploadMediaBytes).not.toHaveBeenCalled();
      expect(mocks.deletePickerSession).toHaveBeenCalled();
    });
  });
});
