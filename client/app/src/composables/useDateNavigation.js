/**
 * 選択日の移動（スワイプ・矢印キー）の共有ロジック。
 * 選択日の変更にあわせて、表示中の月/週も選択日へ追従させる。
 */
import { onMounted, onUnmounted } from 'vue';
import { toDayjs } from '@/services/dayjs.js';
import { useUserStore } from '@/stores/user.js';

/**
 * 選択中の日付をずらす。選択日がなければ表示中の日付を基準にする。
 * @param {number} amount 移動量（負なら過去方向）
 * @param {'day'|'week'} [unit='day'] 移動単位
 * @returns {void}
 */
export function moveSelectedDate(amount, unit = 'day') {
  const userStore = useUserStore();
  const base = userStore.nowSelectedDate ? toDayjs(userStore.nowSelectedDate) : userStore.nowUsingDate;
  const next = base.add(amount, unit);
  userStore.setNowSelectedDate(next);
  // 選択日が表示範囲から外れたときに備えて、表示中の月/週も追従させる
  if (userStore.mainCalendarView === 'WEEK') userStore.nowUsingDate = next;
  else userStore.setNowUsingDate(next);
}

/**
 * デスクトップ表示で矢印キーによる選択日の移動を有効化する。
 * 左右で前後1日、上下で前後1週移動する。入力中のフォームでは無効。
 * @returns {void}
 */
export function useArrowDateNavigation() {
  const userStore = useUserStore();

  /** @param {KeyboardEvent} evt キー押下イベント */
  const onKeydown = (evt) => {
    if (userStore.isMobile || userStore.isTablet) return;
    if (evt.ctrlKey || evt.metaKey || evt.altKey) return;
    const el = evt.target;
    if (el instanceof HTMLElement && el.closest('input, textarea, select, [contenteditable="true"], dialog')) return;
    switch (evt.key) {
      case 'ArrowLeft':
        moveSelectedDate(-1, 'day');
        break;
      case 'ArrowRight':
        moveSelectedDate(1, 'day');
        break;
      case 'ArrowUp':
        moveSelectedDate(-1, 'week');
        break;
      case 'ArrowDown':
        moveSelectedDate(1, 'week');
        break;
      default:
        return;
    }
    evt.preventDefault();
  };

  onMounted(() => window.addEventListener('keydown', onKeydown));
  onUnmounted(() => window.removeEventListener('keydown', onKeydown));
}
