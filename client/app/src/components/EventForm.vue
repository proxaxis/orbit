<script setup>
import { computed, reactive, ref, onMounted, onUnmounted, watch } from 'vue';
import dayjs, { toDayjs } from '@/services/dayjs.js';
import { useUserStore } from '@/stores/user.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useEventStore } from '@/stores/event.js';
import { usePeopleStore } from '@/stores/people.js';
import TimezoneSelecter from '@/components/TimezoneSelecter.vue';
import CalendarRibbon from '@/components/CalendarRibbon.vue';
import EmojiSelecter from '@/components/EmojiSelecter.vue';
import IconAnglesDown from '@/components/icons/IconAnglesDown.vue';
import IconXMark from '@/components/icons/IconXMark.vue';

const props = defineProps({
  submitLabel: { type: String, default: '保存' },
});

const emit = defineEmits(['submit', 'cancel']);

const userStore = useUserStore();
const calendarStore = useCalendarStore();
const eventStore = useEventStore();
const peopleStore = usePeopleStore();

// #region State
/** @type {Ref<boolean>} People API 検索中かどうか */
const isSearchingPeople = ref(false);
/** @type {Ref<string[]>} 最近使ったタイトル候補 */
const titleSuggestions = ref([]);
/** @type {Ref<string|null>} フォームの日付と時間に関するエラーメッセージ */
const dateTimeError = ref(null);
/** @type {Ref<HandyCalendarEvent|null>} オリジナルのイベントデータ */
const originalEvent = ref(null);
/** @type {Ref<string>} 出席者の検索クエリ */
const attendeeQuery = ref('');
/** @type {Ref<Array<GoogleCalendarAttendee & { email: string }>>} 招待済み参加者 */
const attendees = ref([]);
/** @type {Ref<string[]>} People 登録チェックが入った未知メールアドレス */
const peopleRegistrationEmails = ref([]);
/** @type {number|null} People API 検索のデバウンスタイマー */
let peopleSearchTimer = null;
/** @type {number} People API 検索の世代 */
let peopleSearchGeneration = 0;
/** @type {{startDate: string, endDate: string, startTime: string, endTime: string}} 入力された日付と時間 */
const dateFields = reactive({ startDate: '', endDate: '', startTime: '', endTime: '' });

const formData = reactive({
  summary: '',
  description: '',
  location: '',
  calendarId: '',
  icon: '',
  isAllDay: true,
  startDateTime: dayjs(),
  endDateTime: dayjs(),
  timeZone: '',
});
// #endregion

// #region Date and time

/** @param {string} value @returns {string} 日付を桁数に応じて空白区切りで表示します。 */
function formatDateField(value) {
  if (value.length === 8) return `${value.slice(0, 4)} ${value.slice(4, 6)} ${value.slice(6, 8)}`;
  if (value.length === 6) return `${value.slice(0, 2)} ${value.slice(2, 4)} ${value.slice(4, 6)}`;
  if (value.length === 4) return `${value.slice(0, 2)} ${value.slice(2, 4)}`;
  return value;
}

/** @param {string} value @returns {string} 時刻を2桁ずつ空白区切りで表示します。 */
function formatTimeField(value) {
  return value.length === 4 ? `${value.slice(0, 2)} ${value.slice(2, 4)}` : value;
}

/** @param {'startDate'|'endDate'|'startTime'|'endTime'} field @param {Event} event 入力イベント */
function updateDateTimeField(field, event) {
  const input = /** @type {HTMLInputElement} */ (event.currentTarget);
  const maxLength = field.endsWith('Date') ? 8 : 4;
  dateFields[field] = input.value.replace(/\D/g, '').slice(0, maxLength);
}

