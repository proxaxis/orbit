/**
 * 認証トークンの取得・ログアウトを担うコンポーザブル。
 * BFF サーバとの通信と API クライアントへのトークン再取得コールバックの
 * 注入をここに集約する。
 * 取得したトークンは IndexedDB にも保存し、Service Worker の
 * バックグラウンド同期（オフラインキュー再送・共有同期）から参照できるようにする。
 */
import { BFF_BASE_URL, useAuthStore } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';
import { CACHE_KEYS, SYNC_TAGS, deleteCache, registerBackgroundSync, writeCache } from '@/composables/useCache.js';
import { setTokenRefresher as setCalendarTokenRefresher } from '@/services/google-calendar-api.js';
import { setTokenRefresher as setPeopleTokenRefresher } from '@/services/google-people-api.js';
import { setTokenRefresher as setPhotoTokenRefresher } from '@/services/google-photo-api.js';
import { setTokenRefresher as setDriveTokenRefresher } from '@/services/google-drive-api.js';

/** @type {Promise<string|null>|null} 写真共有用トークン取得中のリクエスト（重複防止用） */
let photoTokenRequest = null;

/** @type {Promise<string|null>|null} People API 用トークン取得中のリクエスト（重複防止用） */
let peopleTokenRequest = null;

/** @type {Promise<string|null>|null} Drive API 用トークン取得中のリクエスト（重複防止用） */
let driveTokenRequest = null;

/**
 * BFF サーバのトークンエンドポイントへ問い合わせる
 * @param {string} [query] クエリ文字列（例: 't=photo-sharing'）
 * @returns {Promise<string|null>} 取得したアクセストークン
 */
async function requestToken(query = '') {
  const res = await fetch(`${BFF_BASE_URL}/api/token${query ? `?${query}` : ''}`, { credentials: 'include' });
  if (res.ok && res.headers.get('Content-Type')?.startsWith('application/json')) {
    /** @type {{ gAccessToken: string }} */
    const data = await res.json();
    if (data !== null && typeof data === 'object' && 'gAccessToken' in data && typeof data.gAccessToken === 'string') {
      return data.gAccessToken;
    }
  }
  return null;
}

/**
 * 認証関連の処理を提供するコンポーザブル
 * @returns {Object} 認証操作関数群
 */
