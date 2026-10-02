import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { toDayjs } from '@/services/dayjs';

/**
 * @typedef {'LIGHT' | 'DARK' | 'SYSTEM'} UserAvailableTheme ユーザが選択可能なテーマ設定
 * @typedef {'LIGHT' | 'DARK'} ResolvedTheme 実際に画面へ適用される解決済みテーマ
 * @typedef {'MOBILE' | 'TABLET' | 'DESKTOP'} DeviceType 画面幅に基づくデバイス種別
 */

export const useUserStore = defineStore('user', () => {
  // #region ユーティリティ処理

  /** @type {Ref<boolean>} @description データの読み込み中かどうか */
  const isLoading = ref(false);

  /** @type {Ref<string>} @description ローディング時のメッセージ */
  const loadingMessage = ref('');

  /** ローディング状態を設定
   * @param {boolean} state ローディング状態フラグ
   * @param {string} [message=''] ローディングメッセージ
   * @returns {void}
   */
  function setLoading(state, message = '') {
    isLoading.value = state;
    loadingMessage.value = message;
  }

  /** @type {Ref<boolean>} @description エラーが発生しているかどうか */
  const hasError = ref(false);

  /** @type {Ref<Error|null>} @description エラー情報 */
  const error = ref(null);

  /**
   * エラー情報を設定
   * @param {boolean} state エラー状態フラグ
   * @param {Error|null} err エラー情報
   * @returns {void}
   */
  function setError(state, err = null) {
    hasError.value = state;
    error.value = err;
  }

  /** @type {Ref<boolean>} @description ユーザーダイアログを表示しているかどうか */
  const isUserDialogOpen = ref(false);

  /** @type {Ref<string>} @description ユーザーダイアログのタイトル */
  const userDialogTitle = ref('ユーザー');

  /** @type {Ref<string>} @description ユーザーダイアログのメッセージ */
  const userDialogMessage = ref('');

  /**
   * ユーザーダイアログを開く
   * @param {{title?: string, message?: string}} [options={}] 表示内容
   * @returns {void}
   */
  function openUserDialog(options = {}) {
    userDialogTitle.value = options.title ?? 'ユーザー';
    userDialogMessage.value = options.message ?? '';
    isUserDialogOpen.value = true;
  }

  /**
   * ユーザーダイアログを閉じる
   * @returns {void}
   */
  function closeUserDialog() {
    isUserDialogOpen.value = false;
  }

  /**
   * 必要な環境が揃っているかをチェックする
   * @returns {boolean} 環境が揃っている場合は true、そうでない場合は false を返す
   */
  const checkUserEnvironment = () => {
    if (typeof window === 'undefined') {
      console.warn('User store is being used in a non-browser environment. Some features may not work as expected.');
      return false;
    }

    return true;
  };

  // #endregion

  // #region テーマ設定処理

  /** @type {Ref<UserAvailableTheme>} @description ユーザ設定のテーマ */
  const userSelectedTheme = ref('SYSTEM');

  /** @type {Ref<boolean>} @description システムのテーマ設定がダークモードかどうか */
  const isSystemPrefersDark = ref(typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)').matches : false);

  /** @type {ComputedRef<ResolvedTheme>} @description 実際に画面へ適用されるテーマ */
  const theme = computed(() => {
    if (userSelectedTheme.value === 'SYSTEM') return isSystemPrefersDark.value ? 'DARK' : 'LIGHT';
    return userSelectedTheme.value;
  });

  /**
   * テーマを更新して DOM に反映する
   * @param {UserAvailableTheme} newTheme 適用するテーマ
   * @returns {void}
   */
  function applyTheme(newTheme) {
    userSelectedTheme.value = newTheme;

    if (typeof document === 'undefined') return console.warn('applyTheme called in a non-browser environment. DOM manipulation is skipped.');

    // Tailwind CSS 等の 'dark' クラス運用に対応
    if (theme.value === 'DARK') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');

    document.documentElement.setAttribute('data-theme', theme.value);
  }

  // #endregion

  // #region カレンダーとスケジュール設定処理

  /** @type {Ref<number>} @description 週の開始曜日（デフォルト: 日曜日）*/
  const firstDayOfWeek = ref(0);

  /** @type {Ref<number[]>} @description 定休日と週末の設定（デフォルト: 日曜日と土曜日）*/
  const weekendDays = ref([6, 0]);

  /** @type {Ref<boolean>} @description 小型カレンダーの表示有無（デフォルト: true）*/
  const useMiniCalendar = ref(true);

  /** @type {Ref<Date>} @description 現在表示している日付 */
  const nowUsingDate = ref(new Date());

  /** 現在表示中の月から前月の1日へ移動 */
  function goPrevMonth() {
    nowUsingDate.value = new Date(nowUsingDate.value.getFullYear(), nowUsingDate.value.getMonth() - 1, 1);
  }

  /** 現在表示中の月から翌月の1日へ移動 */
  function goNextMonth() {
    nowUsingDate.value = new Date(nowUsingDate.value.getFullYear(), nowUsingDate.value.getMonth() + 1, 1);
  }

  /** 現在表示中の月から今日の日付に移動 */
  function goToday() {
    const now = new Date();
    nowUsingDate.value = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  /** @type {Ref<string|null>} @description 選択している日付（形式: YYYY-MM-DD） */
  const nowSelectedDate = ref(toDayjs(new Date()).format('YYYY-MM-DD'));

  /** @param {Date} date @description 日付を選択する */
  function setNowSelectedDate(date) {
    nowSelectedDate.value = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : null;
  }

  /** @type {Ref<boolean>} @description カレンダーのセルがクリックされたかどうか */
  const isCellClicked = ref(false);

  /** @type {ComputedRef<{index: number, label: string, isWeekend: boolean, isFirstDay: boolean}[]>} 曜日を表す文字列の配列（週の開始曜日と定休日を考慮して並んでいる）*/
  const daysMap = computed(() => {
    const template = [
      { index: 0, label: '日', isWeekend: weekendDays.value.includes(0), isFirstDay: firstDayOfWeek.value === 0 },
      { index: 1, label: '月', isWeekend: weekendDays.value.includes(1), isFirstDay: firstDayOfWeek.value === 1 },
      { index: 2, label: '火', isWeekend: weekendDays.value.includes(2), isFirstDay: firstDayOfWeek.value === 2 },
      { index: 3, label: '水', isWeekend: weekendDays.value.includes(3), isFirstDay: firstDayOfWeek.value === 3 },
      { index: 4, label: '木', isWeekend: weekendDays.value.includes(4), isFirstDay: firstDayOfWeek.value === 4 },
      { index: 5, label: '金', isWeekend: weekendDays.value.includes(5), isFirstDay: firstDayOfWeek.value === 5 },
      { index: 6, label: '土', isWeekend: weekendDays.value.includes(6), isFirstDay: firstDayOfWeek.value === 6 },
    ];

    const startIndex = firstDayOfWeek.value;
    const arr = [];
    for (let i = 0; i < 7; i++) {
      arr.push(template[(startIndex + i) % 7]);
    }
    return arr;
  });

  /** @type {Ref<{month: string, full: string}>} @description 画面表示に使用する日付フォーマット（dayjs フォーマット）*/
  const dateFormat = ref({
    month: 'YYYY-MM',
    full: 'YYYY-MM-DD',
  });

  // #endregion

  // #region 画面サイズ判定処理

  /** @type {Ref<number>} @description 現在のウィンドウ幅 */
  const winInnerWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1024);

  /** @type {ComputedRef<DeviceType>} @description 現在のデバイス種別 */
  const device = computed(() => {
    if (winInnerWidth.value < 768) return 'MOBILE';
    if (winInnerWidth.value < 1024) return 'TABLET';
    return 'DESKTOP';
  });

  /** @type {ComputedRef<boolean>} @description モバイル表示判定 ( < 768px) */
  const isMobile = computed(() => device.value === 'MOBILE');

  /** @type {ComputedRef<boolean>} @description タブレット表示判定 (768px <= 幅 < 1024px) */
  const isTablet = computed(() => device.value === 'TABLET');

  /** @type {ComputedRef<boolean>} @description デスクトップ表示判定 (>= 1024px) */
  const isDesktop = computed(() => device.value === 'DESKTOP');

  // #endregion

  return {
    isLoading,
    loadingMessage,
    error,
    hasError,
    isUserDialogOpen,
    userDialogTitle,
    userDialogMessage,
    userSelectedTheme,
    isSystemPrefersDark,
    theme,
    firstDayOfWeek,
    weekendDays,
    useMiniCalendar,
    winInnerWidth,
    device,
    isMobile,
    isTablet,
    isDesktop,
    nowUsingDate,
    nowSelectedDate,
    isCellClicked,
    daysMap,
    dateFormat,
    goPrevMonth,
    goNextMonth,
    goToday,
    setNowSelectedDate,
    setLoading,
    setError,
    openUserDialog,
    closeUserDialog,
    applyTheme,
    checkUserEnvironment,
  };
});
