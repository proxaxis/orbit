<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import * as gCalAPI from '@/services/google-calendar-api.js';
import MenuBar from '@/components/MenuBar.vue';
import CalendarRibbon from '@/components/CalendarRibbon.vue';
import IconUserPlus from '@/components/icons/IconUserPlus.vue';
import IconTrash from '@/components/icons/IconTrash.vue';
import IconXMark from '@/components/icons/IconXMark.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const calendarStore = useCalendarStore();
const userStore = useUserStore();

const aclRules = ref([]);
const isLoading = ref(false);
const savingRuleId = ref(null);
const errorMessage = ref('');
const formError = ref('');
const form = reactive({ scopeType: 'user', value: '', role: 'reader' });

const calendars = computed(() => calendarStore.listWritableCalendars);
const selectedCalendarId = computed(() => {
  const requestedId = typeof route.query.calendarId === 'string' ? route.query.calendarId : '';
  return calendars.value.some((calendar) => calendar.id === requestedId) ? requestedId : calendars.value[0]?.id ?? '';
});
const selectedCalendar = computed(() => calendars.value.find((calendar) => calendar.id === selectedCalendarId.value));

const roleOptions = [
  { value: 'freeBusyReader', label: '予定の有無のみ' },
  { value: 'reader', label: '予定を閲覧' },
  { value: 'writer', label: '予定を変更' },
];

function scopeLabel(scope) {
  if (scope.type === 'default') return '一般公開';
  if (scope.type === 'domain') return `ドメイン: ${scope.value}`;
  if (scope.type === 'group') return `グループ: ${scope.value}`;
  return scope.value || 'ユーザー';
}

function roleLabel(role) {
  return roleOptions.find((option) => option.value === role)?.label ?? role;
}

function selectCalendar(calendarId) {
  router.replace({ query: { calendarId } });
}

async function loadRules() {
  aclRules.value = [];
  errorMessage.value = '';
  if (!selectedCalendarId.value || !authStore.token) return;

  isLoading.value = true;
  try {
    const response = await gCalAPI.listAcl(authStore.token, selectedCalendarId.value, { maxResults: 250 });
    aclRules.value = response?.items ?? [];
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isLoading.value = false;
  }
}

async function addRule() {
  formError.value = '';
  if (form.scopeType !== 'default' && !form.value.trim()) {
    formError.value = 'メールアドレスまたはドメインを入力してください。';
    return;
  }
  if (!selectedCalendarId.value) return;

  isLoading.value = true;
  try {
    const body = { scope: { type: form.scopeType, ...(form.scopeType === 'default' ? {} : { value: form.value.trim() }) }, role: form.role };
    const created = await gCalAPI.insertAcl(authStore.token, selectedCalendarId.value, body, { sendNotifications: true });
    if (created) aclRules.value = [...aclRules.value, created];
    form.value = '';
  } catch (error) {
    formError.value = error instanceof Error ? error.message : String(error);
  } finally {
    isLoading.value = false;
  }
}

async function updateRule(rule, role) {
  if (rule.role === role) return;
  savingRuleId.value = rule.id;
  try {
    const updated = await gCalAPI.patchAcl(authStore.token, selectedCalendarId.value, rule.id, { role });
    const index = aclRules.value.findIndex((item) => item.id === rule.id);
    if (updated && index !== -1) aclRules.value[index] = updated;
    else if (index !== -1) aclRules.value[index] = { ...rule, role };
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    savingRuleId.value = null;
  }
}

