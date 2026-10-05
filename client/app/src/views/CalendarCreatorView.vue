<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import * as gCalAPI from '@/services/google-calendar-api.js';
import { getRandomCalendarListColorId } from '@/services/google-calendar-colors.js';
import MenuBar from '@/components/MenuBar.vue';
import ColorPicker from '@/components/ColorPicker.vue';
import TimezoneSelecter from '@/components/TimezoneSelecter.vue';
import IconCalendar from '@/components/icons/IconCalendar.vue';
import IconXMark from '@/components/icons/IconXMark.vue';
import AskLoginMessage from '@/components/AskLoginMessage.vue';

const router = useRouter();
const authStore = useAuthStore();
const calendarStore = useCalendarStore();
const userStore = useUserStore();

/** @type {Ref<string | null>} */
const formErrorMessage = ref(null);

const vmForm = reactive({
  summary: '',
  description: '',
  location: '',
  timeZone: userStore.timeZone,
  colorId: getRandomCalendarListColorId().colorId,
});

function checkFormInput() {
  formErrorMessage.value = null;
  if (!vmForm.summary.trim()) {
    formErrorMessage.value = 'Calendar name is not entered. Please enter a calendar name.';
    return false;
  }
  return true;
}

/** カレンダーを追加するリクエストを送信し、キャッシュに保存する */
async function submit() {
  if (!checkFormInput()) return;

  userStore.setLoading(true, 'Creating calendar...');
  try {
    const body = {
      summary: vmForm.summary.trim(),
      description: vmForm.description.trim() || undefined,
      location: vmForm.location.trim() || undefined,
      timeZone: vmForm.timeZone,
    };
    const resource = /** @type {GoogleCalendarResource} */ (await gCalAPI.insertCalendar(authStore.token, body));
    if (!resource?.id) throw new Error('Failed to create calendar. No calendar ID returned.');
    /** @type {GoogleCalendarListEntry} */
    const returnEntry = await gCalAPI.patchCalendarListEntry(authStore.token, resource.id, { colorId: vmForm.colorId });
    /** @type {GoogleCalendarListEntry} */
    const entry = {
      kind: 'calendar#calendarListEntry',
      etag: returnEntry.etag ?? '',
      id: returnEntry.id,
      summary: returnEntry.summary,
      description: returnEntry.description,
      location: returnEntry.location,
      timeZone: returnEntry.timeZone,
      colorId: vmForm.colorId,
      backgroundColor: returnEntry.backgroundColor,
      foregroundColor: returnEntry.foregroundColor,
      accessRole: 'owner',
      defaultReminders: [],
      autoAcceptInvitations: false,
    };
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
  <div class="calendar-creator-view">
    <MenuBar>
      <template #main>
        <h1 class="title">カレンダーを作成</h1>
      </template>
      <template #sub>
        <button title="Don't save and close" @click="router.back">
          <IconXMark />
        </button>
      </template>

      予定をまとめるためのカレンダーを作成します
    </MenuBar>

    <AskLoginMessage v-if="!authStore.token">
      <span v-if="!authStore.isAuthenticated">カレンダーを作成するにはログインが必要です</span>
      <span v-if="userStore.isOffline">オフラインではカレンダーを作成できません</span>
    </AskLoginMessage>

    <section v-else>
      <form @submit.prevent="submit">
        <label> カレンダー名称 <input v-model="vmForm.summary" autofocus required maxlength="100" placeholder="例: プロジェクト予定" /> </label>
        <label> 説明 <textarea v-model="vmForm.description" rows="4" maxlength="500" placeholder="このカレンダーの用途や補足"></textarea></label>
        <label> 場所 <input v-model="vmForm.location" maxlength="255" placeholder="例: 東京オフィス" /> </label>
        <label>
          タイムゾーン
          <TimezoneSelecter v-model="vmForm.timeZone" />
        </label>
        <label>
          カレンダーの色
          <ColorPicker v-model="vmForm.colorId" />
        </label>
        <p v-if="formErrorMessage" class="error" role="alert">{{ formErrorMessage }}</p>
        <div class="actions">
          <button type="button" @click="router.back">キャンセル</button>
          <button data-app-button="primary" type="submit" :disabled="userStore.isLoading">カレンダーを作成</button>
        </div>
      </form>
    </section>
  </div>
</template>

<style lang="scss" scoped>
form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

label {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: var(--text-size-xs);
}

textarea {
  resize: vertical;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  padding-top: var(--space-sm);
}

.error {
  color: var(--danger);
  font-size: var(--text-size-sm);
}

.icon-x-mark {
  padding: var(--space-xs);

  &:hover {
    background-color: var(--bg-2);
    border-radius: 50%;
  }
}
</style>
