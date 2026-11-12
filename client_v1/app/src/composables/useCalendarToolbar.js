import { computed } from 'vue';
import dayjs from '@/services/dayjs.js';
import { useUserStore } from '@/stores/user.js';

/**
 * 月表示・週表示カレンダーのヘッダーツールバー共通ロジック。
 * モバイル・タブレットでは右ボタン群をメニューに畳むコンパクト表示に、
 * デスクトップでは展開表示にする。
 */

/**
 * 月タイトルの文字列を生成する（現在年との相対表記つき）
 * @param {Dayjs} date 対象月内の日付
 * @returns {string}
 */
export function formatMonthTitle(date) {
  const now = dayjs();
  const year = date.year();
  let relative = '';
  if (year === now.year() - 1) relative = '去年';
  else if (year === now.year() + 1) relative = '来年';
  else if (year < now.year() - 1) relative = `(${now.year()}-) ${now.year() - year}年前`;
  else if (year > now.year() + 1) relative = `(${now.year()}+) ${year - now.year()}年後`;
  return [relative, date.format('YYYY年 M月')].filter(Boolean).join(' ');
}

export function useCalendarToolbar() {
  const userStore = useUserStore();

  /** @type {ComputedRef<boolean>} 右ボタン群をメニューに畳むコンパクト表示か（モバイル・タブレットで一律畳む） */
  const isCompactToolbar = computed(() => !userStore.isDesktop);

  /** @type {ComputedRef<Dayjs>} 表示中の週の開始日（週の開始曜日設定を考慮） */
  const weekStart = computed(() => {
    const base = userStore.nowUsingDate.startOf('day');
    return base.subtract((base.day() - userStore.firstDayOfWeek + 7) % 7, 'day');
  });

  /** @type {ComputedRef<string>} 週表示ツールバーに表示する週の範囲テキスト */
  const weekTitle = computed(() => {
    const start = weekStart.value;
    const end = weekStart.value.add(6, 'day');
    if (start.isSame(end, 'month')) return `${start.format('YYYY年 M月 D日')} – ${end.format('D日')}`;
    if (start.isSame(end, 'year')) return `${start.format('YYYY年 M月 D日')} – ${end.format('M月 D日')}`;
    return `${start.format('YYYY年 M月 D日')} – ${end.format('YYYY年 M月 D日')}`;
  });

  /** @type {ComputedRef<string>} 月表示ツールバーのタイトル（相対年テキスト付き） */
  const monthTitle = computed(() => formatMonthTitle(userStore.nowUsingDate));

  return { isCompactToolbar, weekStart, weekTitle, monthTitle };
}
