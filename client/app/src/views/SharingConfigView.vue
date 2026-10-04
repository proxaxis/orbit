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
import AskLoginMessage from '@/components/AskLoginMessage.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const calendarStore = useCalendarStore();
const userStore = useUserStore();

/** @type {Ref<GoogleCalendarAclRule[]>} 現在の共有ルール */
const aclRules = ref([]);
const isLoading = ref(false);
/** @type {Ref<string|null>} 保存中の共有ルール ID */
const savingRuleId = ref(null);
const errorMessage = ref('');
const formError = ref('');
const form = reactive({ scopeType: 'user', value: '', role: 'reader' });

const theCalendarId = computed(() => {
  const requestedId = typeof route.query.cid === 'string' ? route.query.cid : '';
  return calendarStore.listWritableCalendars.some((cal) => cal.id === requestedId) ? requestedId : calendarStore.listWritableCalendars[0]?.id ?? '';
});
const theCalendar = computed(() => calendarStore.listWritableCalendars.find((cal) => cal.id === theCalendarId.value));

const roleOptions = [
  { value: 'freeBusyReader', label: '予定の有無のみ' },
  { value: 'reader', label: '予定を閲覧' },
  { value: 'writer', label: '予定を変更' },
];

/** @param {GoogleCalendarAclScope} scope @returns {string} 共有対象の表示名 */
function scopeLabel(scope) {
  if (scope.type === 'default') return '一般公開';
  if (scope.type === 'domain') return `ドメイン: ${scope.value}`;
  if (scope.type === 'group') return `グループ: ${scope.value}`;
  return scope.value || 'ユーザー';
}

/** @param {GoogleCalendarAclRule['role']} role @returns {string} 権限の表示名 */
function roleLabel(role) {
  return roleOptions.find((option) => option.value === role)?.label ?? role;
}

/** @param {Event} event カレンダー選択イベント */
function onSelectCalendar(event) {
  const select = /** @type {HTMLSelectElement} */ (event.currentTarget ?? event.target);
  router.push({ query: { ...route.query, cid: select.value } });
}

