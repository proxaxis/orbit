<script setup>
import { computed, reactive, ref, onMounted } from 'vue';
import { toDayjs } from '@/services/dayjs.js';
import { useUserStore } from '@/stores/user.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useEventStore } from '@/stores/event.js';
import TimezoneSelecter from '@/components/TimezoneSelecter.vue';

const props = defineProps({
  submitLabel: { type: String, default: '保存' },
});

const emit = defineEmits(['submit', 'cancel']);

const userStore = useUserStore();
const calendarStore = useCalendarStore();
const eventStore = useEventStore();

/** @type {Record<string, string|null>} フォームのエラーメッセージ */
const formErrors = reactive({
  dateTime: null,
});

/** @type {Ref<GoogleEvent & { sourceCalendarId: string }|null>} オリジナルのイベントデータ */
const source = ref(null);

/** @param {GoogleEvent|null} event @returns {string} */
function getEventIcon(event) {
  const shared = /** @type {Record<string, string>|undefined} */ (event?.extendedProperties?.shared);
  return shared?.icon ?? '';
}

const form = reactive({
  summary: '',
  description: '',
  location: '',
  gCalendarId: '',
  icon: '',
  isAllDay: true,
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: '',
  timeZone: '',
});

function checkDateTime() {
  formErrors.dateTime = null;

  if (!form.isAllDay && new Date(`${form.endDate}T${form.endTime}`) <= new Date(`${form.startDate}T${form.startTime}`)) {
    formErrors.dateTime = 'Set the end date or time after the start date or time.';
    return false;
  }
  return true;
}

function submit() {
  if (checkDateTime() === false) return;
  const body = {
    summary: form.summary.trim(),
    description: form.description.trim() ?? undefined,
    location: form.location.trim() ?? undefined,
    ...(form.icon ? { extendedProperties: { shared: { icon: form.icon } } } : {}),
    start: form.isAllDay ? { date: form.startDate } : { dateTime: new Date(`${form.startDate}T${form.startTime}`).toISOString(), timeZone: form.timeZone },
    end: form.isAllDay ? { date: form.endDate } : { dateTime: new Date(`${form.endDate}T${form.endTime}`).toISOString(), timeZone: form.timeZone },
  };
  emit('submit', { body });
};

onMounted(async () => {
  userStore.setLoading(true, 'Loading the event...');
  try {
    // 編集対象のイベントが選択されていない場合は新規作成
    if (!userStore.nowSelectedEvent) {
      source.value = null;
      const start = userStore.nowSelectedDate ? toDayjs(userStore.nowSelectedDate) : toDayjs(new Date());
      const end = userStore.nowSelectedDate ? toDayjs(userStore.nowSelectedDate).add(1, 'hour') : toDayjs(new Date()).add(1, 'hour');
      Object.assign(form, {
        summary: '',
        description: '',
        location: '',
        gCalendarId: calendarStore.listWritableCalendars[0]?.id ?? '',
        icon: '',
        isAllDay: true,
        startDate: start.format('YYYY-MM-DD'),
        startTime: start.format('HH:mm'),
        endDate: end.format('YYYY-MM-DD'),
        endTime: end.format('HH:mm'),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    }
    // 編集対象のイベントが選択されている場合は、イベントを取得してフォームに反映
    else {
      source.value = await eventStore.getEventById(userStore.nowSelectedEvent.eid, userStore.nowSelectedEvent.cid);

      const start = (source.value && (source.value.start?.dateTime ?? source.value.start?.date))
        ? toDayjs(source.value.start.dateTime ?? source.value.start.date)
        : toDayjs(new Date());

      const end =
        (source.value && (source.value.end?.dateTime ?? source.value.end?.date))
          ? toDayjs(source.value.end.dateTime ?? source.value.end.date)
          : toDayjs(new Date()).add(1, 'hour');

      Object.assign(form, {
        summary: source.value?.summary ?? '',
        description: source.value?.description ?? '',
        location: source.value?.location ?? '',
        gCalendarId: source.value?.sourceCalendarId ?? calendarStore.listWritableCalendars[0]?.id ?? '',
        icon: getEventIcon(source.value),
        isAllDay: !!source.value?.start?.date,
        startDate: start.format('YYYY-MM-DD'),
        startTime: start.format('HH:mm'),
        endDate: end.format('YYYY-MM-DD'),
        endTime: end.format('HH:mm'),
        timeZone: source.value?.start?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    }

  } catch (err) {
    userStore.setError(true, err);
  } finally {
    userStore.setLoading(false);
  }
});
</script>

<template>
  <form class="event-form" @submit.prevent="submit">
    <div class="title-row">
      <label>Icon <input v-model="form.icon" maxlength="2" placeholder="📅" /></label>
      <label>Title <input v-model="form.summary" autofocus required placeholder="Title for the event" /></label>
    </div>
    <label>
      Save to...
      <select v-model="form.gCalendarId" required>
        <option value="" disabled>Select a calendar</option>
        <option v-for="cal in calendarStore.listWritableCalendars" :key="cal.id" :value="cal.id">{{ cal.summary }}
        </option>
      </select>
    </label>
    <label class="check-row"><input v-model="form.isAllDay" type="checkbox" /> All-Day</label>
    <div class="date-grid">
      <label>Start Date <input v-model="form.startDate" type="date" required @change="checkDateTime" /></label>
      <label>End Date <input v-model="form.endDate" type="date" required @change="checkDateTime" /></label>
      <label v-if="!form.isAllDay">Start Time <input v-model="form.startTime" type="time" required
          @change="checkDateTime" /></label>
      <label v-if="!form.isAllDay">End Time <input v-model="form.endTime" type="time" required
          @change="checkDateTime" /></label>
    </div>
    <p v-if="formErrors.dateTime" class="error">{{ formErrors.dateTime }}</p>
    <label v-if="!form.isAllDay">Time Zone
      <TimezoneSelecter v-model="form.timeZone" />
    </label>
    <label>Place <input v-model="form.location" placeholder="Place or online meeting URL" /></label>
    <label>Description <textarea v-model="form.description" rows="5"
        placeholder="Description of the event"></textarea></label>
    <div class="actions-row">
      <button type="button" @click="emit('cancel')">Cancel</button>
      <button data-app-button="primary" type="submit">{{ props.submitLabel }}</button>
    </div>
  </form>
</template>

<style lang="scss" scoped>
.event-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  width: 100%;
}

label {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: var(--text-size-xs);
}

.title-row {
  display: flex;
  gap: var(--space-xs);

  label {
    &:first-child {
      width: 48px;

      input {
        text-align: center;
      }
    }

    &:last-child {
      flex: 1;
    }
  }
}

.check-row {
  flex-direction: row;
  align-items: center;
  gap: var(--space-sm);
}

.date-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-sm);
}

.actions-row {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}
</style>
