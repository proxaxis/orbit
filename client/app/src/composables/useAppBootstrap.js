/**
 * アプリ起動時の初期化と Service Worker からのメッセージ処理を担うコンポーザブル。
 * 設定の読み込み、テーマ適用、認証トークン取得、バックグラウンド処理の開始をここに集約する。
 */
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';
import { useAuth, initApiClients } from '@/composables/useAuth.js';
import { useCalendars } from '@/composables/useCalendars.js';
import { initEventSync } from '@/composables/useEvents.js';
import { initEventNotifications, rescheduleNotifications } from '@/composables/useNotifications.js';
import { initRemoteChangeSync, checkRemoteChanges } from '@/composables/useRemoteSync.js';
import { initShareSync } from '@/composables/useShare.js';
import { useDriveSync } from '@/composables/useDriveSync.js';
import { scheduleQuickAddWarmup } from '@/composables/useQuickAdd.js';
import { useTheme } from '@/composables/useTheme.js';

/**
 * アプリの初期化と破棄処理を提供するコンポーザブル
 * @returns {{start: () => Promise<void>, stop: () => void}} 開始・停止関数
 */
export function useAppBootstrap() {
  const router = useRouter();
  const authStore = useAuthStore();
  const userStore = useUserStore();
  const auth = useAuth();
  const calendars = useCalendars();
  const theme = useTheme();

  /** @type {MediaQueryList|null} システムテーマの変更を監視するためのオブジェクト */
  let mQueryList = null;

  /** @type {MediaQueryList|null} タッチ入力の有無を監視するためのオブジェクト */
  let mCoarsePointerQuery = null;

  /** ウィンドウリサイズ時のイベントハンドラ */
  function handleWindowResize() {
    userStore.winInnerWidth = window.innerWidth;
  }

  /**
   * システムテーマ変更時のイベントハンドラ
   * @param {MediaQueryListEvent} evt メディアクエリの変更イベント
   * @returns {void}
   */
  function handleSystemThemeChange(evt) {
    userStore.isSystemPrefersDark = evt.matches;
    if (userStore.userSelectedTheme === 'SYSTEM') theme.applyTheme('SYSTEM');
  }

  /**
   * ポインタ種別（タッチ / マウス）変更時のイベントハンドラ
   * @param {MediaQueryListEvent} evt メディアクエリの変更イベント
   * @returns {void}
   */
  function handleCoarsePointerChange(evt) {
    userStore.hasCoarsePointer = evt.matches;
  }

  /**
   * Service Worker からのメッセージを処理する。
   * バックグラウンドで実行された同期の結果をページ側へ反映する。
   * @param {MessageEvent} event Service Worker からのメッセージ
   * @returns {void}
   */
  function handleServiceWorkerMessage(event) {
    if (event.data?.type === 'orbit-open-event') {
      // 通知タップ時に Service Worker から送られるイベント詳細への遷移要求
      const { eid, cid } = event.data;
      if (eid && cid) {
        userStore.setNowSelectedEvent({ eid, cid });
        router.push({ name: 'EventDetail' });
      }
    } else if (event.data?.type === 'orbit-queue-synced') {
      // バックグラウンドでイベントキューが処理された → 表示中の月を再同期
      calendars.loadCalendars();
    } else if (event.data?.type === 'orbit-shares-changed') {
      // バックグラウンドで共有同期が行われた → 共有条件を再読み込み
      initShareSync();
    } else if (event.data?.type === 'orbit-remote-changed') {
      // プッシュ受信などバックグラウンドでの起き上がり → リモート変更を即時確認
      checkRemoteChanges(true);
    } else if (event.data?.type === 'orbit-push-resubscribe') {
      // プッシュ購読が更新された → 通知スケジュールを再送して購読を張り直す
      rescheduleNotifications();
    } else if (event.data?.type === 'orbit-token-expired') {
      // SW 側のトークンが古い → ページ側で再取得してキャッシュへ保存し直す
      auth.fetchToken();
    }
  }

  /**
   * アプリの初期化を実行する。コンポーネントのマウント時に一度だけ呼ぶ。
   * @returns {Promise<void>}
   */
  async function start() {
    if (!userStore.checkUserEnvironment()) return;

    await userStore.settingsReady;

    // ユーザ設定の適用
    theme.applyAllAppearance();
    window.addEventListener('resize', handleWindowResize);
    if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
    initApiClients();
    initEventNotifications();
    initShareSync();
    initEventSync();
    initRemoteChangeSync();
    // PWA インストール済みなら自然言語登録用の LLM をバックグラウンドで事前キャッシュする
    scheduleQuickAddWarmup();
    mQueryList = window.matchMedia('(prefers-color-scheme: dark)');
    mQueryList.addEventListener('change', handleSystemThemeChange);
    mCoarsePointerQuery = window.matchMedia('(hover: none) and (pointer: coarse)');
    userStore.hasCoarsePointer = mCoarsePointerQuery.matches;
    mCoarsePointerQuery.addEventListener('change', handleCoarsePointerChange);

    // Google ログイン状態の確認とトークンの取得（オフライン起動時はスキップしてキャッシュを使う）
    const token = userStore.isOffline ? null : await auth.fetchToken();
    // キャッシュ済みカレンダーを先に読み込む。トークン有無に関わらず呼び、
    // オフライン・未認証時は loadCalendars 側がキャッシュのみで早期 return する
    await calendars.loadCalendars();
    if (token) {
      if (userStore.usePhotoSharing) auth.ensurePhotoToken();
      if (userStore.usePeopleApi) auth.ensurePeopleToken();
      // Drive 同期: リモートを取り込んでから設定変更の監視を開始する
      if (userStore.useDriveSync) useDriveSync().initDriveSync();
      // 起動時に他デバイスでの変更をバックグラウンド確認する（UI はブロックしない）
      checkRemoteChanges();
    }
    // オフラインではログインを求めない（オンライン復帰時にトークンは再取得される）
    if (!token && !authStore.isAuthenticated && !userStore.isOffline) {
      userStore.openUserDialog({
        title: 'Login Required',
        message: 'Login with your Google account to synchronize your calendar.',
      });
    }
  }

  /**
   * 登録したイベントリスナーを解除する。コンポーネントのアンマウント時に呼ぶ。
   * @returns {void}
   */
  function stop() {
    if (!userStore.checkUserEnvironment()) return;
    window.removeEventListener('resize', handleWindowResize);
    if ('serviceWorker' in navigator) navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
    if (mQueryList) mQueryList.removeEventListener('change', handleSystemThemeChange);
    if (mCoarsePointerQuery) mCoarsePointerQuery.removeEventListener('change', handleCoarsePointerChange);
  }

  return { start, stop };
}
