<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import * as gCalAPI from '@/services/google-calendar-api.js';
import MenuBar from '@/components/MenuBar.vue';
import ColorPicker from '@/components/ColorPicker.vue';
import IconXMark from '@/components/icons/IconXMark.vue';
import AskLoginMessage from '@/components/AskLoginMessage.vue';
import { getRandomCalendarListColorId } from '@/services/google-calendar-colors.js';

const router = useRouter();
const authStore = useAuthStore();
const calendarStore = useCalendarStore();
const userStore = useUserStore();

/** @type {Ref<string | null>} @description 入力されたカレンダー ID に関するエラー */
const errorOnCalendarId = ref(null);

const vmForm = reactive({
  calendarId: '',
  colorId: getRandomCalendarListColorId().colorId,
});

/** @returns {boolean} @description 入力されたカレンダー ID の形式を検証 */
function validateCalendarId() {
  errorOnCalendarId.value = null;
  const calId = vmForm.calendarId.trim();
  if (!calId) {
    errorOnCalendarId.value = 'Calendar ID is not entered. Please enter a valid Calendar ID.';
    return false;
  }
  if (/\s/.test(calId)) {
    errorOnCalendarId.value = 'Calendar ID cannot contain spaces.';
    return false;
  }
  if (calendarStore.list.some((calendar) => calendar.id === calId)) {
    errorOnCalendarId.value = 'This calendar is already added.';
    return false;
  }
  return true;
}

/** 入力されたカレンダーをユーザーのカレンダーリストへ追加する */
async function submit() {
  if (!validateCalendarId()) return;
  if (!authStore.isAuthenticated) return;

  try {
    userStore.setLoading(true, 'Adding calendar...');
    const body = {
      id: vmForm.calendarId.trim(),
      colorId: vmForm.colorId,
      colorRgbFormat: true,
      selected: true,
    };
    const entry = /** @type {GoogleCalendarListEntry} */ (await gCalAPI.insertCalendarListEntry(authStore.token, body));
    calendarStore.addCalendar(entry);
    router.push({ name: 'Home' });
  } catch (err) {
    userStore.setError(true, err);
  } finally {
    userStore.setLoading(false);
  }
}
</script>

<template>
  <div class="calendar-adder">
    <MenuBar>
      <template #main>
        <h1 class="title"><IconCalendar />他のカレンダーを追加</h1>
      </template>
      <template #sub>
        <button type="button" title="閉じる" @click="router.back">
          <IconXMark />
        </button>
      </template>

      共有されたカレンダーや、購読したいカレンダーを一覧へ追加します
    </MenuBar>

    <AskLoginMessage v-if="!authStore.token">
      <span v-if="userStore.isOffline">オフラインのため、カレンダーを追加できません</span>
      <span v-if="!authStore.isAuthenticated">カレンダーを追加するには Google アカウントでログインする必要があります</span>
    </AskLoginMessage>

    <form v-else @submit.prevent="submit">
      <label>
        カレンダー ID
        <input v-model="vmForm.calendarId" autofocus required autocomplete="off" placeholder="example@group.calendar.google.com" @input="validateCalendarId" />
        <small>Google カレンダーの "カレンダーの設定と共有" に表示される ID を入力してください</small>
        <p v-if="errorOnCalendarId" class="error" role="alert">{{ errorOnCalendarId }}</p>
      </label>
      <label
        >表示色
        <ColorPicker v-model="vmForm.colorId" />
      </label>
      <div class="actions">
        <button type="button" @click="router.back">キャンセル</button>
        <button data-app-button="primary" type="submit" :disabled="userStore.isLoading">カレンダーを追加</button>
      </div>
    </form>
  </div>
</template>

<style lang="scss" scoped>
form {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  max-width: 42rem;
  margin: 0 auto;
}

label {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: var(--text-size-xs);
}

small,
.description {
  color: var(--text-light);
  font-size: var(--text-size-xs);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}

.actions button {
  min-height: 2.25rem;
  padding: var(--space-xs) var(--space-sm);
}

.error {
  color: var(--danger);
  font-size: var(--text-size-sm);
}
</style>