const dateTimeCalculator = computed(() => {
  const now = dayjs();
  const startDate = dateFields.startDate;
  const endDate = dateFields.endDate;
  const startTime = dateFields.startTime;
  const endTime = dateFields.endTime;

  /** @type {number} 計算された開始の年月日（負の値は無効）*/
  let sYear = now.year(),
    sMonth = now.month() + 1,
    sDate = now.date();
  // YYYY MM DD の時
  if (startDate.length === 8) {
    sYear = Number(startDate.slice(0, 4));
    sMonth = Number(startDate.slice(4, 6));
    sDate = Number(startDate.slice(6, 8));
  }
  // YY MM DD の時
  else if (startDate.length === 6) {
    sYear = Number(startDate.slice(0, 2)) + 2000;
    sMonth = Number(startDate.slice(2, 4));
    sDate = Number(startDate.slice(4, 6));
  }
  // MM DD の時
  else if (startDate.length === 4) {
    sMonth = Number(startDate.slice(0, 2));
    sDate = Number(startDate.slice(2, 4));
  }
  // それ以外の時は無効
  else {
    sYear = -1;
    sMonth = -1;
    sDate = -1;
  }

  /** @type {number} 計算された終了の年月日（負の値は無効）*/
  let eYear = now.year(),
    eMonth = now.month() + 1,
    eDate = now.date();
  if (endDate.length === 8) {
    eYear = Number(endDate.slice(0, 4));
    eMonth = Number(endDate.slice(4, 6));
    eDate = Number(endDate.slice(6, 8));
  } else if (endDate.length === 6) {
    eYear = Number(endDate.slice(0, 2)) + 2000;
    eMonth = Number(endDate.slice(2, 4));
    eDate = Number(endDate.slice(4, 6));
  } else if (endDate.length === 4) {
    eMonth = Number(endDate.slice(0, 2));
    eDate = Number(endDate.slice(2, 4));
    if (sMonth > 0 && eMonth < sMonth) eYear += 1;
  } else if (endDate.length === 2) {
    eDate = Number(endDate.slice(0, 2));
    if (sDate > 0 && eDate < sDate) {
      if (sMonth > 0 && sMonth + 1 > 12) ((eMonth = 1), (eYear += 1));
      else if (sMonth > 0) eMonth = sMonth + 1;
    }
  } else {
    eYear = -1;
    eMonth = -1;
    eDate = -1;
  }

  /** @type {number} 計算された開始の時刻（負の値は無効）*/
  let sHour = now.hour(),
    sMinute = now.minute() - (now.minute() % 10);
  // 終日の時は 00:00 にする
  if (formData.isAllDay) {
    sHour = 0;
    sMinute = 0;
  }
  // HH MM の時
  else if (startTime.length === 4) {
    sHour = Number(startTime.slice(0, 2));
    sMinute = Number(startTime.slice(2, 4));
  }
  // HH の時
  else if (startTime.length === 2) {
    sHour = Number(startTime.slice(0, 2));
    sMinute = 0;
  }
  // それ以外の時は無効
  else {
    sHour = -1;
    sMinute = -1;
  }

  /** @type {number} 計算された終了の時刻（負の値は無効）*/
  let eHour = now.hour() + 1,
    eMinute = now.minute() - (now.minute() % 10);
  // 終日の時は 23:59 にする
  if (formData.isAllDay) {
    eHour = 23;
    eMinute = 59;
  }
  // HH MM の時
  else if (endTime.length === 4) {
    eHour = Number(endTime.slice(0, 2));
    eMinute = Number(endTime.slice(2, 4));
  }
  // HH の時
  else if (endTime.length === 2) {
    eHour = Number(endTime.slice(0, 2));
    eMinute = 0;
  }
  // それ以外の時は無効
  else {
    eHour = -1;
    eMinute = -1;
  }

  const isStartThisYear = sYear === now.year();
  const isEndThisYear = eYear === now.year();
  let sFormatString = '',
    eFormatString = '';
  // 開始日時と終了日時のフォーマットを決定
  if (formData.isAllDay && isStartThisYear && isEndThisYear) ((sFormatString = '今年 M月 D日 (ddd)'), (eFormatString = 'M月 D日 (ddd)'));
  else if (formData.isAllDay && isStartThisYear) ((sFormatString = '今年 M月 D日 (ddd)'), (eFormatString = 'YYYY年 M月 D日 (ddd)'));
  else if (!formData.isAllDay && isStartThisYear && isEndThisYear) ((sFormatString = '今年 M月 D日 (ddd) HH:mm'), (eFormatString = 'M月 D日 (ddd) HH:mm'));
  else if (!formData.isAllDay && isStartThisYear) ((sFormatString = '今年 M月 D日 (ddd) HH:mm'), (eFormatString = 'YYYY年 M月 D日 (ddd) HH:mm'));
  else ((sFormatString = 'YYYY年 M月 D日 (ddd) HH:mm'), (eFormatString = 'YYYY年 M月 D日 (ddd) HH:mm'));
  // エラーが含まれる場合はフェンスにする
  if (sYear < 0 || sMonth < 0 || sDate < 0 || sHour < 0 || sMinute < 0) sFormatString = sFormatString.replace(/(YYYY|M|D|ddd|HH:mm)/g, '--').replace(/今年\s/g, '');
  if (eYear < 0 || eMonth < 0 || eDate < 0 || eHour < 0 || eMinute < 0) eFormatString = eFormatString.replace(/(YYYY|M|D|ddd|HH:mm)/g, '--');

  let resultStartString = '';
  let resultEndString = '';
  if (dayjs(`${sYear}-${sMonth}-${sDate} ${sHour}:${sMinute}`, 'YYYY-M-D H:m').isValid()) {
    resultStartString = dayjs(`${sYear}-${sMonth}-${sDate} ${sHour}:${sMinute}`, 'YYYY-M-D H:m')?.format(sFormatString) ?? '--年 --月 --日 (--) --:--';
  } else {
    resultStartString = '--年 --月 --日 (--) --:--';
  }
  if (dayjs(`${eYear}-${eMonth}-${eDate} ${eHour}:${eMinute}`, 'YYYY-M-D H:m').isValid()) {
    resultEndString = dayjs(`${eYear}-${eMonth}-${eDate} ${eHour}:${eMinute}`, 'YYYY-M-D H:m')?.format(eFormatString) ?? '--年 --月 --日 (--) --:--';
  } else {
    resultEndString = '--年 --月 --日 (--) --:--';
  }
  return { start: resultStartString, end: resultEndString };
});

