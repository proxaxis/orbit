import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import * as photosAPI from '@/services/google-photo-api.js';
import { useAuthStore } from '@/stores/auth.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('google-photo-api', () => {
  /** @type {ReturnType<typeof vi.fn>} */
  let fetchMock;

  beforeEach(() => {
    setActivePinia(createPinia());
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function lastCall() {
    const [url, init] = fetchMock.mock.calls.at(-1);
    return { url: String(url), init };
  }

  it('createAlbum は POST /albums に album.title を送る', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'album-1', title: '旅行' }));
    const album = await photosAPI.createAlbum('tok', '旅行');
    const { url, init } = lastCall();
    expect(url).toBe('https://photoslibrary.googleapis.com/v1/albums');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ album: { title: '旅行' } });
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(album.id).toBe('album-1');
  });

  it('getAlbum はパスパラメータを置換する', async () => {
    await photosAPI.getAlbum('tok', 'album/特殊');
    const { url, init } = lastCall();
    expect(url).toBe('https://photoslibrary.googleapis.com/v1/albums/album%2F%E7%89%B9%E6%AE%8A');
    expect(init.method).toBe('GET');
  });

  it('shareAlbum は sharedAlbumOptions を送り shareInfo を展開して返す', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ shareInfo: { shareableUrl: 'https://photos.app.goo.gl/x', shareToken: 'st' } }),
    );
    const info = await photosAPI.shareAlbum('tok', 'a1', { isCollaborative: true, isCommentable: false });
    const { url, init } = lastCall();
    expect(url).toBe('https://photoslibrary.googleapis.com/v1/albums/a1:share');
    expect(JSON.parse(init.body)).toEqual({ sharedAlbumOptions: { isCollaborative: true, isCommentable: false } });
    expect(info.shareToken).toBe('st');
  });

  it('joinSharedAlbum は shareToken を送る', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ album: { id: 'a1' } }));
    const res = await photosAPI.joinSharedAlbum('tok', 'ST1');
    const { url, init } = lastCall();
    expect(url).toBe('https://photoslibrary.googleapis.com/v1/sharedAlbums:join');
    expect(JSON.parse(init.body)).toEqual({ shareToken: 'ST1' });
    expect(res.album.id).toBe('a1');
  });

  it('uploadMediaBytes は raw プロトコルヘッダでバイト列を送る', async () => {
    fetchMock.mockResolvedValue(new Response('upload-token-abc', { status: 200 }));
    const token = await photosAPI.uploadMediaBytes('tok', new Blob(['x']), 'photo.jpg', 'image/jpeg');
    const { url, init } = lastCall();
    expect(url).toBe('https://photoslibrary.googleapis.com/v1/uploads');
    expect(init.headers['X-Goog-Upload-Protocol']).toBe('raw');
    expect(init.headers['X-Goog-Upload-File-Name']).toBe('photo.jpg');
    expect(init.headers['X-Goog-Upload-Content-Type']).toBe('image/jpeg');
    expect(init.headers['Content-Type']).toBe('application/octet-stream');
    expect(token).toBe('upload-token-abc');
  });

  it('batchCreateMediaItems はアルバム末尾追加の指定を含める', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ newMediaItemResults: [] }));
    await photosAPI.batchCreateMediaItems('tok', [{ simpleMediaItem: { uploadToken: 'u1', fileName: 'a.jpg' } }], 'album-9');
    const { url, init } = lastCall();
    expect(url).toBe('https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate');
    const body = JSON.parse(init.body);
    expect(body.albumId).toBe('album-9');
    expect(body.albumPosition).toEqual({ position: 'LAST_IN_ALBUM' });
    expect(body.newMediaItems[0].simpleMediaItem.uploadToken).toBe('u1');
  });

  it('listAlbumMediaItems はページネーションを辿る', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ mediaItems: [{ id: 'm1' }], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(jsonResponse({ mediaItems: [{ id: 'm2' }] }));
    const items = await photosAPI.listAlbumMediaItems('tok', 'album-1');
    expect(items.map((item) => item.id)).toEqual(['m1', 'm2']);
    const second = fetchMock.mock.calls[1];
    expect(JSON.parse(second[1].body).pageToken).toBe('p2');
  });

  it('createPickerSession は Picker API ホストを使う', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'sess-1', pickerUri: 'https://photospicker/x' }));
    const session = await photosAPI.createPickerSession('tok');
    const { url } = lastCall();
    expect(url).toBe('https://photospicker.googleapis.com/v1/sessions');
    expect(session.pickerUri).toBeTruthy();
  });

  it('listPickedMediaItems は sessionId をクエリに付ける', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ mediaItems: [{ id: 'm1' }] }));
    const items = await photosAPI.listPickedMediaItems('tok', 'sess-9');
    const { url, init } = lastCall();
    expect(url).toBe('https://photospicker.googleapis.com/v1/mediaItems?sessionId=sess-9');
    expect(init.method).toBe('GET');
    expect(items).toHaveLength(1);
  });

  it('401 時に写真用トークンを再取得してリトライする', async () => {
    let photosAPIUrlFailed = false;
    fetchMock.mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('/api/token')) return jsonResponse({ gAccessToken: 'refreshed-photo-token' });
      if (!photosAPIUrlFailed) {
        photosAPIUrlFailed = true;
        return jsonResponse({ error: { message: 'unauthorized' } }, 401);
      }
      return jsonResponse({ id: 'album-1' });
    });

    const authStore = useAuthStore();
    const result = await photosAPI.getAlbum('expired-token', 'album-1');
    expect(result.id).toBe('album-1');
    expect(authStore.photoToken).toBe('refreshed-photo-token');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe('Bearer refreshed-photo-token');
  });

  it('API エラーは status を持つ Error を投げる', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { message: 'forbidden' } }, 403));
    await expect(photosAPI.getAlbum('tok', 'a1')).rejects.toMatchObject({ status: 403 });
  });

  it('トークンなしでは呼ばない', async () => {
    await expect(photosAPI.getAlbum('', 'a1')).rejects.toThrow('Access token');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
