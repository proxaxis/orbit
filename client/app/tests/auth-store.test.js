import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore, BFF_BASE_URL } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';
import { useAuth } from '@/composables/useAuth.js';

vi.mock('@/composables/useCache.js', () => ({
  CACHE_KEYS: { ACCESS_TOKEN: 'orbit-access-token' },
  SYNC_TAGS: { OFFLINE_QUEUE: 'orbit-offline-queue', SHARE_SYNC: 'orbit-share-sync' },
  readCache: vi.fn(async (key, fallback) => fallback),
  writeCache: vi.fn(async () => {}),
  deleteCache: vi.fn(async () => {}),
  registerBackgroundSync: vi.fn(async () => false),
}));

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useAuthStore', () => {
  let fetchMock;

  beforeEach(() => {
    setActivePinia(createPinia());
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchToken で通常トークンを取得する', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ gAccessToken: 'token-abc' }));
    const authStore = useAuthStore();
    const token = await useAuth().fetchToken();
    expect(token).toBe('token-abc');
    expect(authStore.token).toBe('token-abc');
    expect(authStore.isAuthenticated).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${BFF_BASE_URL}/api/token`);
  });

  it('fetchToken 失敗時は未認証になりエラーを記録する', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 401));
    const authStore = useAuthStore();
    const userStore = useUserStore();
    const token = await useAuth().fetchToken();
    expect(token).toBeNull();
    expect(authStore.isAuthenticated).toBe(false);
    expect(userStore.hasError).toBe(true);
  });

  it('fetchPhotoToken は photo-sharing 用トークンを別枠で保持する', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ gAccessToken: 'photo-token-xyz' }));
    const authStore = useAuthStore();
    const token = await useAuth().fetchPhotoToken();
    expect(token).toBe('photo-token-xyz');
    expect(authStore.photoToken).toBe('photo-token-xyz');
    expect(authStore.isPhotoSharingAuthorized).toBe(true);
    // 通常の認証とは別管理
    expect(authStore.isAuthenticated).toBe(false);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${BFF_BASE_URL}/api/token?t=photo-sharing`);
  });

  it('fetchPhotoToken はトークンが無いレスポンスで null を返す', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const authStore = useAuthStore();
    expect(await useAuth().fetchPhotoToken()).toBeNull();
    expect(authStore.isPhotoSharingAuthorized).toBe(false);
  });

  it('ensurePhotoToken は未取得時だけ取得し、重複リクエストを共有する', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ gAccessToken: 'photo-token' }));
    const authStore = useAuthStore();
    const [a, b] = await Promise.all([useAuth().ensurePhotoToken(), useAuth().ensurePhotoToken()]);
    expect(a).toBe('photo-token');
    expect(b).toBe('photo-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 既にトークンがある場合は再取得しない
    await useAuth().ensurePhotoToken();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('logout はサーバのセッションを破棄し、ローカルのトークンを全て消す', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ gAccessToken: 'main-token' }));
    const authStore = useAuthStore();
    await useAuth().fetchToken();
    fetchMock.mockResolvedValueOnce(jsonResponse({ gAccessToken: 'photo-token' }));
    await useAuth().fetchPhotoToken();

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }));
    const result = await useAuth().logout();

    expect(result).toBe(true);
    expect(authStore.isAuthenticated).toBe(false);
    expect(authStore.token).toBe('');
    expect(authStore.photoToken).toBe('');
    const [url, init] = fetchMock.mock.calls[2];
    expect(String(url)).toBe(`${BFF_BASE_URL}/auth/logout`);
    expect(init.method).toBe('POST');
  });

  it('logout はサーバ側の失敗時もローカルトークンを破棄してエラーを記録する', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ gAccessToken: 'main-token' }));
    const authStore = useAuthStore();
    const userStore = useUserStore();
    await useAuth().fetchToken();

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    const result = await useAuth().logout();

    expect(result).toBe(false);
    expect(authStore.isAuthenticated).toBe(false);
    expect(userStore.hasError).toBe(true);
  });

  it('clearPhotoToken で写真トークンのみ破棄される', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ gAccessToken: 'main-token' }));
    const authStore = useAuthStore();
    await useAuth().fetchToken();
    fetchMock.mockResolvedValueOnce(jsonResponse({ gAccessToken: 'photo-token' }));
    await useAuth().fetchPhotoToken();

    useAuth().clearPhotoToken();
    expect(authStore.photoToken).toBe('');
    expect(authStore.isPhotoSharingAuthorized).toBe(false);
    expect(authStore.isAuthenticated).toBe(true); // 通常トークンは残る
  });
});
