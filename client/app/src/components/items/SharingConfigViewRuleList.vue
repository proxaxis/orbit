<script setup>
/**
 * SharingConfigView の共有中ルール一覧。
 * 既存の ACL ルールの表示・権限変更・削除を担う。
 */
import { useAclRules } from '@/composables/useAclRules.js';
import IconTrash from '@/components/icons/IconTrash.vue';

const props = defineProps({
  /** @type {string} 設定対象のカレンダー ID */
  calendarId: { type: String, default: '' },
});

const { aclRules, savingRuleId, updateRule, removeRule } = useAclRules();

/** 共有対象の権限選択肢 */
const roleOptions = [
  { value: 'none', label: 'アクセス権なし' },
  { value: 'freeBusyReader', label: '予定の有無のみ' },
  { value: 'reader', label: '予定を閲覧' },
  { value: 'writerWithoutPrivateAccess', label: '非公開情報予定を除く予定を変更' },
  { value: 'writer', label: '予定を変更' },
  { value: 'owner', label: '所有者' },
];

/**
 * ACL 主体の表示名を求める
 * @param {GoogleCalendarAclScope} scope 共有対象
 * @returns {{ label: string, target?: string }} 共有対象の表示名
 */
function scopeLabel(scope) {
  if (scope.type === 'default') return { label: '一般公開' };
  if (scope.type === 'domain') return { label: `このドメイン内のユーザーに共有`, target: scope.value };
  if (scope.type === 'group') return { label: `このグループ内のユーザーに共有`, target: scope.value };
  if (scope.type === 'user') return { label: `このユーザーのみに共有`, target: scope.value };
  return { label: '不明な種類' };
}

/**
 * 権限の表示名を求める
 * @param {GoogleCalendarAclRule['role']} role 権限
 * @returns {string} 権限の表示名
 */
function roleLabel(role) {
  return roleOptions.find((option) => option.value === role)?.label ?? role;
}

/**
 * 権限選択の変更イベントを処理する
 * @param {GoogleCalendarAclRule} rule 対象ルール
 * @param {Event} event 権限選択イベント
 * @returns {void}
 */
function onRuleRoleChange(rule, event) {
  const select = /** @type {HTMLSelectElement} */ (event.currentTarget ?? event.target);
  updateRule(props.calendarId, rule, /** @type {GoogleCalendarAclRule['role']} */ (select.value));
}
</script>

<template>
  <div class="rules">
    <div class="heading">
      <h2>共有中のユーザー</h2>
      <span>{{ aclRules.length }}件</span>
    </div>

    <ul>
      <li v-for="rule in aclRules" :key="rule.id">
        <label>
          <span>共有対象</span>
          <code>{{ scopeLabel(rule.scope).label }}:</code>
          <code v-if="scopeLabel(rule.scope).target" class="target">{{ scopeLabel(rule.scope).target }}</code>
        </label>
        <label>
          <span>アクセス権限</span>
          <code>{{ roleLabel(rule.role) }}</code>
        </label>
        <label>
          <span>権限を変更</span>
          <select :value="rule.role" :disabled="savingRuleId === rule.id || rule.role === 'owner'" @change="onRuleRoleChange(rule, $event)">
            <option v-for="option in roleOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
          <p class="danger" v-if="rule.role === 'owner'">所有者の権限は変更できません</p>
        </label>
        <label>
          <span>権限を削除</span>
          <div class="delete-button-wrapper">
            <button type="button" title="共有設定を削除" :disabled="savingRuleId === rule.id || rule.role === 'owner'" @click="removeRule(calendarId, rule, scopeLabel(rule.scope).label)">
              <IconTrash />
            </button>
          </div>
          <p class="danger" v-if="rule.role === 'owner'">所有者の共有設定は削除できません</p>
        </label>
      </li>
    </ul>
  </div>
</template>

<style lang="scss" scoped>
.rules {
  .heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border);

    h2 {
      font-size: var(--text-size-md);
    }

    span {
      font-size: var(--text-size-sm);
      color: var(--text-light);
    }
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);

    li {
      border: 1px solid var(--border);
      border-radius: var(--border-radius);
      padding: var(--space-sm);
      margin-top: var(--space-sm);

      label {
        display: flex;
        flex-direction: column;
        gap: var(--space-xxs);

        span {
          font-size: var(--text-size-xs);
          color: var(--text-light);
        }

        p.danger {
          font-size: var(--text-size-xs);
          color: var(--danger);
          padding: 0 var(--space-xs);
        }

        .delete-button-wrapper {
          display: flex;
          align-items: center;
          gap: var(--space-xs);

          button {
            background-color: var(--danger);
            &:hover {
              opacity: 0.8;
            }
          }
        }
      }
    }

    code {
      word-break: break-all;
      font-size: var(--text-size-xs);
      background-color: var(--bg-2);
      border-radius: var(--border-radius);
      padding: var(--space-xxs) var(--space-xs);
    }
  }
}

.danger {
  color: var(--danger);
}
</style>
