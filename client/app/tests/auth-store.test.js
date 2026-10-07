import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore, BFF_BASE_URL } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';

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
    const token = await authStore.fetchToken();
    expect(token).toBe('token-abc');
    expect(authStore.token).toBe('token-abc');
    expect(authStore.isAuthenticated).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toBe(`${BFF_BASE_URL}/api/token`);
  });

  it('fetchToken 失敗時は未認証になりエラーを記録する', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 401));
    const authStore = useAuthStore();
    const userStore = useUserStore();
    const token = await authStore.fetchToken();
    expect(token).toBeNull();
    expect(authStore.isAuthenticated).toBe(false);
    expect(userStore.hasError).toBe(true);
  });

  it('fetchPhotoToken は photo-sharing 用トークンを別枠で保持する', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ gAccessToken: 'photo-token-xyz' }));
    const authStore = useAuthStore();
    const token = await authStore.fetchPhotoToken();
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
    expect(await authStore.fetchPhotoToken()).toBeNull();
    expect(authStore.isPhotoSharingAuthorized).toBe(false);
  });

  it('clearPhotoToken で写真トークンのみ破棄される', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ gAccessToken: 'main-token' }));
    const authStore = useAuthStore();
    await authStore.fetchToken();
    fetchMock.mockResolvedValueOnce(jsonResponse({ gAccessToken: 'photo-token' }));
    await authStore.fetchPhotoToken();

    authStore.clearPhotoToken();
    expect(authStore.photoToken).toBe('');
    expect(authStore.isPhotoSharingAuthorized).toBe(false);
    expect(authStore.isAuthenticated).toBe(true); // 通常トークンは残る
  });
});
