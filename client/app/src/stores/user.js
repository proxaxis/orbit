import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import dayjs from '@/services/dayjs';
import { readOffline, writeOffline, USER_SETTINGS_KEY } from '@/services/offline-storage.js';

export const USER_FONT_FAMILIES = Object.freeze({
  SYSTEM: 'system-ui, sans-serif',
  NOTO_SANS_JP: "'Noto Sans JP', sans-serif",
  KOSUGI_MARU: "'Kosugi Maru', sans-serif",
  M_PLUS_ROUNDED: "'M PLUS Rounded 1c', sans-serif",
  SAWARABI_GOTHIC: "'Sawarabi Gothic', sans-serif",
  NOTO_SERIF_JP: "'Noto Serif JP', serif",
});

export const USER_TEXT_SIZE_VALUES = Object.freeze({
  XTRASMALL: Object.freeze({ xxs: '0.5rem', xs: '0.6rem', sm: '0.7rem', md: '0.8rem', lg: '0.9rem', xl: '1rem', xxl: '1.2rem' }),
  SMALL: Object.freeze({ xxs: '0.5625rem', xs: '0.675rem', sm: '0.7875rem', md: '0.9rem', lg: '1.0125rem', xl: '1.125rem', xxl: '1.35rem' }),
  MEDIUM: Object.freeze({ xxs: '0.625rem', xs: '0.75rem', sm: '0.875rem', md: '1rem', lg: '1.125rem', xl: '1.25rem', xxl: '1.5rem' }),
  LARGE: Object.freeze({ xxs: '0.6875rem', xs: '0.825rem', sm: '0.9625rem', md: '1.1rem', lg: '1.2375rem', xl: '1.375rem', xxl: '1.65rem' }),
});

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
   * @param {Error|string|null|unknown} err エラー情報
   * @returns {void}
   */
  function setError(state, err = null) {
    hasError.value = state;
    if (!state) error.value = null;
    else {
      if (err instanceof Error) error.value = err;
      else error.value = new Error(String(err));
    }
  }

  /** @type {Ref<boolean>} @description ユーザーダイアログを表示しているかどうか */
  const isUserDialogOpen = ref(false);

  /** @type {Ref<string>} @description ユーザーダイアログのタイトル */
  const userDialogTitle = ref('User');

  /** @type {Ref<string>} @description ユーザーダイアログのメッセージ */
  const userDialogMessage = ref('');

  /** @type {Ref<'USER' | 'CONFIRM'>} @description ユーザーダイアログの種類 */
  const userDialogType = ref('USER');

  /** @type {((result: boolean) => void)|null} @description confirm の回答待ちコールバック */
  let confirmResolver = null;

  /**
   * ユーザーダイアログを開く
   * @param {{title?: string, message?: string}} [options={}] 表示内容
   * @returns {void}
   */
  function openUserDialog(options = {}) {
    if (confirmResolver) resolveConfirm(false);
    userDialogType.value = 'USER';
    userDialogTitle.value = options.title ?? 'User';
    userDialogMessage.value = options.message ?? '';
    isUserDialogOpen.value = true;
  }

  /**
   * ユーザに確認を求める
   * @param {{title?: string, message?: string}} [options={}] 表示内容
   * @returns {Promise<boolean>} YES なら true、NO または閉じた場合は false
   */
  function confirm(options = {}) {
    if (confirmResolver) confirmResolver(false);

    userDialogType.value = 'CONFIRM';
    userDialogTitle.value = options.title ?? 'Confirm';
    userDialogMessage.value = options.message ?? '';
    isUserDialogOpen.value = true;

    return new Promise((resolve) => {
      confirmResolver = resolve;
    });
  }

  /**
   * confirm の回答を処理する
   * @param {boolean} result 回答
   * @returns {void}
   */
  function resolveConfirm(result) {
    if (confirmResolver) {
      const resolver = confirmResolver;
      confirmResolver = null;
      resolver(result);
    }
    isUserDialogOpen.value = false;
  }

  /**
   * ユーザーダイアログを閉じる
   * @returns {void}
   */
  function closeUserDialog() {
    if (userDialogType.value === 'CONFIRM') resolveConfirm(false);
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

  /** @type {ComputedRef<boolean>} @description オフラインかどうか */
  const isOffline = computed(() => typeof navigator !== 'undefined' && !navigator.onLine);

  /** @type {ComputedRef<string>} @description タイムゾーン（例: Asia/Tokyo）*/
  const timeZone = computed(() => Intl.DateTimeFormat().resolvedOptions().timeZone);

  /** @type {ComputedRef<boolean>} @description アプリがインストールされているかどうか */
  const isAppInstalled = computed(() => typeof window !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller);

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
    saveSettings();

    if (typeof document === 'undefined') return console.warn('applyTheme called in a non-browser environment. DOM manipulation is skipped.');

    // Tailwind CSS 等の 'dark' クラス運用に対応
    if (theme.value === 'DARK') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');

    document.documentElement.setAttribute('data-theme', theme.value.toLowerCase());
  }

  // #endregion

  // #region カレンダー設定処理

  /** @type {Ref<number>} @description 週の開始曜日（デフォルト: 日曜日）*/
  const firstDayOfWeek = ref(0);

  /** @type {Ref<string[]>} @description 曜日ラベル（日曜始まりの配列） */
  const weekdayLabels = ref(['日', '月', '火', '水', '木', '金', '土']);

  /** @type {Ref<string[]>} @description 左ペインに表示するカレンダー ID の順序 */
  const calendarOrder = ref([]);

  /** @type {Ref<string[]>} @description 非表示にするカレンダー ID */
  const hiddenCalendarIds = ref([]);

  /** @type {Ref<number>} @description 左ペインの幅 */
  const navPaneWidth = ref(260);

  /** @type {Ref<number>} @description 右ペインの幅 */
  const subPaneWidth = ref(360);

  /** @type {Ref<{index: number, color: string}[]>} @description 曜日ごとの定休日と文字色の設定 */
  const weekendDays = ref([
    { index: 6, color: '#0a0dd6' },
    { index: 0, color: '#d32f2f' },
  ]);

  /**
   * 色を白方向へ補間
   * @param {string} color HEX形式の色
   * @param {number} ratio 白へ混ぜる割合
   * @returns {string} 補間後の色
   */
  function lightenColor(color, ratio = 0.5) {
    const hex = color.replace(/^#/, '');
    const normalizedHex =
      hex.length === 3
        ? hex
            .split('')
            .map((value) => value + value)
            .join('')
        : hex;
    if (!/^[0-9a-fA-F]{6}$/.test(normalizedHex)) return color;

    const channels = [0, 2, 4].map((offset) => Number.parseInt(normalizedHex.slice(offset, offset + 2), 16));
    const lightenedChannels = channels.map((channel) => Math.round(channel + (255 - channel) * ratio));
    return `#${lightenedChannels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  }

  /** @param {number} dayIndex 曜日番号（日曜: 0 - 土曜: 6） @param {boolean} [isOtherMonth=false] 他月の日付かどうか @returns {string|null} 設定された休日色 */
  function getWeekendColor(dayIndex, isOtherMonth = false) {
    const color = weekendDays.value.find((day) => day.index === dayIndex)?.color ?? null;
    return color && isOtherMonth ? lightenColor(color) : color;
  }

  /** @type {Ref<boolean>} @description 小型カレンダーの表示有無（デフォルト: true）*/
  const useMiniCalendar = ref(true);

  /** @type {Ref<boolean>} @description カレンダーのホイール操作で月を移動するかどうか */
  const useWheelMonthNavigation = ref(true);

  /** @type {Ref<number>} @description 月表示のセルに表示するイベントバーの最大本数 */
  const maxEventBarsPerCell = ref(3);

  /** @type {Ref<'FIXED'|'VARIABLE'>} @description 月表示のカレンダーセル高さ */
  const calendarCellHeightMode = ref('FIXED');

  /** @type {Ref<keyof typeof USER_FONT_FAMILIES>} @description 通常 UI のフォント */
  const uiFontFamily = ref('NOTO_SANS_JP');

  /** @type {Ref<keyof typeof USER_FONT_FAMILIES>} @description カレンダー UI のフォント */
  const calendarFontFamily = ref('NOTO_SANS_JP');

  /** @type {Ref<keyof typeof USER_TEXT_SIZE_VALUES>} @description 通常 UI の文字サイズ */
  const uiTextSize = ref('MEDIUM');

  /** @type {Ref<keyof typeof USER_TEXT_SIZE_VALUES>} @description カレンダー UI の文字サイズ */
  const calendarTextSize = ref('MEDIUM');

  /** 選択中のフォントを CSS 変数へ反映します。 */
  function applyFonts() {
    if (typeof document === 'undefined') return;
    document.documentElement.style.setProperty('--ui-font-family', USER_FONT_FAMILIES[uiFontFamily.value]);
    document.documentElement.style.setProperty('--calendar-font-family', USER_FONT_FAMILIES[calendarFontFamily.value]);
  }

  /** 選択中の通常 UI の文字サイズを CSS 変数へ反映します。 */
  function applyTextSizes() {
    if (typeof document === 'undefined') return;
    const sizes = USER_TEXT_SIZE_VALUES[uiTextSize.value];
    Object.entries(sizes).forEach(([name, value]) => document.documentElement.style.setProperty(`--text-size-${name}`, value));
  }

  /** @type {Ref<string[]>} 最近使ったイベントタイトル */
  const recentEventTitles = ref([]);

  /** @param {string} title 保存するイベントタイトル */
  function rememberEventTitle(title) {
    const normalizedTitle = title.trim();
    if (!normalizedTitle) return;
    recentEventTitles.value = [normalizedTitle, ...recentEventTitles.value.filter((item) => item !== normalizedTitle)].slice(0, 30);
    writeOffline('recent-event-titles', recentEventTitles.value);
  }

  /** @param {string} query @returns {string[]} 入力に一致するタイトル候補 */
  function getRecentEventTitleSuggestions(query) {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return recentEventTitles.value.slice(0, 8);
    return recentEventTitles.value.filter((title) => title.toLowerCase().includes(normalizedQuery)).slice(0, 8);
  }

  async function saveSettings() {
    await writeOffline(USER_SETTINGS_KEY, {
      theme: userSelectedTheme.value,
      firstDayOfWeek: firstDayOfWeek.value,
      weekendDays: weekendDays.value,
      useMiniCalendar: useMiniCalendar.value,
      useWheelMonthNavigation: useWheelMonthNavigation.value,
      maxEventBarsPerCell: maxEventBarsPerCell.value,
      calendarCellHeightMode: calendarCellHeightMode.value,
      uiFontFamily: uiFontFamily.value,
      calendarFontFamily: calendarFontFamily.value,
      uiTextSize: uiTextSize.value,
      calendarTextSize: calendarTextSize.value,
      weekdayLabels: weekdayLabels.value,
      calendarOrder: calendarOrder.value,
      hiddenCalendarIds: hiddenCalendarIds.value,
      navPaneWidth: navPaneWidth.value,
      subPaneWidth: subPaneWidth.value,
    });
  }

  async function loadSettings() {
    try {
      const saved = await readOffline(USER_SETTINGS_KEY, {});
      if (['LIGHT', 'DARK', 'SYSTEM'].includes(saved.theme)) userSelectedTheme.value = saved.theme;
      if (Number.isInteger(saved.firstDayOfWeek) && saved.firstDayOfWeek >= 0 && saved.firstDayOfWeek <= 6) firstDayOfWeek.value = saved.firstDayOfWeek;
      if (Array.isArray(saved.weekendDays)) {
        weekendDays.value = saved.weekendDays.filter((/** @type {{ index?: number, color?: unknown }} */ day) => typeof day.index === 'number' && Number.isInteger(day.index) && day.index >= 0 && day.index <= 6 && typeof day.color === 'string');
      }
      if (typeof saved.useMiniCalendar === 'boolean') useMiniCalendar.value = saved.useMiniCalendar;
      if (typeof saved.useWheelMonthNavigation === 'boolean') useWheelMonthNavigation.value = saved.useWheelMonthNavigation;
      if (Number.isInteger(saved.maxEventBarsPerCell) && saved.maxEventBarsPerCell >= 1 && saved.maxEventBarsPerCell <= 10) {
        maxEventBarsPerCell.value = saved.maxEventBarsPerCell;
      }
      if (saved.calendarCellHeightMode === 'FIXED' || saved.calendarCellHeightMode === 'VARIABLE') {
        calendarCellHeightMode.value = saved.calendarCellHeightMode;
      }
      if (typeof saved.uiFontFamily === 'string' && Object.hasOwn(USER_FONT_FAMILIES, saved.uiFontFamily)) {
        uiFontFamily.value = saved.uiFontFamily;
      }
      if (typeof saved.calendarFontFamily === 'string' && Object.hasOwn(USER_FONT_FAMILIES, saved.calendarFontFamily)) {
        calendarFontFamily.value = saved.calendarFontFamily;
      }
      if (typeof saved.uiTextSize === 'string' && Object.hasOwn(USER_TEXT_SIZE_VALUES, saved.uiTextSize)) {
        uiTextSize.value = saved.uiTextSize;
      }
      if (typeof saved.calendarTextSize === 'string' && Object.hasOwn(USER_TEXT_SIZE_VALUES, saved.calendarTextSize)) {
        calendarTextSize.value = saved.calendarTextSize;
      }
      if (Array.isArray(saved.weekdayLabels) && saved.weekdayLabels.length === 7 && saved.weekdayLabels.every((/** @type {unknown} */ label) => typeof label === 'string')) {
        weekdayLabels.value = saved.weekdayLabels;
      }
      if (Array.isArray(saved.calendarOrder)) calendarOrder.value = saved.calendarOrder.filter((/** @type {unknown} */ id) => typeof id === 'string');
      if (Array.isArray(saved.hiddenCalendarIds)) hiddenCalendarIds.value = [...new Set(saved.hiddenCalendarIds.filter((/** @type {unknown} */ id) => typeof id === 'string'))];
      if (Number.isInteger(saved.navPaneWidth) && saved.navPaneWidth >= 260 && saved.navPaneWidth <= 600) navPaneWidth.value = saved.navPaneWidth;
      if (Number.isInteger(saved.subPaneWidth) && saved.subPaneWidth >= 260 && saved.subPaneWidth <= 600) subPaneWidth.value = saved.subPaneWidth;
    } catch (error) {
      console.warn('Failed to load user settings.', error);
    }
  }

  /** @param {number} dayIndex */
  function setFirstDayOfWeek(dayIndex) {
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) return;
    firstDayOfWeek.value = dayIndex;
    saveSettings();
  }

  /** @param {number} dayIndex @param {string} color */
  function setWeekendDay(dayIndex, color) {
    const existing = weekendDays.value.find((day) => day.index === dayIndex);
    if (existing) weekendDays.value = weekendDays.value.filter((day) => day.index !== dayIndex);
    else weekendDays.value = [...weekendDays.value, { index: dayIndex, color }];
    saveSettings();
  }

  /** @param {number} dayIndex @param {string} color */
  function setWeekendColor(dayIndex, color) {
    const day = weekendDays.value.find((item) => item.index === dayIndex);
    if (!day) return;
    day.color = color;
    saveSettings();
  }

  /** @param {string[]} labels */
  function setWeekdayLabels(labels) {
    if (!Array.isArray(labels) || labels.length !== 7) return;
    weekdayLabels.value = labels.map((label) => String(label).trim().slice(0, 8));
    saveSettings();
  }

  /** @param {string[]} calendarIds */
  function setCalendarOrder(calendarIds) {
    if (!Array.isArray(calendarIds)) return;
    calendarOrder.value = [...new Set(calendarIds.filter((id) => typeof id === 'string'))];
    saveSettings();
  }

  /** @param {string} calendarId @param {boolean} isVisible */
  function setCalendarVisibility(calendarId, isVisible) {
    if (typeof calendarId !== 'string') return;
    hiddenCalendarIds.value = isVisible ? hiddenCalendarIds.value.filter((id) => id !== calendarId) : [...new Set([...hiddenCalendarIds.value, calendarId])];
    saveSettings();
  }

  /** @param {number} width 左ペイン幅 */
  function setNavPaneWidth(width) {
    if (!Number.isInteger(width) || width < 260 || width > 600) return;
    navPaneWidth.value = width;
    saveSettings();
  }

  /** @param {number} width 右ペイン幅 */
  function setSubPaneWidth(width) {
    if (!Number.isInteger(width) || width < 260 || width > 600) return;
    subPaneWidth.value = width;
    saveSettings();
  }

  const settingsReady = loadSettings();
  readOffline('recent-event-titles', []).then((titles) => {
    if (Array.isArray(titles)) recentEventTitles.value = titles.filter((title) => typeof title === 'string').slice(0, 30);
  });

  /** @type {Ref<import('dayjs').Dayjs>} @description 現在表示している日付 */
  const nowUsingDate = ref(dayjs());

  /** 現在表示中の月から前月の1日へ移動 */
  function goPrevMonth() {
    nowUsingDate.value = nowUsingDate.value.subtract(1, 'month').startOf('month');
  }

  /** 現在表示中の月から翌月の1日へ移動 */
  function goNextMonth() {
    nowUsingDate.value = nowUsingDate.value.add(1, 'month').startOf('month');
  }

  /** 現在表示中の月から今日の日付に移動 */
  function goToday() {
    const today = dayjs();
    nowUsingDate.value = today;
    nowSelectedDate.value = today.format('YYYY-MM-DD');
  }

  /** @type {Ref<GoogleApiDateString|null>} @description 選択している日付（形式: YYYY-MM-DD） */
  const nowSelectedDate = ref(dayjs().format('YYYY-MM-DD'));

  /** @param {Dayjs|string|null} date @description 日付を選択する */
  function setNowSelectedDate(date) {
    if (date === null) {
      nowSelectedDate.value = null;
      return;
    }
    nowSelectedDate.value = typeof date === 'string' ? date : date.format('YYYY-MM-DD');
  }

  /** @type {Ref<boolean>} @description カレンダーのセルがクリックされたかどうか */
  const isCellClicked = ref(false);

  /** @type {ComputedRef<{index: number, label: string, isWeekend: boolean, weekendColor: string|null, isFirstDay: boolean}[]>} 曜日を表す文字列の配列（週の開始曜日と定休日を考慮して並んでいる）*/
  const daysMap = computed(() => {
    /** @type {{index: number, label: string, weekendColor: string|null, isWeekend: boolean, isFirstDay: boolean}[]} */
    const template = [
      { index: 0, label: weekdayLabels.value[0], weekendColor: null, isWeekend: false, isFirstDay: false },
      { index: 1, label: weekdayLabels.value[1], weekendColor: null, isWeekend: false, isFirstDay: false },
      { index: 2, label: weekdayLabels.value[2], weekendColor: null, isWeekend: false, isFirstDay: false },
      { index: 3, label: weekdayLabels.value[3], weekendColor: null, isWeekend: false, isFirstDay: false },
      { index: 4, label: weekdayLabels.value[4], weekendColor: null, isWeekend: false, isFirstDay: false },
      { index: 5, label: weekdayLabels.value[5], weekendColor: null, isWeekend: false, isFirstDay: false },
      { index: 6, label: weekdayLabels.value[6], weekendColor: null, isWeekend: false, isFirstDay: false },
    ];

    template.forEach((day) => {
      day.weekendColor = getWeekendColor(day.index);
      day.isWeekend = day.weekendColor !== null;
      day.isFirstDay = firstDayOfWeek.value === day.index;
    });

    const startIndex = firstDayOfWeek.value;
    const arr = [];
    for (let i = 0; i < 7; i++) {
      arr.push(template[(startIndex + i) % 7]);
    }
    return arr;
  });

  /** @type {Ref<{eid: string, cid: string}|null>} @description 現在選択されているイベント */
  const nowSelectedEvent = ref(null);

  /** @param {{eid: string, cid: string}|null} event @description 選択するイベント情報 */
  function setNowSelectedEvent(event) {
    if (event === null) return (nowSelectedEvent.value = null);
    nowSelectedEvent.value = { eid: event.eid, cid: event.cid };
  }

  /** @param {string} text @description クリップボードにテキストをコピー */
  function writeClipboard(text) {
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      setError(true, new Error('Clipboard API is not available in this environment.'));
      return;
    }
    navigator.clipboard.writeText(text).catch((err) => setError(true, err));
  }

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
    userDialogType,
    userSelectedTheme,
    isSystemPrefersDark,
    theme,
    firstDayOfWeek,
    weekdayLabels,
    calendarOrder,
    hiddenCalendarIds,
    navPaneWidth,
    subPaneWidth,
    weekendDays,
    getWeekendColor,
    useMiniCalendar,
    useWheelMonthNavigation,
    maxEventBarsPerCell,
    calendarCellHeightMode,
    uiFontFamily,
    calendarFontFamily,
    uiTextSize,
    calendarTextSize,
    recentEventTitles,
    rememberEventTitle,
    getRecentEventTitleSuggestions,
    winInnerWidth,
    device,
    isMobile,
    isTablet,
    isDesktop,
    nowUsingDate,
    nowSelectedDate,
    isCellClicked,
    daysMap,
    nowSelectedEvent,
    isOffline,
    timeZone,
    goPrevMonth,
    goNextMonth,
    goToday,
    setNowSelectedDate,
    setLoading,
    setError,
    setNowSelectedEvent,
    saveSettings,
    applyFonts,
    applyTextSizes,
    settingsReady,
    loadSettings,
    setFirstDayOfWeek,
    setWeekendDay,
    setWeekendColor,
    setWeekdayLabels,
    setCalendarOrder,
    setCalendarVisibility,
    setNavPaneWidth,
    setSubPaneWidth,
    openUserDialog,
    confirm,
    resolveConfirm,
    closeUserDialog,
    applyTheme,
    checkUserEnvironment,
    isAppInstalled,
    writeClipboard,
  };
});
