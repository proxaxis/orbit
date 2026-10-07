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
import { WEEKDAYS, buildRecurrence, parseRecurrence } from '@/services/rrule.js';
import { ensureNotificationPermission, notificationPermission, rescheduleNotifications } from '@/services/notifications.js';
import IconCalendar from '@/components/icons/IconCalendar.vue';
import IconBell from '@/components/icons/IconBell.vue';
import DatePicker from '@/components/DatePicker.vue';
import AccordionMenu from '@/components/AccordionMenu.vue';
import IconPlus from '@/components/icons/IconPlus.vue';

const props = defineProps({
  submitLabel: { type: String, default: '保存' },
});

const emit = defineEmits(['submit', 'cancel']);

const userStore = useUserStore();
const calendarStore = useCalendarStore();
const eventStore = useEventStore();
const peopleStore = usePeopleStore();

// #region State
/** @type {Ref<boolean>} カレンダーセレクターが開いているかどうか */
const isOpenCalendarSelecter = ref(false);
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
/** @type {Ref<'startDate'|'endDate'|null>} 開いている日付ピッカーの対象 */
const openDatePicker = ref(null);
/** @type {number|null} People API 検索のデバウンスタイマー */
let peopleSearchTimer = null;
/** @type {number} People API 検索の世代 */
let peopleSearchGeneration = 0;
/** @type {{startDate: string, endDate: string, startTime: string, endTime: string}} 入力された日付と時間 */
const dateFields = reactive({ startDate: '', endDate: '', startTime: '', endTime: '' });
/** @type {Ref<{value: number, unit: 'minute'|'hour'|'day'}[]>} イベント開始前に送る通知の一覧 */
const reminders = ref([]);
/** 通知設定の初期値スナップショット（変更検知用） */
let initialReminderKey = '[]';
/** popup 以外（email など）の既存リマインダー（編集 UI 対象外のため送信時にそのまま保持する） */
let preservedReminderOverrides = [];
const recurrence = reactive({
  frequency: '',
  interval: 1,
  weekdays: [],
  monthDay: '',
  month: '',
  count: '',
  until: '',
  exclusions: '',
  holidayAdjustment: '',
});

const formData = reactive({
  summary: '',
  description: '',
  location: '',
  privacyNote: '',
  calendarId: '',
  icon: '',
  isAllDay: true,
  startDateTime: dayjs(),
  endDateTime: dayjs(),
  timeZone: '',
});

