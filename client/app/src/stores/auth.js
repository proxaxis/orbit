/**
 * 認証トークンの状態管理のみを担当するストア。
 * BFF サーバへのトークン取得・ログアウトなどのロジックは
 * `composables/useAuth.js` に置く。
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

/** @type {string} BFF サーバのベース URL（未設定時は同一オリジン） */
export const BFF_BASE_URL = (import.meta.env.VITE_BFF_BASE_URL).replace(/\/$/, '');

export const useAuthStore = defineStore('auth', () => {
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
   * アクセストークンを設定する
   * @param {string|null} value アクセストークン
   * @returns {void}
   */
  function setAccessToken(value) {
    _gAccessToken.value = value;
  }

  /**
   * Google Photos 用アクセストークンを設定する
   * @param {string|null} value アクセストークン
   * @returns {void}
   */
  function setPhotoAccessToken(value) {
    _gPhotoAccessToken.value = value;
  }

  /**
   * 保持しているアクセストークンを全て破棄する
   * @returns {void}
   */
  function clearTokens() {
    _gAccessToken.value = null;
    _gPhotoAccessToken.value = null;
  }

  return {
    token,
    isAuthenticated,
    photoToken,
    isPhotoSharingAuthorized,
    setAccessToken,
    setPhotoAccessToken,
    clearTokens,
  };
});