async function loadRules() {
  aclRules.value = [];
  errorMessage.value = '';
  if (!theCalendarId.value || !authStore.token) return;

  isLoading.value = true;
  try {
    const response = await gCalAPI.listAcl(authStore.token, theCalendarId.value, { maxResults: 250 });
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
  if (!theCalendarId.value) return;

  isLoading.value = true;
  try {
    /** @type {Pick<GoogleCalendarAclRule, 'role'|'scope'>} */
    const body = {
      scope: { type: /** @type {GoogleCalendarAclScope['type']} */ (form.scopeType), ...(form.scopeType === 'default' ? {} : { value: form.value.trim() }) },
      role: /** @type {GoogleCalendarAclRule['role']} */ (form.role),
    };
    const created = await gCalAPI.insertAcl(authStore.token, theCalendarId.value, body, { sendNotifications: true });
    if (created) aclRules.value = [...aclRules.value, created];
    form.value = '';
  } catch (error) {
    formError.value = error instanceof Error ? error.message : String(error);
  } finally {
    isLoading.value = false;
  }
}

/** @param {GoogleCalendarAclRule} rule @param {GoogleCalendarAclRule['role']} role */
async function updateRule(rule, role) {
  if (rule.role === role) return;
  savingRuleId.value = rule.id;
  try {
    const updated = await gCalAPI.patchAcl(authStore.token, theCalendarId.value, rule.id, { role });
    const index = aclRules.value.findIndex((item) => item.id === rule.id);
    if (updated && index !== -1) aclRules.value[index] = updated;
    else if (index !== -1) aclRules.value[index] = { ...rule, role };
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    savingRuleId.value = null;
  }
}

/** @param {GoogleCalendarAclRule} rule @param {Event} event 権限選択イベント */
function onRuleRoleChange(rule, event) {
  const select = /** @type {HTMLSelectElement} */ (event.currentTarget ?? event.target);
  updateRule(rule, /** @type {GoogleCalendarAclRule['role']} */(select.value));
}

/** @param {GoogleCalendarAclRule} rule */
async function removeRule(rule) {
  if (!await userStore.confirm({ title: '共有設定を削除', message: `${scopeLabel(rule.scope)} の共有設定を削除しますか？` })) return;
  savingRuleId.value = rule.id;
  try {
    await gCalAPI.deleteAcl(authStore.token, theCalendarId.value, rule.id);
    aclRules.value = aclRules.value.filter((item) => item.id !== rule.id);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    savingRuleId.value = null;
  }
}

watch([theCalendarId, () => authStore.token], loadRules, { immediate: true });
</script>

<template>
  <div class="sharing-config-view">
    <MenuBar>
      <template #main>
        <h1 class="title">共有設定</h1>
      </template>
      <template #sub>
        <button title="カレンダーに戻る" @click="router.push({ name: 'Home' })">
          <IconXMark />
        </button>
      </template>
      カレンダーを共有するユーザーを管理
    </MenuBar>

    <AskLoginMessage v-if="!authStore.isAuthenticated">
      共有設定を行うには Google アカウントでログインする必要があります
    </AskLoginMessage>

    <section v-if="authStore.isAuthenticated">
      <label class="calendar-select">
        <select :value="theCalendarId" :disabled="!calendarStore.listWritableCalendars.length"
          @change="onSelectCalendar($event)">
          <option v-for="cal in calendarStore.listWritableCalendars" :key="cal.id" :value="cal.id">{{ cal.summary }}
          </option>
        </select>
        <small>設定対象のカレンダー:</small>
        <div class="calendar-ribbon-wrapper" v-if="theCalendar">
          <CalendarRibbon :gCalendarId="theCalendar.id" :key="theCalendar.id" />
        </div>
        <p v-else>共有設定を変更できるカレンダーがありません</p>
      </label>

      <p v-if="!calendarStore.listWritableCalendars.length" class="empty-state">共有設定を変更できるカレンダーがありません</p>
      <template v-else>
        <div class="sharing">
          <form @submit.prevent="addRule">

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
                    <option v-for="option in roleOptions" :key="option.value" :value="option.value">{{ option.label }}
                    </option>
                  </select>
                </label>
              </div>
              <div>
                <label v-if="form.scopeType !== 'default'">メールアドレス / ドメイン
                  <input v-model="form.value" type="text"
                    :placeholder="form.scopeType === 'domain' ? 'example.com' : 'name@example.com'" />
                </label>
              </div>
              <div>
                <button data-app-button="primary" type="submit" :disabled="isLoading">
                  <IconUserPlus />追加
                </button>
              </div>
            </div>
            <p v-if="formError" class="error">{{ formError }}</p>
          </form>
        </div>

        <div class="rules">

          <div class="heading">
            <h2>共有中のユーザー</h2><span>{{ aclRules.length }}件</span>
          </div>

          <ul>
            <li v-for="rule in aclRules" :key="rule.id">
              <div class="rule-scope">
                <code>{{ scopeLabel(rule.scope) }}</code>
                <small>{{ rule.scope?.type }}</small>
              </div>
              <span v-if="rule.role === 'owner'" class="owner-label">所有者</span>
              <select v-else :value="rule.role" :disabled="savingRuleId === rule.id"
                @change="onRuleRoleChange(rule, $event)">
                <option v-for="option in roleOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
              <span v-if="rule.role === 'owner'" class="role-description">{{ roleLabel(rule.role) }}</span>
              <button class="delete-button" type="button" title="共有設定を削除"
                :disabled="savingRuleId === rule.id || rule.role === 'owner'" @click="removeRule(rule)">
                <IconTrash />
              </button>
            </li>
          </ul>
        </div>
      </template>
    </section>
  </div>
</template>

<style lang="scss" scoped>
section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.calendar-select {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);

  .calendar-ribbon-wrapper {
    margin-left: var(--space-xs);
  }
}

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
    .rule-scope {
      display: flex;
      flex-direction: column;
      min-width: 0;
      overflow: hidden;
    }

    code {
      word-break: break-all;
      font-size: var(--text-size-sm);
      background-color: var(--bg-2);
      border-radius: var(--border-radius);
      margin-top: var(--space-xs);
      padding: var(--space-xxs) var(--space-xs);
    }
  }
}
</style>
