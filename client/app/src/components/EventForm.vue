<script setup>
import { reactive, ref, onMounted, watch } from 'vue';
import { toDayjs } from '@/services/dayjs.js';
import { useUserStore } from '@/stores/user.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useEventStore } from '@/stores/event.js';
import { usePeopleStore } from '@/stores/people.js';
import TimezoneSelecter from '@/components/TimezoneSelecter.vue';

const props = defineProps({
  submitLabel: { type: String, default: '保存' },
});

const emit = defineEmits(['submit', 'cancel']);

const userStore = useUserStore();
const calendarStore = useCalendarStore();
const eventStore = useEventStore();
const peopleStore = usePeopleStore();
/** @type {Ref<boolean>} People API 検索中かどうか */
const isSearchingPeople = ref(false);

/** @type {Ref<string|null>} フォームのエラーメッセージ */
const formErrorsOnDateTime = ref(null);

/** @type {Ref<HandyCalendarEvent|null>} オリジナルのイベントデータ */
const event = ref(null);
/** @type {Ref<string>} 招待先の検索入力 */
const attendeeQuery = ref('');
/** @type {Ref<GoogleCalendarAttendee[]>} 招待済み参加者 */
const attendees = ref([]);
/** @type {Ref<string[]>} People 登録チェックが入った未知メールアドレス */
const peopleRegistrationEmails = ref([]);

const vmForm = reactive({
  summary: '',
  description: '',
  location: '',
  calendarId: '',
  icon: '',
  isAllDay: true,
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: '',
  timeZone: '',
});

function checkDateTime() {
  formErrorsOnDateTime.value = null;

  if (!vmForm.isAllDay && new Date(`${vmForm.endDate}T${vmForm.endTime}`) <= new Date(`${vmForm.startDate}T${vmForm.startTime}`)) {
    formErrorsOnDateTime.value = 'Set the end date or time after the start date or time.';
    return false;
  }
  return true;
}

function submit() {
  if (!checkDateTime()) return;
  const body = {
    summary: vmForm.summary.trim(),
    description: vmForm.description.trim() ?? undefined,
    location: vmForm.location.trim() ?? undefined,
    ...(attendees.value.length ? { attendees: attendees.value } : {}),
    ...(vmForm.icon ? { extendedProperties: { shared: { icon: vmForm.icon } } } : {}),
    start: vmForm.isAllDay ? { date: vmForm.startDate } : { dateTime: new Date(`${vmForm.startDate}T${vmForm.startTime}`).toISOString(), timeZone: vmForm.timeZone },
    end: vmForm.isAllDay ? { date: vmForm.endDate } : { dateTime: new Date(`${vmForm.endDate}T${vmForm.endTime}`).toISOString(), timeZone: vmForm.timeZone },
  };
  emit('submit', { body, peopleToCreate: peopleRegistrationEmails.value });
};

/** @param {KeyboardEvent} evt 招待先入力の Enter 処理 */
function addUnknownAttendee(evt) {
  if (evt.key !== 'Enter') return;
  evt.preventDefault();
  addUnknownEmail();
}

/** 入力中のメールアドレスを未知の招待先として追加します。 */
function addUnknownEmail() {
  const email = attendeeQuery.value.trim();
  if (!email || email.startsWith('@') || !email.includes('@') || attendees.value.some((attendee) => attendee.email === email)) return;
  attendees.value.push({ email, responseStatus: 'needsAction' });
  peopleRegistrationEmails.value.push(email);
  attendeeQuery.value = '';
  peopleStore.clearSuggestions();
}

/** @param {GooglePeoplePerson} person People API の候補を招待先へ追加します。 */
function addAttendee(person) {
  const email = person.emailAddresses?.find((entry) => entry.value)?.value?.trim();
  if (!email || attendees.value.some((attendee) => attendee.email === email)) return;
  attendees.value.push({ email, displayName: person.names?.[0]?.displayName, responseStatus: 'needsAction' });
  attendeeQuery.value = '';
  peopleStore.clearSuggestions();
}

