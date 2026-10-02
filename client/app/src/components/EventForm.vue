<script setup>
import { computed, reactive, ref } from 'vue';
import TimezoneSelecter from '@/components/TimezoneSelecter.vue';

const props = defineProps({
  initialEvent: { type: Object, default: null },
  calendars: { type: Array, default: () => [] },
  submitLabel: { type: String, default: '保存' },
  loading: { type: Boolean, default: false },
});

const emit = defineEmits(['submit', 'cancel']);
const source = props.initialEvent;
const start = source?.start?.dateTime ? new Date(source.start.dateTime) : new Date(`${source?.start?.date || new Date().toISOString().slice(0, 10)}T09:00`);
const end = source?.end?.dateTime ? new Date(source.end.dateTime) : new Date(start.getTime() + 60 * 60 * 1000);
const toDate = (date) => date.toISOString().slice(0, 10);
const toTime = (date) => date.toTimeString().slice(0, 5);
const form = reactive({
  summary: source?.summary || '',
  description: source?.description || '',
  location: source?.location || '',
  calendarId: source?.calendarId || props.calendars.find((calendar) => ['owner', 'writer'].includes(calendar.accessRole))?.id || '',
  icon: source?.icon || '',
  allDay: Boolean(source?.start?.date),
  startDate: toDate(start),
  startTime: toTime(start),
  endDate: toDate(end),
  endTime: toTime(end),
  timeZone: source?.start?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
});
const error = ref('');
const writableCalendars = computed(() => props.calendars.filter((calendar) => ['owner', 'writer'].includes(calendar.accessRole)));

const submit = () => {
  error.value = '';
  if (!form.summary.trim()) {
    error.value = 'タイトルを入力してください。';
    return;
  }
  if (!form.calendarId) {
    error.value = '保存先カレンダーを選択してください。';
    return;
  }
  if (!form.allDay && new Date(`${form.endDate}T${form.endTime}`) <= new Date(`${form.startDate}T${form.startTime}`)) {
    error.value = '終了日時は開始日時より後にしてください。';
    return;
  }
  const body = {
    summary: form.summary.trim(),
    description: form.description.trim() || undefined,
    location: form.location.trim() || undefined,
    ...(form.icon ? { extendedProperties: { private: { icon: form.icon } } } : {}),
    start: form.allDay ? { date: form.startDate } : { dateTime: new Date(`${form.startDate}T${form.startTime}`).toISOString(), timeZone: form.timeZone },
    end: form.allDay ? { date: form.endDate } : { dateTime: new Date(`${form.endDate}T${form.endTime}`).toISOString(), timeZone: form.timeZone },
  };
  emit('submit', { body, calendarId: form.calendarId });
};
</script>

<template>
  <form class="event-form" @submit.prevent="submit">
    <label class="title-field">タイトル <input v-model="form.summary" autofocus required placeholder="予定のタイトル" /></label>
    <div class="form-grid">
      <label>保存先 <select v-model="form.calendarId" required>
          <option value="" disabled>カレンダーを選択</option>
          <option v-for="calendar in writableCalendars" :key="calendar.id" :value="calendar.id">{{
            calendar.summaryOverride || calendar.summary }}</option>
        </select></label>
      <label>絵文字 <input v-model="form.icon" maxlength="2" placeholder="📅" /></label>
    </div>
    <label class="check-row"><input v-model="form.allDay" type="checkbox" /> 終日</label>
    <div class="form-grid">
      <label>開始日 <input v-model="form.startDate" type="date" required /></label>
      <label v-if="!form.allDay">開始時刻 <input v-model="form.startTime" type="time" required /></label>
      <label>終了日 <input v-model="form.endDate" type="date" required /></label>
      <label v-if="!form.allDay">終了時刻 <input v-model="form.endTime" type="time" required /></label>
    </div>
    <label v-if="!form.allDay">タイムゾーン
      <TimezoneSelecter v-model="form.timeZone" />
    </label>
    <label>場所 <input v-model="form.location" placeholder="場所またはオンライン会議 URL" /></label>
    <label>説明 <textarea v-model="form.description" rows="5" placeholder="予定の詳細" /></label>
    <p v-if="error" class="error">{{ error }}</p>
    <div class="actions"><button type="button" @click="emit('cancel')">キャンセル</button><button class="primary"
        type="submit" :disabled="loading">{{ loading ? '保存中...' : submitLabel }}</button></div>
  </form>
</template>

<style lang="scss" scoped>
.event-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 720px;
  width: 100%;
}

label {
  display: flex;
  flex-direction: column;
  gap: .35rem;
  font-size: .9rem;
}

.title-field input {
  font-size: 1.3rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: .8rem;
}

.check-row {
  flex-direction: row;
  align-items: center;
}

textarea {
  resize: vertical;
  font-family: inherit;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: .6rem;
  padding-top: .5rem;
}

.actions button {
  padding: .55rem 1rem;
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
}

.actions .primary {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}

.error {
  color: var(--danger);
}

@media (max-width: 600px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
