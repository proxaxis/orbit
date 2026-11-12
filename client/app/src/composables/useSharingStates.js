/**
 * カレンダーごとの公開状態（private / shared / unknown）を判定するコンポーザブル。
 * ACL 一覧から所有者以外の共有ルールの有無を算出する。
 */
import { ref } from 'vue';
import { useCalendars } from '@/composables/useCalendars.js';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';

/**
 * ACL 主体の値を比較用に正規化する
 * @param {unknown} value ACL 主体の値
 * @returns {string} 比較用に正規化した値
 */
function normalizePrincipal(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * カレンダー公開状態の判定を提供するコンポーザブル
 * @returns {Object} 共有状態の参照と読み込み関数
 */
export function useSharingStates() {
  const calendars = useCalendars();
  const authStore = useAuthStore();
  const calendarStore = useCalendarStore();

  /** @type {Ref<Record<string, 'private'|'shared'|'unknown'>>} カレンダーの共有状態 */
  const sharingStates = ref({});

  /**
   * カレンダーの ACL を取得し、所有者以外の共有ルールがあるか判定する。
   * 対象カレンダー分の acl.list は BFF のバッチリクエストで 1 ジョブにまとめて送信する。
   * @returns {Promise<void>}
   */
  async function loadSharingStates() {
    if (!authStore.token || !calendarStore.list.length) return;
    const primaryCalendar = calendarStore.list.find((calendar) => calendar.primary);
    const knownOwnerPrincipals = new Set([normalizePrincipal(primaryCalendar?.id), normalizePrincipal(primaryCalendar ? /** @type {{ dataOwner?: string }} */ (/** @type {unknown} */ (primaryCalendar)).dataOwner : undefined)].filter(Boolean));
    const targets = calendarStore.list.filter((calendar) => calendar.accessRole === 'owner' || calendar.primary);
    const rulesList = await calendars.listAclRulesBatch(targets.map((calendar) => calendar.id));
    const entries = calendarStore.list.map((calendar) => {
      const index = targets.indexOf(calendar);
      if (index === -1) return [calendar.id, 'unknown'];
      const rules = rulesList[index];
      if (!rules) return [calendar.id, 'unknown'];
      const systemPrincipals = new Set([normalizePrincipal(calendar.id), normalizePrincipal(/** @type {{ dataOwner?: string }} */ (/** @type {unknown} */ (calendar)).dataOwner)]);
      const dataOwner = normalizePrincipal(/** @type {{ dataOwner?: string }} */ (/** @type {unknown} */ (calendar)).dataOwner);
      const belongsToAnotherOwner = Boolean(dataOwner && knownOwnerPrincipals.size && !knownOwnerPrincipals.has(dataOwner));
      const relevantRules = rules.filter((rule) => !systemPrincipals.has(normalizePrincipal(rule.scope.value)));
      const ownerCount = relevantRules.filter((rule) => rule.role === 'owner').length;
      const hasSharingRule = belongsToAnotherOwner || ownerCount > 1 || relevantRules.some((rule) => rule.role !== 'owner' && ['user', 'group', 'domain'].includes(rule.scope.type));
      return [calendar.id, hasSharingRule ? 'shared' : 'private'];
    });
    sharingStates.value = Object.fromEntries(entries);
  }

  return { sharingStates, loadSharingStates };
}
