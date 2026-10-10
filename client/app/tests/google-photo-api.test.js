import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import * as photosAPI from '@/services/google-photo-api.js';
import { useAuthStore, BFF_BASE_URL } from '@/stores/auth.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * 文字列を UTF-8 セーフに base64 化する（btoa はマルチバイト文字を受理しないため）
 * @param {string} str 変換する文字列
 * @returns {string} base64 文字列
 */
function toBase64(str) {
  return btoa(String.fromCharCode(...new TextEncoder().encode(str)));
}

describe('google-photo-api', () => {
  /** @type {ReturnType<typeof vi.fn>} */
  let fetchMock;
  /** @type {Array<{status: number, headers: Record<string, string>, bodyBase64: string}>} POST /request の順に消費される上流レスポンスのキュー */
  let upstreamQueue;
  /** @type {Map<string, any>} requestId → 上流レスポンス */
  let upstreamResults;
  let requestSeq;

  beforeEach(() => {
    setActivePinia(createPinia());
    upstreamQueue = [];
    upstreamResults = new Map();
    requestSeq = 0;
    fetchMock = vi.fn().mockImplementation(async (url, init) => {
      const u = String(url);
      if (init?.method === 'POST' && u === `${BFF_BASE_URL}/request`) {
        // キュー投入: 202 + requestId を即時応答
        const requestId = `req-${++requestSeq}`;
        upstreamResults.set(requestId, upstreamQueue.shift() ?? makeUpstream({}));
        return jsonResponse({ requestId }, 202);
      }
      const poll = u.match(/\/request\/(.+)$/);
      if (poll) {
        const upstream = upstreamResults.get(poll[1]);
        if (!upstream) return jsonResponse({ error: 'not found' }, 404);
        return jsonResponse({ state: 'done', response: upstream });
      }
      if (u.includes('/api/token')) return jsonResponse({ gAccessToken: 'refreshed-photo-token' });
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    photosAPI.setTokenRefresher(null);
  });

  /**
   * 上流レスポンスオブジェクトを生成する
   * @param {{status?: number, body?: any, contentType?: string}} options 上流レスポンス
   * @returns {{status: number, headers: Record<string, string>, bodyBase64: string}} 上流レスポンス
   */
  function makeUpstream({ status = 200, body = {}, contentType = 'application/json' } = {}) {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return { status, headers: { 'Content-Type': contentType }, bodyBase64: toBase64(text) };
  }

  /**
   * 次回の /request キュー投入に対応する上流レスポンスを登録する
   * @param {{status?: number, body?: any, contentType?: string}} options 上流レスポンス
   */
  function enqueueUpstream(options = {}) {
    upstreamQueue.push(makeUpstream(options));
  }

  /**
   * 直近の POST /request 呼び出しを BFF エンベロープとして分解する
   * @returns {{url: string, init: RequestInit, envelope: any}}
   */
  function lastCall() {
    const [url, init] = fetchMock.mock.calls.filter(([u, i]) => i?.method === 'POST' && String(u) === `${BFF_BASE_URL}/request`).at(-1);
    return { url: String(url), init, envelope: JSON.parse(init.body) };
  }

  it('API リクエストは BFF の POST /request へ転送され、202 でキュー投入される', async () => {
    enqueueUpstream({ body: { id: 'album-1' } });
    await photosAPI.getAlbum('tok', 'album-1');
    const { url, init, envelope } = lastCall();
    expect(url).toBe(`${BFF_BASE_URL}/request`);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(envelope.service).toBe('photos');
    expect(envelope.method).toBe('GET');
    expect(envelope.accessToken).toBe('tok');
  });

  it('キュー投入後に GET /request/{requestId} で結果をポーリングする', async () => {
    enqueueUpstream({ body: { id: 'album-1' } });
    const album = await photosAPI.getAlbum('tok', 'album-1');
    const pollCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/request/req-'));
    expect(pollCall).toBeTruthy();
    expect(String(pollCall[0])).toBe(`${BFF_BASE_URL}/request/req-1`);
    expect(album.id).toBe('album-1');
  });

  it('createAlbum は POST /albums に album.title を送る', async () => {
    enqueueUpstream({ body: { id: 'album-1', title: '旅行' } });
    const album = await photosAPI.createAlbum('tok', '旅行');
    const { envelope } = lastCall();
    expect(envelope.url).toBe('https://photoslibrary.googleapis.com/v1/albums');
    expect(envelope.method).toBe('POST');
    expect(envelope.body).toEqual({ album: { title: '旅行' } });
    expect(album.id).toBe('album-1');
  });

  it('getAlbum はパスパラメータを置換する', async () => {
    enqueueUpstream();
    await photosAPI.getAlbum('tok', 'album/特殊');
    const { envelope } = lastCall();
    expect(envelope.url).toBe('https://photoslibrary.googleapis.com/v1/albums/album%2F%E7%89%B9%E6%AE%8A');
    expect(envelope.method).toBe('GET');
  });

  it('uploadMediaBytes は raw プロトコルヘッダと base64 ボディを送る', async () => {
    enqueueUpstream({ body: 'upload-token-abc', contentType: 'text/plain' });
    const token = await photosAPI.uploadMediaBytes('tok', new Blob(['x']), 'photo.jpg', 'image/jpeg');
    const { envelope } = lastCall();
    expect(envelope.url).toBe('https://photoslibrary.googleapis.com/v1/uploads');
    expect(envelope.headers['X-Goog-Upload-Protocol']).toBe('raw');
    expect(envelope.headers['X-Goog-Upload-File-Name']).toBe('photo.jpg');
    expect(envelope.headers['X-Goog-Upload-Content-Type']).toBe('image/jpeg');
    expect(envelope.headers['Content-Type']).toBe('application/octet-stream');
    expect(envelope.bodyBase64).toBe(btoa('x'));
    expect(token).toBe('upload-token-abc');
  });

  it('batchCreateMediaItems はアルバム末尾追加の指定を含める', async () => {
    enqueueUpstream({ body: { newMediaItemResults: [] } });
    await photosAPI.batchCreateMediaItems('tok', [{ simpleMediaItem: { uploadToken: 'u1', fileName: 'a.jpg' } }], 'album-9');
    const { envelope } = lastCall();
    expect(envelope.url).toBe('https://photoslibrary.googleapis.com/v1/mediaItems:batchCreate');
    expect(envelope.body.albumId).toBe('album-9');
    expect(envelope.body.albumPosition).toEqual({ position: 'LAST_IN_ALBUM' });
    expect(envelope.body.newMediaItems[0].simpleMediaItem.uploadToken).toBe('u1');
  });

  it('listAlbumMediaItems はページネーションを辿る', async () => {
    enqueueUpstream({ body: { mediaItems: [{ id: 'm1' }], nextPageToken: 'p2' } });
    enqueueUpstream({ body: { mediaItems: [{ id: 'm2' }] } });
    const items = await photosAPI.listAlbumMediaItems('tok', 'album-1');
    expect(items.map((item) => item.id)).toEqual(['m1', 'm2']);
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    const second = JSON.parse(posts[1][1].body);
    expect(second.body.pageToken).toBe('p2');
  });

  it('createPickerSession は Picker API ホストを使う', async () => {
    enqueueUpstream({ body: { id: 'sess-1', pickerUri: 'https://photospicker/x' } });
    const session = await photosAPI.createPickerSession('tok');
    const { envelope } = lastCall();
    expect(envelope.url).toBe('https://photospicker.googleapis.com/v1/sessions');
    expect(session.pickerUri).toBeTruthy();
  });

  it('listPickedMediaItems は sessionId をクエリに付ける', async () => {
    enqueueUpstream({ body: { mediaItems: [{ id: 'm1' }] } });
    const items = await photosAPI.listPickedMediaItems('tok', 'sess-9');
    const { envelope } = lastCall();
    expect(envelope.url).toBe('https://photospicker.googleapis.com/v1/mediaItems?sessionId=sess-9');
    expect(envelope.method).toBe('GET');
    expect(items).toHaveLength(1);
  });

  it('401 時に写真用トークンを再取得してリトライする', async () => {
    enqueueUpstream({ status: 401, body: { error: { message: 'unauthorized' } } });
    enqueueUpstream({ body: { id: 'album-1' } });

    const authStore = useAuthStore();
    // 401 時のトークン再取得は呼び出し側が注入するコールバックで行う
    photosAPI.setTokenRefresher(async () => {
      const res = await fetch(`${BFF_BASE_URL}/api/token?t=photo-sharing`, { credentials: 'include' });
      const data = await res.json();
      authStore.setPhotoAccessToken(data.gAccessToken);
      return data.gAccessToken;
    });

    const result = await photosAPI.getAlbum('expired-token', 'album-1');
    expect(result.id).toBe('album-1');
    expect(authStore.photoToken).toBe('refreshed-photo-token');
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(posts).toHaveLength(2);
    const retryEnvelope = JSON.parse(posts[1][1].body);
    expect(retryEnvelope.accessToken).toBe('refreshed-photo-token');
  });

  it('API エラーは status を持つ Error を投げる', async () => {
    enqueueUpstream({ status: 403, body: { error: { message: 'forbidden' } } });
    await expect(photosAPI.getAlbum('tok', 'a1')).rejects.toMatchObject({ status: 403 });
  });

  it('トークンなしでは呼ばない', async () => {
    await expect(photosAPI.getAlbum('', 'a1')).rejects.toThrow('Access token');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