/** @param {string} email 招待先メールアドレスを削除します。 */
function removeAttendee(email) {
  attendees.value = attendees.value.filter((attendee) => attendee.email !== email);
  peopleRegistrationEmails.value = peopleRegistrationEmails.value.filter((item) => item !== email);
}

/** @param {string} email People 登録対象を切り替えます。 */
function togglePeopleRegistration(email) {
  if (peopleRegistrationEmails.value.includes(email)) peopleRegistrationEmails.value = peopleRegistrationEmails.value.filter((item) => item !== email);
  else peopleRegistrationEmails.value.push(email);
}

/** 入力欄からフォーカスが外れた後、候補選択の時間を確保して一覧を閉じます。 */
function clearPeopleSuggestionsLater() {
  window.setTimeout(() => peopleStore.clearSuggestions(), 150);
}

watch(attendeeQuery, async (query) => {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2 || (normalizedQuery.startsWith('@') && normalizedQuery.length < 3)) {
    peopleStore.clearSuggestions();
    return;
  }
  isSearchingPeople.value = true;
  try {
    await peopleStore.search(query);
  } finally {
    isSearchingPeople.value = false;
  }
});

onMounted(async () => {
  userStore.setLoading(true, 'Loading the event...');
  try {
    // 編集対象のイベントが選択されていない場合は新規作成
    if (!userStore.nowSelectedEvent) {
      event.value = null;
      const start = userStore.nowSelectedDate ? toDayjs(userStore.nowSelectedDate) : toDayjs();
      const end = userStore.nowSelectedDate ? toDayjs(userStore.nowSelectedDate).add(1, 'hour') : toDayjs().add(1, 'hour');
      Object.assign(vmForm, {
        summary: '',
        description: '',
        location: '',
        calendarId: calendarStore.listWritableCalendars[0]?.id ?? '',
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
      event.value = await eventStore.getEventById(userStore.nowSelectedEvent.eid, userStore.nowSelectedEvent.cid);

      const start = event.value?.startDateTime;

      Object.assign(vmForm, {
        summary: event.value?.summary ?? '',
        description: event.value?.description ?? '',
        location: event.value?.location ?? '',
        calendarId: event.value?.calendarId ?? calendarStore.listWritableCalendars[0]?.id ?? '',
        icon: event.value?.icon ?? '',
        isAllDay: !!event.value?.isAllDay,
        startDate: event.value?.startDateTime.format('YYYY-MM-DD'),
        startTime: event.value?.startDateTime.format('HH:mm'),
        endDate: event.value?.endDateTime.format('YYYY-MM-DD'),
        endTime: event.value?.endDateTime.format('HH:mm'),
        timeZone: event.value?.timeZone ?? userStore.timeZone,
      });
      attendees.value = event.value?.attendees?.map((attendee) => ({ ...attendee })) ?? [];
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
      <label>Icon <input v-model="vmForm.icon" maxlength="2" placeholder="📌" /></label>
      <label>Title <input v-model="vmForm.summary" autofocus required placeholder="Title for the event" /></label>
    </div>
    <label>
      Save to...
      <select v-model="vmForm.calendarId" required>
        <option value="" disabled>Select a calendar</option>
        <option v-for="cal in calendarStore.listWritableCalendars" :key="cal.id" :value="cal.id">{{ cal.summary }}
        </option>
      </select>
    </label>
    <label class="check-row"><input v-model="vmForm.isAllDay" type="checkbox" /> All-Day</label>
    <div class="date-grid">
      <label>Start Date <input v-model="vmForm.startDate" type="date" required @change="checkDateTime" /></label>
      <label>End Date <input v-model="vmForm.endDate" type="date" required @change="checkDateTime" /></label>
      <label v-if="!vmForm.isAllDay">Start Time <input v-model="vmForm.startTime" type="time" required
          @change="checkDateTime" /></label>
      <label v-if="!vmForm.isAllDay">End Time <input v-model="vmForm.endTime" type="time" required
          @change="checkDateTime" /></label>
    </div>
    <p v-if="formErrorsOnDateTime" class="error">{{ formErrorsOnDateTime }}</p>
    <label v-if="!vmForm.isAllDay">Time Zone
      <TimezoneSelecter v-model="vmForm.timeZone" />
    </label>
    <label>Place <input v-model="vmForm.location" placeholder="Place or online meeting URL" /></label>
    <label>Description <textarea v-model="vmForm.description" rows="5"
        placeholder="Description of the event"></textarea></label>
    <div class="attendee-field">
      <label for="attendee-query">招待するユーザー</label>
      <div class="attendee-chips">
        <span v-for="attendee in attendees" :key="attendee.email" class="attendee-chip">
          {{ attendee.displayName || attendee.email }}
          <label v-if="!attendee.displayName" class="people-registration-check">
            <input type="checkbox" :checked="peopleRegistrationEmails.includes(attendee.email)"
              @change="togglePeopleRegistration(attendee.email)" />People に登録
          </label>
          <button type="button" :aria-label="`${attendee.email}を削除`" @click="removeAttendee(attendee.email)">×</button>
        </span>
      </div>
      <input id="attendee-query" v-model="attendeeQuery" autocomplete="off" placeholder="名前またはメールアドレス"
        @keydown="addUnknownAttendee" @blur="clearPeopleSuggestionsLater" />
      <p v-if="attendeeQuery.startsWith('@')" class="attendee-hint">ラベルで検索中</p>
      <p v-else-if="attendeeQuery.includes('@')" class="attendee-hint">Enter で未知のメールアドレスを追加</p>
      <ul v-if="isSearchingPeople || peopleStore.suggestions.length || attendeeQuery.includes('@')"
        class="people-suggestions">
        <li v-if="isSearchingPeople" class="suggestion-status">検索中...</li>
        <li v-for="person in peopleStore.suggestions" :key="person.resourceName">
          <button type="button" @mousedown.prevent="addAttendee(person)">
            <span>{{ person.names?.[0]?.displayName || '名前なし' }}</span>
            <small>{{ person.emailAddresses?.[0]?.value }}</small>
          </button>
        </li>
        <li
          v-if="!isSearchingPeople && !peopleStore.suggestions.length && attendeeQuery.includes('@') && !attendeeQuery.startsWith('@')">
          <button type="button" @mousedown.prevent="addUnknownEmail">
            <span>メールアドレスを招待</span>
            <small>{{ attendeeQuery }}</small>
          </button>
        </li>
        <li v-if="!isSearchingPeople && !peopleStore.suggestions.length && !attendeeQuery.includes('@')"
          class="suggestion-status">
          候補が見つかりません
        </li>
      </ul>
    </div>
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

textarea {
  resize: vertical;
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

.attendee-field {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: var(--text-size-xs);
}

.attendee-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.attendee-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xxs) var(--space-xs);
  border-radius: var(--border-radius);
  background: var(--bg-2);
}

.people-registration-check {
  flex-direction: row;
  align-items: center;
  gap: var(--space-xxs);
  color: var(--text-light);
  font-size: var(--text-size-xxs);
}

.attendee-hint {
  color: var(--text-light);
  font-size: var(--text-size-xxs);
}

.attendee-chip button {
  padding: 0;
  color: var(--text-light);
}

.people-suggestions {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 20;
  max-height: 12rem;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  background: var(--bg-1);
  box-shadow: 0 4px 12px var(--shadow);
}

.people-suggestions button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: var(--space-xs) var(--space-sm);
  gap: var(--space-xxs);

  &:hover {
    background: var(--bg-2);
  }
}

.people-suggestions small {
  color: var(--text-light);
}
</style>
