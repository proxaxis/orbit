<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import * as gCalAPI from '@/services/google-calendar-api.js';
import MenuBar from '@/components/MenuBar.vue';
import ColorPicker from '@/components/ColorPicker.vue';
import TimezoneSelecter from '@/components/TimezoneSelecter.vue';
import IconCalendar from '@/components/icons/IconCalendar.vue';
import IconXMark from '@/components/icons/IconXMark.vue';

const router = useRouter();
const authStore = useAuthStore();
const calendarStore = useCalendarStore();
const isSubmitting = ref(false);
const errorMessage = ref('');

const form = reactive({
  summary: '',
  description: '',
  location: '',
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  color: '#54a0ff',
});

async function createCalendar() {
  errorMessage.value = '';
  if (!form.summary.trim()) {
    errorMessage.value = 'カレンダー名を入力してください。';
    return;
  }
  if (!authStore.token) {
    errorMessage.value = 'カレンダーを作成するには Google アカウントでログインしてください。';
    return;
  }

  isSubmitting.value = true;
  try {
    const body = {
      summary: form.summary.trim(),
      description: form.description.trim() || undefined,
      location: form.location.trim() || undefined,
      timeZone: form.timeZone,
    };
    const created = await gCalAPI.insertCalendar(authStore.token, body);
    if (!created?.id) throw new Error('カレンダーを作成できませんでした。');
    await gCalAPI.patchCalendarListEntry(authStore.token, created.id, { backgroundColor: form.color, foregroundColor: '#000000' });
    calendarStore.addCalendar({ ...created, backgroundColor: form.color, foregroundColor: '#000000', accessRole: 'owner' });
    router.replace({ name: 'Home' });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<template>
  <section class="calendar-creator-view">
    <MenuBar>
      <template #main>
        <h1 class="title">カレンダーを作成</h1>
      </template>
      <template #sub>
        <button title="キャンセル" @click="router.back">
          <IconXMark />キャンセル
        </button>
      </template>
    </MenuBar>

    <form class="calendar-form" @submit.prevent="createCalendar">
      <div class="form-heading">
        <IconCalendar />
        <div>
          <h2>新しいカレンダー</h2>
          <p>予定をまとめるためのカレンダーを作成します。</p>
        </div>
      </div>
      <label>カレンダー名 <input v-model="form.summary" autofocus required maxlength="100"
          placeholder="例: プロジェクト予定" /></label>
      <label>説明 <textarea v-model="form.description" rows="4" maxlength="500"
          placeholder="このカレンダーの用途や補足"></textarea></label>
      <label>場所 <input v-model="form.location" maxlength="255" placeholder="例: 東京オフィス" /></label>
      <label>タイムゾーン
        <TimezoneSelecter v-model="form.timeZone" />
      </label>
      <label>カレンダーの色
        <ColorPicker v-model="form.color" />
      </label>
      <p v-if="errorMessage" class="error" role="alert">{{ errorMessage }}</p>
      <div class="actions">
        <button type="button" @click="router.back">キャンセル</button>
        <button data-app-button="primary" type="submit" :disabled="isSubmitting">{{ isSubmitting ? '作成中...' : 'カレンダーを作成'
          }}</button>
      </div>
    </form>
  </section>
</template>

<style lang="scss" scoped>
.calendar-creator-view {
  width: 100%;
  padding: var(--space-md);
}

.calendar-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  max-width: 42rem;
  margin: 0 auto;
}

.form-heading {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid var(--border);
}

.form-heading h2 {
  font-size: var(--text-size-lg);
}

.form-heading p {
  color: var(--text-light);
  font-size: var(--text-size-xs);
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

.actions button {
  min-height: 2.25rem;
  padding: var(--space-xs) var(--space-sm);
}

.error {
  color: var(--danger);
  font-size: var(--text-size-sm);
}

@media (max-width: 720px) {
  .calendar-creator-view {
    padding: var(--space-sm);
  }
}
</style>
