/**
 * 認証トークンの状態管理のみを担当するストア。
 * BFF サーバへのトークン取得・ログアウトなどのロジックは
 * `composables/useAuth.js` に置く。
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export { BFF_BASE_URL } from '@/services/bff-request.js';

export const useAuthStore = defineStore('auth', () => {
  /** @type {Ref<string|null>} @description BFF サーバから取得した Google OAuth アクセストークン */
  const _gAccessToken = ref(null);

  /** @type {Ref<string|null>} @description BFF サーバから取得した Google Photos 用アクセストークン */
  const _gPhotoAccessToken = ref(null);

  /** @type {Ref<string|null>} @description BFF サーバから取得した Google People API 用アクセストークン */
  const _gPeopleAccessToken = ref(null);

  /** @type {Ref<string|null>} @description BFF サーバから取得した Google Drive API 用アクセストークン */
  const _gDriveAccessToken = ref(null);

  /** @type {ComputedRef<string>} @description アクセストークン */
  const token = computed(() => _gAccessToken.value ?? '');

  /** @type {ComputedRef<boolean>} @description 現在の認証状態 */
  const isAuthenticated = computed(() => !!_gAccessToken.value);

  /** @type {ComputedRef<string>} @description Google Photos 用アクセストークン */
  const photoToken = computed(() => _gPhotoAccessToken.value ?? '');

  /** @type {ComputedRef<boolean>} @description 写真共有の OAuth 認証が済んでいるか */
  const isPhotoSharingAuthorized = computed(() => !!_gPhotoAccessToken.value);

  /** @type {ComputedRef<string>} @description Google People API 用アクセストークン */
  const peopleToken = computed(() => _gPeopleAccessToken.value ?? '');

  /** @type {ComputedRef<boolean>} @description People API（連絡先連携）の OAuth 認証が済んでいるか */
  const isPeopleApiAuthorized = computed(() => !!_gPeopleAccessToken.value);

  /** @type {ComputedRef<string>} @description Google Drive API 用アクセストークン */
  const driveToken = computed(() => _gDriveAccessToken.value ?? '');

  /** @type {ComputedRef<boolean>} @description Drive API（設定のクラウド同期）の OAuth 認証が済んでいるか */
  const isDriveSyncAuthorized = computed(() => !!_gDriveAccessToken.value);

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
   * Google People API 用アクセストークンを設定する
   * @param {string|null} value アクセストークン
   * @returns {void}
   */
  function setPeopleAccessToken(value) {
    _gPeopleAccessToken.value = value;
  }

  /**
   * Google Drive API 用アクセストークンを設定する
   * @param {string|null} value アクセストークン
   * @returns {void}
   */
  function setDriveAccessToken(value) {
    _gDriveAccessToken.value = value;
  }

  /**
   * 保持しているアクセストークンを全て破棄する
   * @returns {void}
   */
  function clearTokens() {
    _gAccessToken.value = null;
    _gPhotoAccessToken.value = null;
    _gPeopleAccessToken.value = null;
    _gDriveAccessToken.value = null;
  }

  return {
    token,
    isAuthenticated,
    photoToken,
    isPhotoSharingAuthorized,
    peopleToken,
    isPeopleApiAuthorized,
    driveToken,
    isDriveSyncAuthorized,
    setAccessToken,
    setPhotoAccessToken,
    setPeopleAccessToken,
    setDriveAccessToken,
    clearTokens,
  };
});