/** タイトル入力に対応する履歴候補を更新します。 */
function updateTitleSuggestions() {
  titleSuggestions.value = userStore.getRecentEventTitleSuggestions(formData.summary);
}

/** @param {string} title 履歴から選択したタイトル */
function selectRecentTitle(title) {
  formData.summary = title;
  titleSuggestions.value = [];
}

/** @param {KeyboardEvent} keyboardEvent Enter で次の入力項目へ移動します。 */
function focusNextOnEnter(keyboardEvent) {
  const current = keyboardEvent.currentTarget;
  if (!(current instanceof HTMLInputElement || current instanceof HTMLTextAreaElement || current instanceof HTMLButtonElement)) return;
  const form = current.form;
  if (!form) return;
  const fields = Array.from(form.querySelectorAll('[data-enter-focus]'));
  const index = fields.indexOf(current);
  const next = fields[index + 1];
  if (!next) return;
  keyboardEvent.preventDefault();
  /** @type {HTMLElement} */ (next).focus();
}

function validateDateTime() {
  dateTimeError.value = null;

  if (!formData.isAllDay && formData.endDateTime.toDate() <= formData.startDateTime.toDate()) {
    dateTimeError.value = 'Set the end date or time after the start date or time.';
    return false;
  }
  return true;
}
// #endregion

// #region Form submission and attendees
function submitForm() {
  if (!validateDateTime()) return;
  const body = {
    summary: formData.summary.trim(),
    description: formData.description.trim() || undefined,
    location: formData.location.trim() || undefined,
    ...(attendees.value.length ? { attendees: attendees.value } : {}),
    ...(formData.icon ? { extendedProperties: { shared: { icon: formData.icon } } } : {}),
    start: formData.isAllDay ? { date: formData.startDateTime.format('YYYY-MM-DD') } : { dateTime: formData.startDateTime.toISOString(), timeZone: formData.timeZone },
    end: formData.isAllDay ? { date: formData.endDateTime.format('YYYY-MM-DD') } : { dateTime: formData.endDateTime.toISOString(), timeZone: formData.timeZone },
  };
  emit('submit', { body, peopleToCreate: peopleRegistrationEmails.value });
}

