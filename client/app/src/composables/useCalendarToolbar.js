import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import dayjs from '@/services/dayjs.js';
import { useUserStore } from '@/stores/user.js';

/**
 * 月表示・週表示カレンダーのヘッダーツールバー共通ロジック。
 * isCompactToolbar や展開時の右ボタン幅はモジュール共有で、タイトル幅は両ビュー分を
 * 計測して広い方で判定するため、ビューを切り替えてもコンパクト表示の有無が変わらない。
 */

/** @type {Ref<boolean>} ツールバーが収まらず右ボタン群をメニューに畳む状態か（月・週ビューで共有） */
const isCompactToolbar = ref(false);
/** 展開時の右ボタン群の自然幅（コンパクト表示中も判定基準として保持する。両ビューでボタン構成が同じため共有） */
let expandedRightToolbarWidth = 0;

/**
 * タイトル文字列が指定フォントで描画されたときの自然幅を計測する。
 * h1 を複製して非表示の計測用要素にする（scoped スタイルの属性セレクタを引き継ぐため cloneNode を使う）
 * @param {HTMLElement} title ビュー内の実際の h1 要素
 * @param {string} text 計測するタイトル文字列
 * @param {string} fontFamily そのタイトルが所属するビューのフォント
 * @param {string} fontSize そのタイトルが所属するビューのフォントサイズ
 * @returns {number} テキストの自然幅(px)
 */
function measureTitleWidth(title, text, fontFamily, fontSize) {
  const probe = /** @type {HTMLElement} */ (title.cloneNode(false));
  probe.textContent = text;
  probe.setAttribute('aria-hidden', 'true');
  Object.assign(probe.style, {
    position: 'absolute',
    visibility: 'hidden',
    pointerEvents: 'none',
    fontFamily,
    fontSize,
  });
  title.parentElement?.appendChild(probe);
  const range = document.createRange();
  range.selectNodeContents(probe);
  const width = range.getBoundingClientRect().width;
  probe.remove();
  return width;
}

/**
 * @param {Ref<HTMLElement|null>} rfToolbar ツールバーの header 要素への参照
 */
export function useCalendarToolbar(rfToolbar) {
  const userStore = useUserStore();
  let toolbarObserver = null;

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
  const monthTitle = computed(() => {
    const now = dayjs();
    const year = userStore.nowUsingDate.year();
    let relative = '';
    if (year === now.year() - 1) relative = '去年';
    else if (year === now.year() + 1) relative = '来年';
    else if (year < now.year() - 1) relative = `(${now.year()}-) ${now.year() - year}年前`;
    else if (year > now.year() + 1) relative = `(${now.year()}+) ${year - now.year()}年後`;
    return [relative, userStore.nowUsingDate.format('YYYY年 M月')].filter(Boolean).join(' ');
  });

  /**
   * ツールバーの内容が表示幅に収まるかを実測し、収まらない場合はコンパクト表示に切り替える。
   * 展開時は3等分グリッドのため、合計幅に加えてタイトルが中央列に収まることも条件にする。
   * ビューごとにタイトル文・フォントが異なるため、両ビューのタイトルをそれぞれのフォント
   * 設定（月: --text-size-xl / --ui-font-family、週: --text-size-lg / --calendar-font-family、
   * いずれも 768px 未満では1段階小さい）で計測し、広い方を判定に使う。
   */
  function updateToolbarLayout() {
    const toolbar = rfToolbar.value;
    if (!toolbar || toolbar.clientWidth === 0) return;
    const left = toolbar.querySelector('.toolbar-left');
    const title = toolbar.querySelector('h1');
    const right = toolbar.querySelector('.toolbar-right');
    if (!left || !(title instanceof HTMLElement) || !right) return;
    if (!isCompactToolbar.value) expandedRightToolbarWidth = right.scrollWidth;
    const narrow = userStore.isMobile;
    const titleWidth = Math.max(measureTitleWidth(title, monthTitle.value, 'var(--ui-font-family)', narrow ? 'var(--text-size-lg)' : 'var(--text-size-xl)'), measureTitleWidth(title, weekTitle.value, 'var(--calendar-font-family)', narrow ? 'var(--text-size-md)' : 'var(--text-size-lg)'));
    const style = getComputedStyle(toolbar);
    /** @type {number} ツールバー左右の合計 padding */
    const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
    const needed = left.scrollWidth + titleWidth + expandedRightToolbarWidth + padding + 8;
    /** @type {number} ツールバーを 3 等分した幅 */
    const thirdWidth = (toolbar.clientWidth - padding) / 3;
    isCompactToolbar.value = needed > toolbar.clientWidth || titleWidth > thirdWidth + 1;
  }

  // タイトル文字数・フォントが変わると必要幅が変わるため再計測する
  watch([() => userStore.nowUsingDate, () => userStore.firstDayOfWeek, () => userStore.calendarTextSize, () => userStore.uiTextSize], async () => {
    await nextTick();
    updateToolbarLayout();
  });

  onMounted(() => {
    if (typeof ResizeObserver !== 'undefined' && rfToolbar.value) {
      toolbarObserver = new ResizeObserver(() => updateToolbarLayout());
      toolbarObserver.observe(rfToolbar.value);
    }
    updateToolbarLayout();
  });

  onUnmounted(() => {
    toolbarObserver?.disconnect();
  });

  return { isCompactToolbar, weekStart, weekTitle, monthTitle };
}