const initialCalendarId = computed(() => {
  const writableCalendars = calendarStore.listWritableCalendars;
  return writableCalendars.some((calendar) => calendar.id === userStore.defaultCalendarId) ? userStore.defaultCalendarId : (writableCalendars[0]?.id ?? '');
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

/** @param {'startDate'|'endDate'} field */
function openDatePickerFor(field) {
  openDatePicker.value = field;
}

/** @param {'startDate'|'endDate'} field @returns {string} DatePicker 用の ISO 日付 */
function datePickerValue(field) {
  const value = dateFields[field];
  const today = dayjs();
  if (value.length === 8) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  if (value.length === 6) return `20${value.slice(0, 2)}-${value.slice(2, 4)}-${value.slice(4, 6)}`;
  if (value.length === 4) return `${today.year()}-${value.slice(0, 2)}-${value.slice(2, 4)}`;
  return today.format('YYYY-MM-DD');
}

/** @param {'startDate'|'endDate'} field @param {string} value */
function selectDate(field, value) {
  dateFields[field] = value.replace(/\D/g, '').slice(0, 8);
  const selectedDate = toDayjs(value);
  const current = field === 'startDate' ? formData.startDateTime : formData.endDateTime;
  const updated = selectedDate.hour(current.hour()).minute(current.minute()).second(current.second()).millisecond(current.millisecond());
  if (field === 'startDate') formData.startDateTime = updated;
  else formData.endDateTime = updated;
  openDatePicker.value = null;
}

/**
 * 分数を通知入力行の {value, unit} 形式に変換する
 * @param {number} minutes 開始何分前か
 * @returns {{value: number, unit: 'minute'|'hour'|'day'}}
 */
function minutesToReminder(minutes) {
  if (minutes > 0 && minutes % 1440 === 0) return { value: minutes / 1440, unit: 'day' };
  if (minutes > 0 && minutes % 60 === 0) return { value: minutes / 60, unit: 'hour' };
  return { value: minutes, unit: 'minute' };
}

/**
 * 通知入力行を分数の配列に変換する（最大5件、0〜40320分）
 * @returns {number[]}
 */
function reminderMinutesList() {
  return reminders.value
    .map((row) => (Number(row.value) || 0) * (row.unit === 'day' ? 1440 : row.unit === 'hour' ? 60 : 1))
    .map((minutes) => Math.min(40320, Math.max(0, Math.floor(minutes))))
    .slice(0, 5);
}

/** 通知を一行追加し、まだ許可がなければ通知権限を要求する */
async function addReminderRow() {
  reminders.value.push({ value: 10, unit: 'minute' });
  await ensureNotificationPermission();
}

/** @param {number} index 削除する通知行の番号 */
function removeReminderRow(index) {
  reminders.value.splice(index, 1);
}

/**
 * イベントの既存リマインダー（またはカレンダー既定値）を通知入力行に反映する
 * @param {any} evt 取得したイベント（新規作成時は null）
 * @param {string} calendarId 対象カレンダー ID
 */
function initReminders(evt, calendarId) {
  const raw = evt?.raw?.reminders;
  let minutesList = [];
  preservedReminderOverrides = [];
  if (raw?.useDefault === false) {
    const overrides = Array.isArray(raw.overrides) ? raw.overrides : [];
    minutesList = overrides.filter((/** @type {any} */ item) => item?.method === 'popup').map((/** @type {any} */ item) => item.minutes);
    preservedReminderOverrides = overrides.filter((/** @type {any} */ item) => item?.method !== 'popup' && typeof item?.minutes === 'number');
  } else {
    // useDefault の場合はカレンダー既定のリマインダーを初期表示する
    const defaults = calendarStore.list.find((/** @type {any} */ cal) => cal.id === calendarId)?.defaultReminders ?? [];
    minutesList = defaults.filter((/** @type {any} */ item) => item?.method === 'popup').map((/** @type {any} */ item) => item.minutes);
  }
  reminders.value = minutesList
    .filter((/** @type {any} */ minutes) => typeof minutes === 'number' && minutes >= 0)
    .map(minutesToReminder)
    .slice(0, 5);
  initialReminderKey = JSON.stringify(
    minutesList
      .filter((/** @type {any} */ minutes) => typeof minutes === 'number' && minutes >= 0)
      .map((/** @type {number} */ minutes) => Math.floor(minutes))
      .sort((a, b) => a - b),
  );
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
  const recurrenceData = buildRecurrence(
    /** @type {any} */ ({
      ...recurrence,
      exclusions: recurrence.exclusions.split(/[,\s]+/).filter(Boolean),
      isAllDay: formData.isAllDay,
      startDateTime: formData.startDateTime,
      timeZone: formData.timeZone,
    }),
  );
  const shared = { ...(formData.icon ? { icon: formData.icon } : {}), ...recurrenceData.shared };
  const privateProperties = { ...(originalEvent.value?.raw?.extendedProperties?.private ?? {}) };
  if (formData.privacyNote.trim()) privateProperties.privacyNote = formData.privacyNote.trim();
  else delete privateProperties.privacyNote;
  const body = {
    summary: formData.summary.trim(),
    description: formData.description.trim() || undefined,
    location: formData.location.trim() || undefined,
    ...(attendees.value.length ? { attendees: attendees.value } : {}),
    ...(Object.keys(shared).length || Object.keys(privateProperties).length ? { extendedProperties: { ...(Object.keys(shared).length ? { shared } : {}), ...(Object.keys(privateProperties).length ? { private: privateProperties } : { private: {} }) } } : {}),
    ...(recurrenceData.recurrence ? { recurrence: recurrenceData.recurrence } : {}),
    start: formData.isAllDay ? { date: formData.startDateTime.format('YYYY-MM-DD') } : { dateTime: formData.startDateTime.toISOString(), timeZone: formData.timeZone },
    end: formData.isAllDay ? { date: formData.endDateTime.format('YYYY-MM-DD') } : { dateTime: formData.endDateTime.toISOString(), timeZone: formData.timeZone },
  };
  const reminderMinutes = reminderMinutesList();
  const reminderKey = JSON.stringify([...reminderMinutes].sort((a, b) => a - b));
  if (reminderKey !== initialReminderKey) {
    // 通知設定が変更された場合のみ reminders を送信する（未変更ならカレンダー既定値のまま）
    const overrides = [...preservedReminderOverrides, ...reminderMinutes.map((minutes) => ({ method: 'popup', minutes }))];
    body.reminders = overrides.length ? { useDefault: false, overrides } : { useDefault: false };
    if (reminderMinutes.length) {
      ensureNotificationPermission().then(() => rescheduleNotifications());
    } else {
      rescheduleNotifications();
    }
  }
  emit('submit', { body, calendarId: formData.calendarId, peopleToCreate: peopleRegistrationEmails.value });
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
    await userStore.settingsReady;
    // 編集対象のイベントが選択されていない場合は新規作成
    if (!userStore.nowSelectedEvent) {
      originalEvent.value = null;
      Object.assign(formData, {
        summary: '',
        description: '',
        location: '',
        privacyNote: '',
        calendarId: initialCalendarId.value,
        icon: '',
        isAllDay: true,
        startDateTime: userStore.nowSelectedDate ? toDayjs(userStore.nowSelectedDate) : toDayjs(),
        endDateTime: userStore.nowSelectedDate ? toDayjs(userStore.nowSelectedDate).add(1, 'hour') : toDayjs().add(1, 'hour'),
        timeZone: userStore.timeZone,
      });
      Object.assign(recurrence, { frequency: '', interval: 1, weekdays: [], monthDay: '', month: '', count: '', until: '', exclusions: '', holidayAdjustment: '' });
      Object.assign(dateFields, {
        startDate: formData.startDateTime.format('MMDD'),
        endDate: formData.endDateTime.format('MMDD'),
        startTime: formData.startDateTime.format('HHmm'),
        endTime: formData.endDateTime.format('HHmm'),
      });
      initReminders(null, formData.calendarId);
    }
    // 編集対象のイベントが選択されている場合は、イベントを取得してフォームに反映
    else {
      originalEvent.value = await eventStore.getEventById(userStore.nowSelectedEvent.eid, userStore.nowSelectedEvent.cid);

      Object.assign(formData, {
        summary: originalEvent.value?.summary ?? '',
        description: originalEvent.value?.description ?? '',
        location: originalEvent.value?.location ?? '',
        privacyNote: originalEvent.value?.raw?.extendedProperties?.private?.privacyNote ?? '',
        calendarId: originalEvent.value?.calendarId ?? initialCalendarId.value,
        icon: originalEvent.value?.icon ?? '',
        isAllDay: !!originalEvent.value?.isAllDay,
        startDateTime: originalEvent.value?.startDateTime,
        endDateTime: originalEvent.value?.endDateTime,
        timeZone: originalEvent.value?.timeZone ?? userStore.timeZone,
      });
      const parsedRecurrence = parseRecurrence(originalEvent.value?.raw?.recurrence, originalEvent.value?.raw?.extendedProperties?.shared);
      Object.assign(recurrence, { ...parsedRecurrence, exclusions: parsedRecurrence.exclusions.join(', ') });

      Object.assign(dateFields, {
        startDate: formData.startDateTime.format('YYYYMMDD'),
        endDate: formData.endDateTime.format('YYYYMMDD'),
        startTime: formData.startDateTime.format('HHmm'),
        endTime: formData.endDateTime.format('HHmm'),
      });
      initReminders(originalEvent.value, formData.calendarId);
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
    <!-- アイコンとタイトル -->
    <section>
      <label>
        <span>アイコン</span>
        <EmojiSelecter v-model="formData.icon" />
      </label>
      <label>
        <span>タイトル</span>
        <input v-model="formData.summary" autofocus required placeholder="このイベントのタイトルを入力" data-enter-focus @keydown.enter="focusNextOnEnter" @focus="updateTitleSuggestions" />
        <ul v-if="titleSuggestions.length">
          <li v-for="title in titleSuggestions" :key="title">
            <button type="button" @mousedown.prevent="selectRecentTitle(title)">{{ title }}</button>
          </li>
        </ul>
      </label>
    </section>
    <!-- 保存先カレンダー -->
    <section>
      <label>
        <span>現在の保存先</span>
        <div>
          <CalendarRibbon :cid="formData.calendarId" />
          <button type="button" @click="isOpenCalendarSelecter = !isOpenCalendarSelecter">変更</button>
        </div>
      </label>
      <fieldset v-if="isOpenCalendarSelecter">
        <legend>保存先...</legend>
        <p v-if="!calendarStore.listWritableCalendars.length">書き込み可能なカレンダーがありません</p>
        <div v-else>
          <CalendarRibbon v-for="calendar in calendarStore.listWritableCalendars" :key="calendar.id" :cid="calendar.id" :selectable="true" :selected="formData.calendarId === calendar.id" @select="formData.calendarId = $event" />
        </div>
      </fieldset>
    </section>
    <!-- 終日 -->
    <section>
      <label> <input v-model="formData.isAllDay" type="checkbox" /> 終日 </label>
    </section>
    <!-- 開始日時 -->
    <section>
      <label>
        <span>開始年月日</span>
        <div>
          <button type="button" aria-label="開始日をカレンダーから選択" @click="openDatePickerFor('startDate')">
            <IconCalendar />
          </button>
          <input :value="formatDateField(dateFields.startDate)" inputmode="numeric" maxlength="10" placeholder="YYYY MM DD" aria-label="開始年月日" required data-enter-focus @keydown.enter="focusNextOnEnter" @input="updateDateTimeField('startDate', $event)" />
          <DatePicker v-if="openDatePicker === 'startDate'" :model-value="datePickerValue('startDate')" @update:model-value="selectDate('startDate', $event)" @close="openDatePicker = null" />
        </div>
      </label>
      <label>
        <span>時間</span>
        <input :value="formatTimeField(dateFields.startTime)" :disabled="formData.isAllDay" inputmode="numeric" maxlength="5" placeholder="HH MM" aria-label="開始時間" required data-enter-focus @keydown.enter="focusNextOnEnter" @input="updateDateTimeField('startTime', $event)" />
      </label>
    </section>
    <!-- 終了日時 -->
    <section>
      <label>
        <span>終了年月日</span>
        <div>
          <button type="button" aria-label="終了日をカレンダーから選択" @click="openDatePickerFor('endDate')">
            <IconCalendar />
          </button>
          <input :value="formatDateField(dateFields.endDate)" inputmode="numeric" maxlength="10" placeholder="YYYY MM DD" aria-label="終了年月日" required data-enter-focus @keydown.enter="focusNextOnEnter" @input="updateDateTimeField('endDate', $event)" />
          <DatePicker v-if="openDatePicker === 'endDate'" :model-value="datePickerValue('endDate')" @update:model-value="selectDate('endDate', $event)" @close="openDatePicker = null" />
        </div>
      </label>
      <label>
        <span>時間</span>
        <input :value="formatTimeField(dateFields.endTime)" :disabled="formData.isAllDay" inputmode="numeric" maxlength="5" placeholder="HH MM" aria-label="終了時間" required data-enter-focus @keydown.enter="focusNextOnEnter" @input="updateDateTimeField('endTime', $event)" />
      </label>
    </section>
    <!-- 日付と時間の計算結果 -->
    <section>
      <p>
        <span>{{ dateTimeCalculator.start }}</span>
        <IconAnglesDown /><span>{{ dateTimeCalculator.end }}</span>
      </p>
      <p v-if="dateTimeError">{{ dateTimeError }}</p>
    </section>
    <!-- 場所と説明とノート -->
    <section>
      <label>
        <span>場所</span>
        <input v-model="formData.location" placeholder="場所またはオンラインミーティングの URL" data-enter-focus @keydown.enter="focusNextOnEnter" />
      </label>
      <label>
        <span>説明</span>
        <textarea v-model="formData.description" rows="5" placeholder="イベントの説明" data-enter-focus @keydown.enter="focusNextOnEnter"></textarea>
      </label>
      <label>
        <span>個人用ノート</span>
        <textarea v-model="formData.privacyNote" rows="3" placeholder="自分だけに表示されます" data-enter-focus @keydown.enter="focusNextOnEnter"></textarea>
      </label>
    </section>
    <!-- 詳細設定 -->
    <AccordionMenu label="詳細設定">
      <div class="accordion-content">
        <!-- 招待するユーザー -->
        <section>
          <label for="attendee-query"><span>招待するユーザー</span></label>
          <div>
            <span v-for="attendee in attendees" :key="attendee.email">
              {{ attendee.displayName || attendee.email }}
              <label v-if="!attendee.displayName"> <input type="checkbox" :checked="peopleRegistrationEmails.includes(attendee.email)" @change="togglePeopleRegistration(attendee.email)" />連絡先に登録 </label>
              <button type="button" :aria-label="`${attendee.email}を削除`" @click="removeAttendee(attendee.email)">
                <IconXMark />
              </button>
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
        </section>
        <!-- タイムゾーン -->
        <section>
          <label v-if="!formData.isAllDay"
            ><span>タイムゾーン</span>
            <TimezoneSelecter v-model="formData.timeZone" />
          </label>
        </section>
        <!-- 繰り返し設定 -->
        <section>
          <fieldset class="recurrence-fieldset">
            <legend>繰り返し</legend>
            <label>
              <span>頻度</span>
              <select v-model="recurrence.frequency">
                <option value="">繰り返さない</option>
                <option value="DAILY">毎日</option>
                <option value="WEEKLY">毎週</option>
                <option value="MONTHLY">毎月</option>
                <option value="YEARLY">毎年</option>
              </select>
            </label>
            <template v-if="recurrence.frequency">
              <label
                ><span>間隔</span>
                <div class="inline-field">
                  <input v-model.number="recurrence.interval" type="number" min="1" max="99" />
                  {{ recurrence.frequency === 'DAILY' ? '日' : recurrence.frequency === 'WEEKLY' ? '週' : recurrence.frequency === 'MONTHLY' ? '月' : '年' }}ごと
                </div>
              </label>
              <div v-if="recurrence.frequency === 'WEEKLY' || recurrence.frequency === 'MONTHLY'" class="weekday-options">
                <span>曜日</span>
                <div>
                  <label v-for="weekday in WEEKDAYS" :key="weekday.value"><input v-model="recurrence.weekdays" type="checkbox" :value="weekday.value" />{{ weekday.label }}</label>
                </div>
              </div>
              <label v-if="recurrence.frequency === 'MONTHLY'"
                ><span>開始日</span>
                <div class="inline-field"><input v-model.number="recurrence.monthDay" type="number" min="1" max="31" placeholder="D" /> 日</div>
              </label>
              <label v-if="recurrence.frequency === 'YEARLY'"
                ><span>開始月</span>
                <div class="inline-field"><input v-model.number="recurrence.month" type="number" min="1" max="12" placeholder="M" /> 月</div>
              </label>
              <div class="recurrence-end">
                <div class="inline-field">
                  <label><span>回数</span> <input v-model.number="recurrence.count" type="number" min="1" placeholder="無制限" /></label>
                  <label><span>または期限</span> <input v-model="recurrence.until" type="date" /></label>
                </div>
              </div>
              <label><span>除外日</span> <input v-model="recurrence.exclusions" placeholder="YYYY-MM-DD, YYYY-MM-DD" /></label>
              <label>
                <span>休日の扱い</span>
                <select v-model="recurrence.holidayAdjustment">
                  <option value="">通常どおり</option>
                  <option value="NEXT_WEEKDAY">休日なら次の平日</option>
                  <option value="PREVIOUS_WEEKDAY">休日なら前の平日</option>
                </select>
              </label>
            </template>
          </fieldset>
        </section>

        <!-- 通知設定 -->
        <section>
          <span><IconBell size="0.8rem" /> 通知</span>
          <div class="notification-rows">
            <div v-for="(reminder, index) in reminders" :key="index" class="notification-row">
              <div>
                <input v-model.number="reminder.value" type="number" min="0" max="40320" :aria-label="`通知${index + 1}の時間`" />
                <select v-model="reminder.unit" :aria-label="`通知${index + 1}の単位`">
                  <option value="minute">分</option>
                  <option value="hour">時間</option>
                  <option value="day">日</option>
                </select>
                <span>前に通知</span>
              </div>
              <button type="button" :aria-label="`通知${index + 1}を削除`" @click="removeReminderRow(index)">
                <IconXMark />
              </button>
            </div>
            <button v-if="reminders.length < 5" type="button" @click="addReminderRow"><IconPlus /> 通知を追加</button>
            <p v-if="notificationPermission() === 'denied'" class="notification-warning">ブラウザの通知が拒否されています. ブラウザの設定でこのアプリからの通知を許可してください.</p>
          </div>
        </section>
      </div>
    </AccordionMenu>

    <section>
      <button data-app-button="secondary" type="button" @click="emit('cancel')">キャンセル</button>
      <button data-app-button="primary" type="submit" data-enter-focus @keydown.enter.prevent="submitForm">{{ props.submitLabel }}</button>
    </section>
  </form>
</template>

<style lang="scss" scoped>
form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  width: 100%;
}

// アイコンとタイトルの入力欄
form > section:nth-child(1) {
  width: 100%;
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;

  > label {
    display: flex;
    flex-direction: column;

    // イベントタイトルの入力欄
    &:nth-child(2) {
      flex-grow: 1;
    }

    > span {
      font-size: var(--text-size-xxs);
    }
  }
}

// 保存先の設定
form > section:nth-child(2) {
  display: flex;
  gap: var(--space-xs);
  flex-direction: column;

  fieldset {
    padding: 0 var(--space-sm) var(--space-sm) var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
    min-width: 0;

    legend {
      font-size: var(--text-size-sm);
      padding: 0 var(--space-xs);
    }
  }

  > label {
    display: flex;
    flex-direction: column;
    width: 100%;
    cursor: pointer;

    > span {
      font-size: var(--text-size-xxs);
    }

    // カレンダーリボンと変更ボタン
    > div {
      height: 100%;
      flex-grow: 1;
      display: flex;
      gap: var(--space-xs);

      .calendar-ribbon {
        background-color: var(--bg-2);
        border-radius: var(--border-radius);
        padding: 0 var(--space-xs);
      }

      > button {
        background-color: var(--bg-2);
        border: 1px solid var(--border);

        &:hover {
          background-color: var(--bg-3);
        }
      }
    }
  }
}

// 終日の入力欄
form > section:nth-child(3) {
  display: flex;
  align-items: center;

  > label {
    display: flex;
    align-items: center;
    gap: var(--space-md);
  }
}

// 日付と時間の入力欄
form > section:nth-child(4),
form > section:nth-child(5) {
  width: 100%;
  display: flex;
  gap: var(--space-xs);

  > label {
    display: flex;
    flex-direction: column;

    > span {
      font-size: var(--text-size-xxs);
    }

    > div {
      display: flex;
      gap: var(--space-xs);
      align-items: center;

      > button {
        background-color: var(--bg-2);
        border: 1px solid var(--border);

        &:hover {
          background-color: var(--bg-3);
        }
      }

      > input {
        width: calc(100% - var(--space-md) * 2);
      }
    }

    > input:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

form > section:nth-child(4) > label:nth-child(2),
form > section:nth-child(5) > label:nth-child(2) {
  > input {
    width: 4rem; // 時間入力欄の幅は小さく
  }
}

// 日付と時間の計算結果
form > section:nth-child(6) > p {
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

// 場所と説明とノートの入力欄
form > section:nth-child(7) {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);

  > label {
    display: flex;
    flex-direction: column;

    > span {
      font-size: var(--text-size-xxs);
    }

    > textarea {
      resize: vertical;
      min-height: 3rem;
    }
  }
}

// 詳細設定
form .accordion-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);

  > section {
    display: flex;
    flex-direction: column;

    > label > span,
    > span {
      font-size: var(--text-size-xxs);
    }
  }

  // 招待先
  > section:nth-child(1) {
    > div {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-xs);

      > span {
        display: inline-flex;
        align-items: center;
        gap: var(--space-xs);
        max-width: 100%;
        padding: var(--space-xs) var(--space-sm);
        border: 1px solid var(--border);
        border-radius: var(--border-radius);
        background: var(--bg-2);
        overflow-wrap: anywhere;

        > label {
          display: inline-flex;
          align-items: center;
          gap: var(--space-xxs);
          white-space: nowrap;
          font-size: var(--text-size-xs);
        }

        > button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-xxs);
          border: 0;
          background: transparent;

          &:hover {
            color: var(--danger);
          }

          svg {
            width: 0.8rem;
            height: 0.8rem;
          }
        }
      }
    }

    > input {
      width: 100%;
    }

    > p {
      margin: 0;
      color: var(--text-light);
      font-size: var(--text-size-xs);
    }

    > ul {
      display: flex;
      flex-direction: column;
      gap: var(--space-xxs);
      margin: 0;
      padding: var(--space-xs);
      border: 1px solid var(--border);
      border-radius: var(--border-radius);
      background: var(--bg-2);
      list-style: none;

      button {
        display: flex;
        flex-direction: column;
        width: 100%;
        align-items: flex-start;
        padding: var(--space-xs) var(--space-sm);
        border: 0;
        background: transparent;
        text-align: left;

        &:hover {
          background: var(--bg-3);
        }

        small {
          color: var(--text-light);
          overflow-wrap: anywhere;
        }
      }
    }
  }

  // タイムゾーン
  > section:nth-child(2) {
    > label {
      display: flex;
      flex-direction: column;
      gap: var(--space-xs);
    }
  }

  // 繰り返し設定
  > section:nth-child(3) {
    gap: var(--space-xs);

    .recurrence-fieldset {
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
      padding: 0 var(--space-sm) var(--space-sm) var(--space-sm);
      min-width: 0;
      border: 1px solid var(--border);
      border-radius: var(--border-radius);

      legend {
        font-size: var(--text-size-xxs);
        padding: 0 var(--space-xs);
      }

      > label {
        display: flex;
        flex-direction: column;

        > span {
          font-size: var(--text-size-xxs);
        }
      }

      .inline-field {
        display: flex;
        align-items: center;
        gap: var(--space-xs);

        > label > span {
          font-size: var(--text-size-xxs);
        }
      }

      .weekday-options {
        display: flex;
        flex-direction: column;

        > div {
          display: flex;
          flex-wrap: wrap;
          gap: var(--space-sm);

          > label {
            display: flex;
            align-items: center;
            gap: var(--space-xs);
          }
        }
      }

      .recurrence-end {
        .inline-field {
          display: flex;
          flex-wrap: wrap;
          label:nth-child(1) {
            width: 6rem;
            input {
              width: calc(100% - var(--space-xs) * 2 - 2px);
            }
          }
          label:nth-child(2) {
            flex-grow: 1;
            input {
              width: calc(100% - var(--space-xs) * 2 - 2px);
            }
          }
        }
      }
    }
  }

  // 通知設定
  > section:nth-child(4) {
    > span {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      * {
        font-size: var(--font-size-xxs);
      }
    }

    > .notification-rows {
      display: flex;
      flex-direction: column;
      gap: var(--space-xs);

      .notification-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border: 1px solid var(--border);
        border-radius: var(--border-radius);
        padding: var(--space-xs) var(--space-sm);

        > div {
          display: flex;
          align-items: center;
          gap: var(--space-xs);

          > span {
            font-size: var(--font-size-xxs);
          }

          input[type='number'] {
            width: 3rem;
          }
        }

        // 通知削除ボタン
        > button {
          background: var(--bg-1);

          &:hover {
            background: var(--bg-2);
          }
        }
      }

      // 通知追加ボタン
      > button {
        align-self: flex-start;
        width: calc(100% - 2px);
        font-size: var(--font-size-xxs);
        padding: var(--space-xs) 0;
        background-color: var(--bg-1);
        border: 1px solid var(--border);
        &:hover {
          background-color: var(--bg-2);
        }
      }

      .notification-warning {
        font-size: var(--font-size-xxs);
        color: var(--danger);
      }
    }
  }
}

// アクションボタン
form > section:nth-child(9) {
  display: flex;
  gap: var(--space-sm);
  justify-content: flex-end;
}
</style>