/** @param {KeyboardEvent} keyboardEvent 招待先入力の Enter 処理 */
function addUnknownAttendee(keyboardEvent) {
  if (keyboardEvent.key !== 'Enter') return;
  keyboardEvent.preventDefault();
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
// #endregion

// #region People search
watch(attendeeQuery, (query, _previousQuery, onCleanup) => {
  if (peopleSearchTimer !== null) window.clearTimeout(peopleSearchTimer);
  const searchGeneration = ++peopleSearchGeneration;
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2 || (normalizedQuery.startsWith('@') && normalizedQuery.length < 3)) {
    isSearchingPeople.value = false;
    peopleStore.clearSuggestions();
    return;
  }

  isSearchingPeople.value = true;
  peopleSearchTimer = window.setTimeout(async () => {
    try {
      await peopleStore.search(normalizedQuery);
    } finally {
      if (searchGeneration === peopleSearchGeneration) isSearchingPeople.value = false;
      peopleSearchTimer = null;
    }
  }, 300);
  onCleanup(() => {
    if (peopleSearchTimer !== null) window.clearTimeout(peopleSearchTimer);
  });
});

onUnmounted(() => {
  peopleSearchGeneration += 1;
  if (peopleSearchTimer !== null) window.clearTimeout(peopleSearchTimer);
});

// #endregion

// #region Form field synchronization

onMounted(async () => {
  userStore.setLoading(true, 'Loading the event...');
  try {
    // 編集対象のイベントが選択されていない場合は新規作成
    if (!userStore.nowSelectedEvent) {
      originalEvent.value = null;
      Object.assign(formData, {
        summary: '',
        description: '',
        location: '',
        calendarId: calendarStore.listWritableCalendars[0]?.id ?? '',
        icon: '',
        isAllDay: true,
        startDateTime: userStore.nowSelectedDate ? toDayjs(userStore.nowSelectedDate) : toDayjs(),
        endDateTime: userStore.nowSelectedDate ? toDayjs(userStore.nowSelectedDate).add(1, 'hour') : toDayjs().add(1, 'hour'),
        timeZone: userStore.timeZone,
      });
      Object.assign(dateFields, {
        startDate: formData.startDateTime.format('MMDD'),
        endDate: formData.endDateTime.format('MMDD'),
        startTime: formData.startDateTime.format('HHmm'),
        endTime: formData.endDateTime.format('HHmm'),
      });
    }
    // 編集対象のイベントが選択されている場合は、イベントを取得してフォームに反映
    else {
      originalEvent.value = await eventStore.getEventById(userStore.nowSelectedEvent.eid, userStore.nowSelectedEvent.cid);

      Object.assign(formData, {
        summary: originalEvent.value?.summary ?? '',
        description: originalEvent.value?.description ?? '',
        location: originalEvent.value?.location ?? '',
        calendarId: originalEvent.value?.calendarId ?? calendarStore.listWritableCalendars[0]?.id ?? '',
        icon: originalEvent.value?.icon ?? '',
        isAllDay: !!originalEvent.value?.isAllDay,
        startDateTime: originalEvent.value?.startDateTime,
        endDateTime: originalEvent.value?.endDateTime,
        timeZone: originalEvent.value?.timeZone ?? userStore.timeZone,
      });

      Object.assign(dateFields, {
        startDate: formData.startDateTime.format('YYYYMMDD'),
        endDate: formData.endDateTime.format('YYYYMMDD'),
        startTime: formData.startDateTime.format('HHmm'),
        endTime: formData.endDateTime.format('HHmm'),
      });
      attendees.value = (originalEvent.value?.raw?.attendees ?? []).reduce((result, attendee) => {
        if (typeof attendee.email === 'string') result.push({ ...attendee, email: attendee.email });
        return result;
      }, /** @type {Array<GoogleCalendarAttendee & { email: string }>} */ ([]));
    }
  } catch (err) {
    userStore.setError(true, err);
  } finally {
    userStore.setLoading(false);
  }
});

watch(() => formData.summary, updateTitleSuggestions);
// #endregion
</script>

