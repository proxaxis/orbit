<script setup>
/**
 * SharingConfigView の共有相手追加フォーム。
 * 共有対象の種類・権限・メールアドレス/ドメインを入力して ACL ルールを追加する。
 */
import { reactive } from 'vue';
import { useUserStore } from '@/stores/user.js';
import { useAclRules } from '@/composables/useAclRules.js';
import IconUserPlus from '@/components/icons/IconUserPlus.vue';

const props = defineProps({
  /** @type {string} 設定対象のカレンダー ID */
  calendarId: { type: String, default: '' },
});

const userStore = useUserStore();
const { addRule } = useAclRules();

/** 共有対象の権限選択肢 */
const roleOptions = [
  { value: 'none', label: 'アクセス権なし' },
  { value: 'freeBusyReader', label: '予定の有無のみ' },
  { value: 'reader', label: '予定を閲覧' },
  { value: 'writerWithoutPrivateAccess', label: '非公開情報予定を除く予定を変更' },
  { value: 'writer', label: '予定を変更' },
  { value: 'owner', label: '所有者' },
];

/** 追加フォームの入力値 */
const form = reactive({ scopeType: 'user', value: '', role: 'reader' });

/** 共有ルールを追加し、成功したら入力をクリアする */
async function onSubmit() {
  if (await addRule(props.calendarId, form)) form.value = '';
}
</script>

<template>
  <div class="sharing">
    <form @submit.prevent="onSubmit">
      <div class="heading">
        <IconUserPlus />
        <h2>共有相手を追加</h2>
      </div>

      <div class="form-grid">
        <div>
          <label>
            対象
            <select v-model="form.scopeType">
              <option value="user">ユーザー</option>
              <option value="group">グループ</option>
              <option value="domain">ドメイン</option>
              <option value="default">一般公開</option>
            </select>
          </label>
          <label>
            権限
            <select v-model="form.role">
              <option v-for="option in roleOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
        </div>
        <div>
          <label v-if="form.scopeType !== 'default'"
            >メールアドレス / ドメイン
            <input v-model="form.value" type="text" :placeholder="form.scopeType === 'domain' ? 'example.com' : 'name@example.com'" />
          </label>
        </div>
        <div>
          <button data-app-button="primary" type="submit" :disabled="userStore.isLoading"><IconUserPlus />追加</button>
        </div>
      </div>
    </form>
  </div>
</template>

<style lang="scss" scoped>
.sharing form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);

  .heading {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    border-bottom: 1px solid var(--border);

    h2 {
      font-size: var(--text-size-md);
    }
  }

  .form-grid {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    align-items: end;

    label {
      flex-grow: 1;
      display: flex;
      flex-direction: column;
      gap: var(--space-xs);
      font-size: var(--text-size-xs);
    }

    div:nth-child(1) {
      width: 100%;
      display: flex;
      gap: var(--space-sm);
      flex-wrap: wrap;
    }

    div:nth-child(2) {
      width: 100%;
    }

    div:nth-child(3) button {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
    }
  }
}

.error {
  color: var(--danger);
}
</style>