async function removeRule(rule) {
  if (!await userStore.confirm({ title: '共有設定を削除', message: `${scopeLabel(rule.scope)} の共有設定を削除しますか？` })) return;
  savingRuleId.value = rule.id;
  try {
    await gCalAPI.deleteAcl(authStore.token, selectedCalendarId.value, rule.id);
    aclRules.value = aclRules.value.filter((item) => item.id !== rule.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    savingRuleId.value = null;
  }
}

watch([selectedCalendarId, () => authStore.token], loadRules, { immediate: true });
</script>

<template>
  <section class="sharing-view">
    <MenuBar>
      <template #main>
        <h1 class="title">共有設定</h1>
      </template>
      <template #sub><button title="カレンダーに戻る" @click="router.push({ name: 'Home' })">
          <IconXMark />戻る
        </button></template>
    </MenuBar>

    <div class="content">
      <label class="calendar-select">設定するカレンダー
        <select :value="selectedCalendarId" :disabled="!calendars.length" @change="selectCalendar($event.target.value)">
          <option v-for="calendar in calendars" :key="calendar.id" :value="calendar.id">{{ calendar.summary }}</option>
        </select>
      </label>

      <div v-if="selectedCalendar" class="calendar-heading">
        <CalendarRibbon :gCalendarId="selectedCalendar.id" />
        <div>
          <h2>{{ selectedCalendar.summary }}</h2>
          <p>{{ selectedCalendar.description || 'このカレンダーを共有するユーザーを管理します。' }}</p>
        </div>
      </div>

      <p v-if="!calendars.length" class="empty-state">共有設定を変更できるカレンダーがありません。</p>
      <template v-else>
        <form class="add-form" @submit.prevent="addRule">
          <div class="form-heading">
            <IconUserPlus />
            <h2>共有相手を追加</h2>
          </div>
          <div class="form-grid">
            <label>対象
              <select v-model="form.scopeType">
                <option value="user">ユーザー</option>
                <option value="group">グループ</option>
                <option value="domain">ドメイン</option>
                <option value="default">一般公開</option>
              </select>
            </label>
            <label v-if="form.scopeType !== 'default'">メールアドレス / ドメイン
              <input v-model="form.value" type="text"
                :placeholder="form.scopeType === 'domain' ? 'example.com' : 'name@example.com'" />
            </label>
            <label>権限
              <select v-model="form.role">
                <option v-for="option in roleOptions" :key="option.value" :value="option.value">{{ option.label }}
                </option>
              </select>
            </label>
            <button data-app-button="primary" type="submit" :disabled="isLoading">
              <IconUserPlus />追加
            </button>
          </div>
          <p v-if="formError" class="error">{{ formError }}</p>
        </form>

        <div class="rules-heading">
          <h2>共有中のユーザー</h2><span>{{ aclRules.length }}件</span>
        </div>
        <p v-if="isLoading" class="empty-state">共有設定を読み込んでいます...</p>
        <p v-else-if="errorMessage" class="error">{{ errorMessage }}</p>
        <p v-else-if="!authStore.token" class="empty-state">共有設定を表示するには Google アカウントでログインしてください。</p>
        <p v-else-if="!aclRules.length" class="empty-state">共有設定はありません。</p>
        <ul v-else class="rule-list">
          <li v-for="rule in aclRules" :key="rule.id">
            <div class="rule-scope"><strong>{{ scopeLabel(rule.scope) }}</strong><small>{{ rule.scope?.type }}</small>
            </div>
            <span v-if="rule.role === 'owner'" class="owner-label">所有者</span>
            <select v-else :value="rule.role" :disabled="savingRuleId === rule.id"
              @change="updateRule(rule, $event.target.value)">
              <option v-for="option in roleOptions" :key="option.value" :value="option.value">{{ option.label }}
              </option>
            </select>
            <span v-if="rule.role === 'owner'" class="role-description">{{ roleLabel(rule.role) }}</span>
            <button class="delete-button" type="button" title="共有設定を削除"
              :disabled="savingRuleId === rule.id || rule.role === 'owner'" @click="removeRule(rule)">
              <IconTrash />
            </button>
          </li>
        </ul>
      </template>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.sharing-view {
  width: 100%;
  padding: var(--space-md);
}

.content {
  max-width: 860px;
  margin: 0 auto;
}

.calendar-select,
label {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: var(--text-size-xs);
}

.calendar-select {
  max-width: 28rem;
}

.calendar-heading {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin: var(--space-xl) 0;
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--border);
}

.calendar-heading h2,
.form-heading h2,
.rules-heading h2 {
  font-size: var(--text-size-lg);
}

.calendar-heading p {
  color: var(--text-light);
  font-size: var(--text-size-xs);
}

.add-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-md);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  background: var(--bg-1);
}

.form-heading,
.rules-heading {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1.4fr 1fr auto;
  align-items: end;
  gap: var(--space-sm);
}

.form-grid button {
  min-height: 2.25rem;
  justify-content: center;
  gap: var(--space-xs);
}

.rules-heading {
  justify-content: space-between;
  margin: var(--space-xl) 0 var(--space-sm);
}

.rules-heading span,
small {
  color: var(--text-light);
  font-size: var(--text-size-xs);
}

.rule-list {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
}

.rule-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 12rem 2rem;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) 0;
  border-bottom: 1px solid var(--border);
}

.rule-scope {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.rule-scope strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.delete-button {
  justify-content: center;
  padding: var(--space-xs);
}

.delete-button:hover:not(:disabled) {
  color: var(--danger);
}

.owner-label,
.role-description {
  color: var(--text-light);
  font-size: var(--text-size-sm);
}

.empty-state {
  padding: var(--space-xl) 0;
  color: var(--text-light);
  text-align: center;
}

.error {
  color: var(--danger);
  font-size: var(--text-size-sm);
}

@media (max-width: 720px) {
  .sharing-view {
    padding: var(--space-sm);
  }

  .form-grid {
    grid-template-columns: 1fr 1fr;
  }

  .form-grid label:nth-child(2) {
    grid-column: span 2;
  }

  .form-grid button {
    grid-column: 2;
  }

  .rule-list li {
    grid-template-columns: minmax(0, 1fr) auto 2rem;
    gap: var(--space-sm);
  }
}
</style>
