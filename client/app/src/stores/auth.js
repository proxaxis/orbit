import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { useUserStore } from '@/stores/user.js';

/** @type {string} BFF サーバのベース URL（未設定時は同一オリジン） */
export const BFF_BASE_URL = (import.meta.env.VITE_BFF_BASE_URL ?? '').replace(/\/$/, '');

export const useAuthStore = defineStore('auth', () => {
  const userStore = useUserStore();

  /** @type {Ref<string|null>} @description BFF サーバから取得した Google OAuth アクセストークン */
  const _gAccessToken = ref(null);

  /** @type {ComputedRef<string>} @description アクセストークン */
  const token = computed(() => _gAccessToken.value ?? '');

  /** @type {ComputedRef<boolean>} @description 現在の認証状態 */
  const isAuthenticated = computed(() => !!_gAccessToken.value);

  /**
   * Cookie 経由で BFF サーバから最新のアクセストークンを取得
   * @returns {Promise<string|null>} 取得したアクセストークン
   */
  async function fetchToken() {
    console.log('Fetching token from BFF server...', BFF_BASE_URL);
    try {
      const res = await fetch(`${BFF_BASE_URL}/api/token`, { credentials: 'include' });

      if (res.ok) {
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

  return {
    token,
    isAuthenticated,
    fetchToken,
  };
});