<template>
  <form @submit.prevent="submitForm">
    <div>
      <label
        >アイコン
        <EmojiSelecter v-model="formData.icon" />
      </label>
      <label
        >タイトル
        <input v-model="formData.summary" autofocus required placeholder="このイベントのタイトルを入力" data-enter-focus @keydown.enter="focusNextOnEnter" @focus="updateTitleSuggestions" />
        <ul v-if="titleSuggestions.length">
          <li v-for="title in titleSuggestions" :key="title">
            <button type="button" @mousedown.prevent="selectRecentTitle(title)">{{ title }}</button>
          </li>
        </ul>
      </label>
    </div>
    <fieldset>
      <legend>保存先...</legend>
      <p v-if="!calendarStore.listWritableCalendars.length">書き込み可能なカレンダーがありません</p>
      <div v-else>
        <CalendarRibbon v-for="calendar in calendarStore.listWritableCalendars" :key="calendar.id" :gCalendarId="calendar.id" :selectable="true" :selected="formData.calendarId === calendar.id" @select="formData.calendarId = $event" />
      </div>
    </fieldset>
    <label><input v-model="formData.isAllDay" type="checkbox" /> 終日</label>
    <div>
      <div>
        <div>
          <span>開始年月日</span>
          <input :value="formatDateField(dateFields.startDate)" inputmode="numeric" maxlength="10" placeholder="YYYY MM DD" aria-label="開始年月日" required data-enter-focus @keydown.enter="focusNextOnEnter" @input="updateDateTimeField('startDate', $event)" />
        </div>
        <div>
          <span>時間</span>
          <input :value="formatTimeField(dateFields.startTime)" :disabled="formData.isAllDay" inputmode="numeric" maxlength="5" placeholder="HH MM" aria-label="開始時間" required data-enter-focus @keydown.enter="focusNextOnEnter" @input="updateDateTimeField('startTime', $event)" />
        </div>
      </div>
      <div>
        <div>
          <span>終了年月日</span>
          <input :value="formatDateField(dateFields.endDate)" inputmode="numeric" maxlength="10" placeholder="YYYY MM DD" aria-label="終了年月日" required data-enter-focus @keydown.enter="focusNextOnEnter" @input="updateDateTimeField('endDate', $event)" />
        </div>
        <div>
          <span>時間</span>
          <input :value="formatTimeField(dateFields.endTime)" :disabled="formData.isAllDay" inputmode="numeric" maxlength="5" placeholder="HH MM" aria-label="終了時間" required data-enter-focus @keydown.enter="focusNextOnEnter" @input="updateDateTimeField('endTime', $event)" />
        </div>
      </div>
    </div>
    <p>
      <span>{{ dateTimeCalculator.start }}</span> <IconAnglesDown /><span>{{ dateTimeCalculator.end }}</span>
    </p>
    <p v-if="dateTimeError">{{ dateTimeError }}</p>
    <label v-if="!formData.isAllDay"
      >タイムゾーン
      <TimezoneSelecter v-model="formData.timeZone" />
    </label>
    <label>場所 <input v-model="formData.location" placeholder="場所またはオンラインミーティングの URL" data-enter-focus @keydown.enter="focusNextOnEnter" /></label>
    <label>説明 <textarea v-model="formData.description" rows="5" placeholder="イベントの説明" data-enter-focus @keydown.enter="focusNextOnEnter"></textarea></label>
    <div>
      <label for="attendee-query">招待するユーザー</label>
      <div>
        <span v-for="attendee in attendees" :key="attendee.email">
          {{ attendee.displayName || attendee.email }}
          <label v-if="!attendee.displayName"> <input type="checkbox" :checked="peopleRegistrationEmails.includes(attendee.email)" @change="togglePeopleRegistration(attendee.email)" />連絡先に登録 </label>
          <button type="button" :aria-label="`${attendee.email}を削除`" @click="removeAttendee(attendee.email)"><IconXMark /></button>
        </span>
      </div>
      <input id="attendee-query" v-model="attendeeQuery" autocomplete="off" placeholder="名前またはメールアドレス" data-enter-focus @keydown.enter="focusNextOnEnter" @keydown="addUnknownAttendee" @blur="clearPeopleSuggestionsLater" />
      <p v-if="attendeeQuery.startsWith('@')">ラベルで検索中</p>
      <p v-else-if="attendeeQuery.includes('@')">Enter で未知のメールアドレスを追加</p>
      <ul v-if="isSearchingPeople || peopleStore.suggestions.length || attendeeQuery.includes('@')">
        <li v-if="isSearchingPeople">検索中...</li>
        <li v-for="person in peopleStore.suggestions" :key="person.resourceName">
          <button type="button" @mousedown.prevent="addAttendee(person)">
            <span>{{ person.names?.[0]?.displayName || '名前なし' }}</span>
            <small>{{ person.emailAddresses?.[0]?.value }}</small>
          </button>
        </li>
        <li v-if="!isSearchingPeople && !peopleStore.suggestions.length && attendeeQuery.includes('@') && !attendeeQuery.startsWith('@')">
          <button type="button" @mousedown.prevent="addUnknownEmail">
            <span>メールアドレスを招待</span>
            <small>{{ attendeeQuery }}</small>
          </button>
        </li>
        <li v-if="!isSearchingPeople && !peopleStore.suggestions.length && !attendeeQuery.includes('@')">候補が見つかりません</li>
      </ul>
    </div>
    <div>
      <button type="button" @click="emit('cancel')">キャンセル</button>
      <button data-app-button="primary" type="submit" data-enter-focus @keydown.enter.prevent="submitForm">{{ props.submitLabel }}</button>
    </div>
  </form>