export function useAuth() {
  const authStore = useAuthStore();
  const userStore = useUserStore();

  /**
   * Cookie 経由で BFF サーバから最新のアクセストークンを取得する。
   * Service Worker のバックグラウンド同期用にキャッシュへも保存する。
   * @returns {Promise<string|null>} 取得したアクセストークン
   */
  async function fetchToken() {
    console.log('Fetching token from BFF server...', BFF_BASE_URL);
    try {
      const token = await requestToken();
      if (!token) {
        authStore.setAccessToken(null);
        throw new Error('Authentication failed');
      }
      authStore.setAccessToken(token);
      await writeCache(CACHE_KEYS.ACCESS_TOKEN, token);
      return token;
    } catch (err) {
      userStore.setError(true, err instanceof Error ? err : new Error(String(err)));
      return null;
    }
  }

  /**
   * Cookie 経由で BFF サーバから写真共有用のアクセストークンを取得
   * @returns {Promise<string|null>} 取得したアクセストークン（未認証なら null）
   */
  async function fetchPhotoToken() {
    try {
      const token = await requestToken('t=photo-sharing');
      authStore.setPhotoAccessToken(token);
      return token;
    } catch (err) {
      userStore.setError(true, err instanceof Error ? err : new Error(String(err)));
      return null;
    }
  }

  /**
   * 写真共有用トークンを必要に応じて取得する。未取得のときだけ BFF へ問い合わせ、取得中のリクエストは共有する。
   * @returns {Promise<string|null>} 取得したアクセストークン（未認証なら null）
   */
  function ensurePhotoToken() {
    if (authStore.photoToken) return Promise.resolve(authStore.photoToken);
    if (!photoTokenRequest) {
      photoTokenRequest = fetchPhotoToken().finally(() => {
        photoTokenRequest = null;
      });
    }
    return photoTokenRequest;
  }

  /**
   * 写真共有用トークンを破棄する（機能の無効化時に使用）
   * @returns {void}
   */
  function clearPhotoToken() {
    authStore.setPhotoAccessToken(null);
  }

  /**
   * Cookie 経由で BFF サーバから People API 用のアクセストークンを取得
   * @returns {Promise<string|null>} 取得したアクセストークン（未認証なら null）
   */
  async function fetchPeopleToken() {
    try {
      const token = await requestToken('t=people');
      authStore.setPeopleAccessToken(token);
      return token;
    } catch (err) {
      userStore.setError(true, err instanceof Error ? err : new Error(String(err)));
      return null;
    }
  }

  /**
   * People API 用トークンを必要に応じて取得する。未取得のときだけ BFF へ問い合わせ、取得中のリクエストは共有する。
   * @returns {Promise<string|null>} 取得したアクセストークン（未認証なら null）
   */
  function ensurePeopleToken() {
    if (authStore.peopleToken) return Promise.resolve(authStore.peopleToken);
    if (!peopleTokenRequest) {
      peopleTokenRequest = fetchPeopleToken().finally(() => {
        peopleTokenRequest = null;
      });
    }
    return peopleTokenRequest;
  }

  /**
   * People API 用トークンを破棄する（機能の無効化時に使用）
   * @returns {void}
   */
  function clearPeopleToken() {
    authStore.setPeopleAccessToken(null);
  }

  /**
   * Cookie 経由で BFF サーバから Drive API 用のアクセストークンを取得
   * @returns {Promise<string|null>} 取得したアクセストークン（未認証なら null）
   */
  async function fetchDriveToken() {
    try {
      const token = await requestToken('t=drive');
      authStore.setDriveAccessToken(token);
      return token;
    } catch (err) {
      userStore.setError(true, err instanceof Error ? err : new Error(String(err)));
      return null;
    }
  }

  /**
   * Drive API 用トークンを必要に応じて取得する。未取得のときだけ BFF へ問い合わせ、取得中のリクエストは共有する。
   * @returns {Promise<string|null>} 取得したアクセストークン（未認証なら null）
   */
  function ensureDriveToken() {
    if (authStore.driveToken) return Promise.resolve(authStore.driveToken);
    if (!driveTokenRequest) {
      driveTokenRequest = fetchDriveToken().finally(() => {
        driveTokenRequest = null;
      });
    }
    return driveTokenRequest;
  }

  /**
   * Drive API 用トークンを破棄する（機能の無効化時に使用）
   * @returns {void}
   */
  function clearDriveToken() {
    authStore.setDriveAccessToken(null);
  }

  /**
   * BFF サーバのセッションを破棄してログアウトし、保持しているアクセストークンを全て破棄する
   * @returns {Promise<boolean>} サーバ側のログアウトに成功した場合は true
   */
  async function logout() {
    try {
      const res = await fetch(`${BFF_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
      if (!res.ok) throw new Error(`Logout failed: ${res.status}`);
      return true;
    } catch (err) {
      userStore.setError(true, err instanceof Error ? err : new Error(String(err)));
      return false;
    } finally {
      authStore.clearTokens();
      await deleteCache(CACHE_KEYS.ACCESS_TOKEN);
    }
  }

  return {
    fetchToken,
    fetchPhotoToken,
    ensurePhotoToken,
    clearPhotoToken,
    fetchPeopleToken,
    ensurePeopleToken,
    clearPeopleToken,
    fetchDriveToken,
    ensureDriveToken,
    clearDriveToken,
    logout,
  };
}

/**
 * Google API クライアントへ 401 時のトークン再取得コールバックを注入し、
 * Service Worker からの同期メッセージを処理する。
 * アプリ起動時に一度だけ呼ぶ。
 * @returns {void}
 */
export function initApiClients() {
  const auth = useAuth();
  const calendarRefresher = async () => {
    const token = await auth.fetchToken();
    // トークン更新後は保留キューと共有同期の再試行を Service Worker へも委譲する
    if (token) {
      registerBackgroundSync(SYNC_TAGS.OFFLINE_QUEUE);
      registerBackgroundSync(SYNC_TAGS.SHARE_SYNC);
    }
    return token;
  };
  setCalendarTokenRefresher(calendarRefresher);
  setPeopleTokenRefresher(() => auth.fetchPeopleToken());
  setPhotoTokenRefresher(() => auth.fetchPhotoToken());
  setDriveTokenRefresher(() => auth.fetchDriveToken());
}
