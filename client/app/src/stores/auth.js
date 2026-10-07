import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useUserStore } from '@/stores/user.js';

/** @type {string} BFF サーバのベース URL（未設定時は同一オリジン） */
export const BFF_BASE_URL = (import.meta.env.VITE_BFF_BASE_URL ?? '').replace(/\/$/, '');

export const useAuthStore = defineStore('auth', () => {
  const userStore = useUserStore();

  /** @type {Ref<string|null>} @description BFF サーバから取得した Google OAuth アクセストークン */
  const _gAccessToken = ref(null);

  /** @type {Ref<string|null>} @description BFF サーバから取得した Google Photos 用アクセストークン */
  const _gPhotoAccessToken = ref(null);

  /** @type {ComputedRef<string>} @description アクセストークン */
  const token = computed(() => _gAccessToken.value ?? '');

  /** @type {ComputedRef<boolean>} @description 現在の認証状態 */
  const isAuthenticated = computed(() => !!_gAccessToken.value);

  /** @type {ComputedRef<string>} @description Google Photos 用アクセストークン */
  const photoToken = computed(() => _gPhotoAccessToken.value ?? '');

  /** @type {ComputedRef<boolean>} @description 写真共有の OAuth 認証が済んでいるか */
  const isPhotoSharingAuthorized = computed(() => !!_gPhotoAccessToken.value);

  /**
   * Cookie 経由で BFF サーバから最新のアクセストークンを取得
   * @returns {Promise<string|null>} 取得したアクセストークン
   */
  async function fetchToken() {
    console.log('Fetching token from BFF server...', BFF_BASE_URL);
    try {
      const res = await fetch(`${BFF_BASE_URL}/api/token`, { credentials: 'include' });

      if (res.ok && res.headers.get('Content-Type')?.startsWith('application/json')) {
        /** @type {{ gAccessToken: string }} */
        const data = await res.json();

        if (data !== null && typeof data === 'object' && 'gAccessToken' in data && typeof data.gAccessToken === 'string') {
          _gAccessToken.value = data.gAccessToken;

          return data.gAccessToken;
        }
      }

      _gAccessToken.value = null;

      throw new Error('Authentication failed');
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
      const res = await fetch(`${BFF_BASE_URL}/api/token?t=photo-sharing`, { credentials: 'include' });

      if (res.ok && res.headers.get('Content-Type')?.startsWith('application/json')) {
        /** @type {{ gAccessToken: string }} */
        const data = await res.json();

        if (data !== null && typeof data === 'object' && 'gAccessToken' in data && typeof data.gAccessToken === 'string') {
          _gPhotoAccessToken.value = data.gAccessToken;
          return data.gAccessToken;
        }
      }

      _gPhotoAccessToken.value = null;
      return null;
    } catch (err) {
      userStore.setError(true, err instanceof Error ? err : new Error(String(err)));
      return null;
    }
  }

  /** 写真共有用トークンを破棄する（機能の無効化時に使用） */
  function clearPhotoToken() {
    _gPhotoAccessToken.value = null;
  }

  return {
    token,
    isAuthenticated,
    fetchToken,
    photoToken,
    isPhotoSharingAuthorized,
    fetchPhotoToken,
    clearPhotoToken,
  };
});