</template>

<style lang="scss" scoped>
form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  width: 100%;

  > label,
  > div:nth-of-type(3) {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    font-size: var(--text-size-xs);
  }
}

form > div:first-child {
  display: flex;
  gap: var(--space-xs);
  min-width: 0;

  > label {
    font-size: var(--text-size-xs);
    display: flex;
    flex-direction: column;

    &:nth-child(2) {
      flex-grow: 1;
    }
  }
}

form > div:first-child ul,
form > div:nth-of-type(3) ul {
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

form > div:first-child ul button,
form > div:nth-of-type(3) ul button {
  width: 100%;
  padding: var(--space-xs) var(--space-sm);
  text-align: left;

  &:hover {
    background: var(--bg-2);
  }
}

form > fieldset {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  padding: var(--space-sm);
  max-height: 12rem;
  overflow-y: auto;

  legend {
    padding: 0 var(--space-xs);
    font-size: var(--text-size-xs);
  }

  > p {
    color: var(--text-light);
    font-size: var(--text-size-xs);
  }

  div {
    width: 100%;
  }
}

form > label:first-of-type {
  flex-direction: row;
  align-items: center;
  gap: var(--space-sm);
}

form > div:nth-of-type(2) {
  width: 100%;
  min-width: 0;

  > div {
    display: flex;
    gap: var(--space-xs);

    > div {
      display: flex;
      flex-grow: 1;
      min-width: 0;
      flex-direction: column;

      > span {
        font-size: var(--text-size-xs);
      }

      > input {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;

        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }
    }
  }
}

form > p {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--border-radius);
  background: var(--bg-2);
  font-size: var(--text-size-sm);
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;

  .icon-angles-right {
    width: 1rem;
    height: 1rem;
    margin: auto;
  }
}

form > p:nth-of-type(2) {
  border-left-color: var(--danger);
  color: var(--danger);
}

form > div:nth-of-type(3) {
  position: relative;

  > div:first-of-type {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);
  }

  > div:first-of-type > span {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-xxs) var(--space-xs);
    border-radius: var(--border-radius);
    background: var(--bg-2);
  }

  > div:first-of-type label {
    flex-direction: row;
    align-items: center;
    gap: var(--space-xxs);
    color: var(--text-light);
    font-size: var(--text-size-xxs);
  }

  > p {
    color: var(--text-light);
    font-size: var(--text-size-xxs);
  }

  > ul small {
    color: var(--text-light);
  }
}

form > div:last-child {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}

form > div:nth-of-type(3) {
  > div:first-of-type {
    label {
      display: flex;
      align-items: center;
    }
    button {
      padding: 0;
      color: var(--text-light);
    }
  }
  > ul button {
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
}

textarea {
  resize: vertical;
}
</style>
