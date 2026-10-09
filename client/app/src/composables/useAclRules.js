/**
 * カレンダーの共有設定（ACL）管理ワークフローを担うコンポーザブル。
 * ルール一覧の取得・追加・権限変更・削除と画面の状態管理をここに集約する。
 */
import { ref } from 'vue';
import { useCalendars } from '@/composables/useCalendars.js';
import { useAuthStore } from '@/stores/auth.js';
import { useUserStore } from '@/stores/user.js';

/**
 * 共有設定（ACL）管理を提供するコンポーザブル
 * @returns {Object} ACL 管理の状態と操作関数群
 */
/** @type {Ref<GoogleCalendarAclRule[]>} 現在の共有ルール（画面内で共有するモジュール状態） */
const aclRules = ref([]);
/** @type {Ref<string|null>} 保存中の共有ルール ID */
const savingRuleId = ref(null);

export function useAclRules() {
  const calendars = useCalendars();
  const authStore = useAuthStore();
  const userStore = useUserStore();

  /**
   * 指定カレンダーの共有ルール一覧を読み込む
   * @param {string} calendarId カレンダー ID
   * @returns {Promise<void>}
   */
  async function loadRules(calendarId) {
    aclRules.value = [];
    if (!calendarId || !authStore.token) return;

    userStore.setLoading(true, '共有設定を読み込んでいます...');
    try {
      aclRules.value = await calendars.listAclRules(calendarId);
    } catch (error) {
      userStore.setError(true, error);
    } finally {
      userStore.setLoading(false);
    }
  }

  /**
   * 共有ルールを追加する
   * @param {string} calendarId カレンダー ID
   * @param {{scopeType: string, value: string, role: string}} input フォームの入力内容
   * @returns {Promise<boolean>} 追加に成功したかどうか
   */
  async function addRule(calendarId, input) {
    if (input.scopeType !== 'default' && !input.value.trim()) {
      userStore.showToast('メールアドレスまたはドメインを入力してください。');
      return false;
    }
    // owner 権限は ACL では付与できない（カレンダー作成者のみが持つ）。誤って他ユーザーを所有者にしないためのガード
    if (input.role === 'owner') {
      userStore.showToast('所有者権限は共有設定から付与できません。');
      return false;
    }
    if (!calendarId) return false;

    userStore.setLoading(true, '共有設定を保存しています...');
    try {
      /** @type {Pick<GoogleCalendarAclRule, 'role'|'scope'>} */
      const body = {
        scope: { type: /** @type {GoogleCalendarAclScope['type']} */ (input.scopeType), ...(input.scopeType === 'default' ? {} : { value: input.value.trim() }) },
        role: /** @type {GoogleCalendarAclRule['role']} */ (input.role),
      };
      const created = await calendars.addAclRule(calendarId, body);
      if (created) aclRules.value = [...aclRules.value, created];
      return true;
    } catch (error) {
      userStore.setError(true, error);
      return false;
    } finally {
      userStore.setLoading(false);
    }
  }

  /**
   * 共有ルールの権限を更新する
   * @param {string} calendarId カレンダー ID
   * @param {GoogleCalendarAclRule} rule 対象ルール
   * @param {GoogleCalendarAclRule['role']} role 新しい権限
   * @returns {Promise<void>}
   */
  async function updateRule(calendarId, rule, role) {
    if (rule.role === role || !rule.id) return;
    // owner への権限変更は許可しない（共有相手を誤って所有者にしないためのガード）
    if (role === 'owner') {
      userStore.showToast('所有者権限への変更はできません。');
      return;
    }
    savingRuleId.value = rule.id;
    try {
      const updated = await calendars.updateAclRule(calendarId, rule.id, { role });
      const index = aclRules.value.findIndex((item) => item.id === rule.id);
      if (updated && index !== -1) aclRules.value[index] = updated;
      else if (index !== -1) aclRules.value[index] = { ...rule, role };
    } catch (error) {
      userStore.setError(true, error);
    } finally {
      savingRuleId.value = null;
    }
  }

  /**
   * 共有ルールを確認のうえ削除する
   * @param {string} calendarId カレンダー ID
   * @param {GoogleCalendarAclRule} rule 対象ルール
   * @param {string} scopeLabelText 確認ダイアログに表示する共有対象の説明
   * @returns {Promise<void>}
   */
  async function removeRule(calendarId, rule, scopeLabelText) {
    if (!rule.id) return;
    if (!(await userStore.confirm({ title: '共有設定を削除', message: `${scopeLabelText} の共有設定を削除しますか？` }))) return;
    savingRuleId.value = rule.id;
    try {
      await calendars.removeAclRule(calendarId, rule.id);
      aclRules.value = aclRules.value.filter((item) => item.id !== rule.id);
    } catch (error) {
      userStore.setError(true, error);
    } finally {
      savingRuleId.value = null;
    }
  }

  return {
    aclRules,
    savingRuleId,
    loadRules,
    addRule,
    updateRule,
    removeRule,
  };
}
