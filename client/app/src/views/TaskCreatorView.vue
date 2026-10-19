<script setup>
/**
 * TaskCreatorView - タスク登録専用のフォームビュー。
 * タスクは Google カレンダーイベントとして保存し、shared 拡張プロパティに
 * orbitIsTask / orbitTaskStatus / orbitTaskDeferred を持つ（services/task-events.js）。
 * 日時の入力方式は EventForm と同じ（数字の桁数で日付/時刻を解釈し、結果をリアルタイム表示）。
 * 通知は時間指定タスクは開始時刻、終日タスクはユーザー設定の時刻に送信されるため
 * この画面にリマインダー欄は置かない。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import dayjs, { toDayjs } from '@/services/dayjs.js';
import { useUserStore } from '@/stores/user.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { usePeopleStore } from '@/stores/people.js';
import { usePeople } from '@/composables/usePeople.js';
import { useEventSubmit } from '@/composables/useEventSubmit.js';
import { ensureNotificationPermission, rescheduleNotifications } from '@/composables/useNotifications.js';
import { buildTaskSharedProperties, taskStatusLabel, TASK_STATUS_NOT_STARTED, TASK_STATUSES } from '@/services/task-events.js';
import { focusNextOnEnter } from '@/services/form-focus.js';
import MenuBar from '@/components/MenuBar.vue';
import CalendarRibbon from '@/components/CalendarRibbon.vue';
import EventFormAttendeeField from '@/components/items/EventFormAttendeeField.vue';
import IconFloppyDisk from '@/components/icons/IconFloppyDisk.vue';
import IconXMark from '@/components/icons/IconXMark.vue';
import IconUserPlus from '@/components/icons/IconUserPlus.vue';
import IconAlignLeft from '@/components/icons/IconAlignLeft.vue';
import IconClipboard from '@/components/icons/IconClipboard.vue';
import IconCircleInfo from '@/components/icons/IconCircleInfo.vue';
import IconCalendar from '@/components/icons/IconCalendar.vue';
import IconAnglesDown from '@/components/icons/IconAnglesDown.vue';
import IconArrowsRotate from '@/components/icons/IconArrowsRotate.vue';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const calendarStore = useCalendarStore();
const peopleStore = usePeopleStore();
const people = usePeople();
const { submitCreate } = useEventSubmit();

/** @type {Ref<boolean>} カレンダーセレクターが開いているかどうか */
const isOpenCalendarSelecter = ref(false);
/** @type {Ref<string>} 出席者の検索クエリ */
const attendeeQuery = ref('');
/** @type {Ref<Array<GoogleCalendarAttendee & { email: string }>>} 招待済み参加者 */
const attendees = ref([]);
/** @type {Ref<boolean>} People API 検索中かどうか */
const isSearchingPeople = ref(false);
/** @type {number|null} People API 検索のデバウンスタイマー */
let peopleSearchTimer = null;
/** @type {number} People API 検索の世代 */
let peopleSearchGeneration = 0;

/**
 * カレンダーのドラッグ選択等からクエリで渡された初期日時。
 * - 終日: YYYY-MM-DD（end は含む側の日付）+ allday=1
 * - 時間指定: YYYY-MM-DDTHH:mm
 * @type {ComputedRef<{start: Dayjs, end: Dayjs, isAllDay: boolean}>}
 */
const initialRange = computed(() => {
  const start = typeof route.query.start === 'string' ? route.query.start : '';
  const base = start ? toDayjs(start) : userStore.nowSelectedDate ? toDayjs(userStore.nowSelectedDate) : toDayjs();
  const startDay = base.isValid() ? base : toDayjs();
  const end = typeof route.query.end === 'string' && route.query.end ? toDayjs(route.query.end) : startDay;
  const isAllDay = route.query.allday === '1' || (Boolean(start) && !start.includes('T')) || !start;
  return { start: startDay, end: end.isValid() ? end : startDay, isAllDay };
});

const formData = reactive({
  /** @type {string} タスクのタイトル */
  summary: '',
  /** @type {string} メモ */
  description: '',
  /** @type {string} 保存先カレンダー ID */
  calendarId: '',
  /** @type {boolean} 終日タスクかどうか */
  isAllDay: true,
  /** @type {Dayjs} 開始日時（終日は 00:00） */
  startDateTime: dayjs(),
  /** @type {Dayjs} 終了日時（終日は「終了日（含む）」を保持する） */
  endDateTime: dayjs(),
  /** @type {string} タスクのステータス（既定値またはカスタム文字列） */
  taskStatus: TASK_STATUS_NOT_STARTED,
  /** @type {boolean} 未完了のとき翌日へ持ち越すか */
  taskDeferred: true,
});

/** @type {{startDate: string, endDate: string, startTime: string, endTime: string}} 入力された日付と時間（数字のみ） */
const dateFields = reactive({ startDate: '', endDate: '', startTime: '', endTime: '' });

/** @type {ComputedRef<boolean>} 送信できるか（タイトルと保存先が必須） */
const canSubmit = computed(() => formData.summary.trim().length > 0 && formData.calendarId.length > 0);

// #region Date and time（EventForm と同じ入力方式）

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

/** @param {'startDate'|'endDate'} field 日付ボタン押下でメインカレンダーからの日付選択を開始する */
function openDatePickerFor(field) {
  // 対象フィールドの月がカレンダーに表示されるようにする
  const base = field === 'startDate' ? formData.startDateTime : formData.endDateTime;
  if (base?.isValid?.()) userStore.nowUsingDate = base;
  userStore.beginFormDatePick('eventForm', field);
}

/** @param {'startDate'|'endDate'} field @param {string} value */
function selectDate(field, value) {
  dateFields[field] = value.replace(/\D/g, '').slice(0, 8);
  const selectedDate = toDayjs(value);
  const current = field === 'startDate' ? formData.startDateTime : formData.endDateTime;
  const updated = selectedDate.hour(current.hour()).minute(current.minute()).second(current.second()).millisecond(current.millisecond());
  if (field === 'startDate') formData.startDateTime = updated;
  else formData.endDateTime = updated;
}

// メインカレンダーで確定された日付選択をフォームへ反映する（単日クリックは対象フィールドのみ、範囲ドラッグは開始日と終了日の両方）
watch(
  () => userStore.formPickResult,
  (result) => {
    if (!result || result.target !== 'eventForm') return;
    userStore.formPickResult = null;
    if (result.end && result.end !== result.start) {
      selectDate('startDate', result.start);
      selectDate('endDate', result.end);
      return;
    }
    selectDate(result.field, result.start);
  },
);

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

  const parsedStart = dayjs(`${sYear}-${sMonth}-${sDate} ${sHour}:${sMinute}`, 'YYYY-M-D H:m');
  const parsedEnd = dayjs(`${eYear}-${eMonth}-${eDate} ${eHour}:${eMinute}`, 'YYYY-M-D H:m');
  let resultStartString = '';
  let resultEndString = '';
  if (parsedStart.isValid()) {
    resultStartString = parsedStart.format(sFormatString) ?? '--年 --月 --日 (--) --:--';
  } else {
    resultStartString = '--年 --月 --日 (--) --:--';
  }
  if (parsedEnd.isValid()) {
    resultEndString = parsedEnd.format(eFormatString) ?? '--年 --月 --日 (--) --:--';
  } else {
    resultEndString = '--年 --月 --日 (--) --:--';
  }
  return { start: resultStartString, end: resultEndString, startDateTime: parsedStart.isValid() ? parsedStart : null, endDateTime: parsedEnd.isValid() ? parsedEnd : null };
});

// 入力された日時を実データへ反映する（入力途中の不完全な値では既存値を維持する）
watch(
  () => dateTimeCalculator.value,
  ({ startDateTime, endDateTime }) => {
    if (startDateTime) formData.startDateTime = startDateTime;
    if (endDateTime) formData.endDateTime = endDateTime;
  },
);

/** @returns {boolean} 日時入力が正当かどうか */
function validateDateTime() {
  // 入力欄が途中・不正のままだと直近の有効値が残るため送信を止める
  if (!dateTimeCalculator.value.startDateTime || !dateTimeCalculator.value.endDateTime) {
    userStore.showToast('日時を正しく入力してください.');
    return false;
  }
  // 終日タスクは「終了日（含む）」が開始日より前にならないよう矯正する
  if (formData.isAllDay && formData.endDateTime.isBefore(formData.startDateTime, 'day')) {
    formData.endDateTime = formData.startDateTime;
    dateFields.endDate = dateFields.startDate;
  }
  if (!formData.isAllDay && formData.endDateTime.toDate() <= formData.startDateTime.toDate()) {
    userStore.showToast('終了日時は開始日時より後にしてください.');
    return false;
  }
  return true;
}
// #endregion

/**
 * フォーム内容から Google カレンダーイベントの作成ボディを組み立てる
 * @returns {Record<string, any>} イベント作成リクエストボディ
 */
function buildTaskBody() {
  /** @type {{date: string}|{dateTime: string, timeZone: string}} */
  let start;
  /** @type {{date: string}|{dateTime: string, timeZone: string}} */
  let end;
  if (formData.isAllDay) {
    // 終日イベントの end は排他のため「終了日（含む）」の翌日を送る
    start = { date: formData.startDateTime.format('YYYY-MM-DD') };
    end = { date: formData.endDateTime.add(1, 'day').format('YYYY-MM-DD') };
  } else {
    start = { dateTime: formData.startDateTime.toISOString(), timeZone: userStore.timeZone };
    end = { dateTime: formData.endDateTime.toISOString(), timeZone: userStore.timeZone };
  }
  return {
    summary: formData.summary.trim(),
    description: formData.description.trim(),
    // タスクは共有相手へ見せないため非公開固定（招待者は参加者として見える）
    visibility: 'private',
    // 招待者にもタスクプロパティの変更を許可する
    guestsCanModify: attendees.value.length > 0,
    start,
    end,
    extendedProperties: {
      shared: buildTaskSharedProperties({ status: formData.taskStatus, isDeferred: formData.taskDeferred }),
    },
    ...(attendees.value.length ? { attendees: attendees.value } : {}),
  };
}

/** タスクを作成する。ローカル保存後は既存の送信フローで詳細画面へ遷移する */
async function submitForm() {
  if (!validateDateTime() || !canSubmit.value) return;
  // 通知スケジュールを組み直せるよう許可を確保してから送信する
  ensureNotificationPermission().then(() => rescheduleNotifications());
  await submitCreate({ body: buildTaskBody(), calendarId: formData.calendarId, attendees: attendees.value });
}

/** 入力中のメールアドレスを未知の招待先として追加します。 */
function addUnknownEmail() {
  const email = attendeeQuery.value.trim();
  if (!email || email.startsWith('@') || !email.includes('@') || attendees.value.some((attendee) => attendee.email === email)) return;
  attendees.value.push({ email, responseStatus: 'needsAction' });
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
}

/** 入力欄からフォーカスが外れた後、候補選択の時間を確保して一覧を閉じます。 */
function clearPeopleSuggestionsLater() {
  window.setTimeout(() => peopleStore.clearSuggestions(), 150);
}

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
      await people.search(normalizedQuery);
    } finally {
      if (searchGeneration === peopleSearchGeneration) isSearchingPeople.value = false;
      peopleSearchTimer = null;
    }
  }, 300);
  onCleanup(() => {
    if (peopleSearchTimer !== null) window.clearTimeout(peopleSearchTimer);
  });
});

onMounted(() => {
  const writableCalendars = calendarStore.listWritableCalendars;
  formData.calendarId = writableCalendars.some((calendar) => calendar.id === userStore.defaultCalendarId) ? userStore.defaultCalendarId : (writableCalendars[0]?.id ?? '');
  const range = initialRange.value;
  formData.isAllDay = range.isAllDay;
  // 終日タスクの終了日は「終了日（含む）」として保持する
  formData.startDateTime = range.isAllDay ? range.start.startOf('day') : range.start;
  formData.endDateTime = range.isAllDay ? range.end.startOf('day') : range.end;
  Object.assign(dateFields, {
    startDate: formData.startDateTime.format('YYYYMMDD'),
    endDate: formData.endDateTime.format('YYYYMMDD'),
    startTime: formData.startDateTime.format('HHmm'),
    endTime: formData.endDateTime.format('HHmm'),
  });
  document.getElementById('task-summary')?.focus();
});
</script>

<template>
  <section class="event-view">
    <MenuBar>
      <template #main>
        <h1 class="title">タスク作成</h1>
      </template>
      <template #sub>
        <div class="menu-bar-actions">
          <button title="閉じる" @click="router.back()">
            <IconXMark />
          </button>
        </div>
      </template>
      新しいタスクを作成します
    </MenuBar>

    <form @submit.prevent="submitForm">
      <!-- タイトル -->
      <section>
        <label for="task-summary">
          <span>タスクのタイトル</span>
          <div>
            <input id="task-summary" v-model="formData.summary" type="text" placeholder="タスクのタイトル" aria-label="タスクのタイトル" required autofocus data-enter-focus @keydown.enter="focusNextOnEnter" />
          </div>
        </label>
      </section>
      <!-- 保存先カレンダー -->
      <section>
        <label>
          <span>現在の保存先</span>
          <div>
            <CalendarRibbon :cid="formData.calendarId" />
            <button type="button" @click="isOpenCalendarSelecter = !isOpenCalendarSelecter"><IconArrowsRotate size="0.7rem" />変更</button>
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
      <!-- 終日・タスク設定 -->
      <section>
        <label> <input v-model="formData.isAllDay" type="checkbox" /> 終日 </label>
        <label class="task-sub-option"> <input v-model="formData.taskDeferred" type="checkbox" /> 未完了のとき翌日へ持ち越す </label>
        <label class="task-sub-option">
          <span><IconClipboard />タスクのステータス</span>
          <select v-model="formData.taskStatus" aria-label="タスクのステータス">
            <option v-for="status in TASK_STATUSES" :key="status" :value="status">{{ taskStatusLabel(status) }}</option>
          </select>
        </label>
        <p class="task-hint">タスクは非公開の予定として保存され、共有カレンダーには表示されません.</p>
      </section>
      <!-- 開始日時 -->
      <section>
        <label>
          <span>開始年月日</span>
          <div>
            <button type="button" aria-label="開始日をカレンダーから選択" @click="openDatePickerFor('startDate')">
              <IconCalendar />
              <span>日付選択</span>
            </button>
            <input :value="formatDateField(dateFields.startDate)" inputmode="numeric" maxlength="10" placeholder="YYYY MM DD" aria-label="開始年月日" required data-enter-focus @keydown.enter="focusNextOnEnter" @input="updateDateTimeField('startDate', $event)" />
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
              <span>日付選択</span>
            </button>
            <input :value="formatDateField(dateFields.endDate)" inputmode="numeric" maxlength="10" placeholder="YYYY MM DD" aria-label="終了年月日" required data-enter-focus @keydown.enter="focusNextOnEnter" @input="updateDateTimeField('endDate', $event)" />
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
      </section>
      <!-- メモ -->
      <section>
        <label>
          <span><IconAlignLeft />メモ</span>
          <textarea v-model="formData.description" rows="3" placeholder="メモ（任意）" aria-label="メモ" data-enter-focus @keydown.shift.enter="focusNextOnEnter"></textarea>
        </label>
      </section>
      <!-- 招待するユーザー -->
      <section>
        <label>
          <span><IconUserPlus />招待するユーザー</span>
          <EventFormAttendeeField v-model="attendeeQuery" :attendees="attendees" :suggestions="peopleStore.suggestions" :is-searching="isSearchingPeople" @add-attendee="addAttendee" @add-unknown-email="addUnknownEmail" @remove-attendee="removeAttendee" @query-blur="clearPeopleSuggestionsLater" />
        </label>
        <p class="task-hint"><IconCircleInfo />招待した参加者にもタスクの変更を許可します（guestsCanModify）.</p>
      </section>

      <p class="task-hint"><IconCircleInfo />時間指定タスクは開始時刻に、終日タスクは設定画面で指定した時刻に通知されます.</p>

      <!-- 送信 -->
      <section class="form-actions">
        <div>
          <button type="submit" :disabled="!canSubmit"><IconFloppyDisk />作成</button>
          <button type="button" @click="router.back()">キャンセル</button>
        </div>
      </section>
    </form>
  </section>
</template>

<style lang="scss" scoped>
form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  width: 100%;
}

// タイトルの入力欄
form > section:nth-of-type(1) {
  width: 100%;
  display: flex;
  flex-direction: column;

  > label {
    display: flex;
    flex-direction: column;

    > span {
      font-size: var(--text-size-xs);
    }

    > div {
      display: flex;
      gap: var(--space-xs);
      flex-wrap: wrap;

      > input {
        flex-grow: 1;
      }
    }
  }
}

// 保存先の設定
form > section:nth-of-type(2) {
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
      font-size: var(--text-size-xs);
    }

    // カレンダーリボンと変更ボタン
    > div {
      height: 100%;
      flex-grow: 1;
      display: flex;
      gap: var(--space-xs);
      border: 1px solid var(--border);
      border-radius: var(--border-radius);
      padding-left: var(--space-sm);
      background-color: var(--bg-2);
      transition: background-color 0.2s ease-in-out;

      &:hover {
        background-color: var(--bg-3);

        > button {
          background-color: var(--bg-3);
        }
      }

      .calendar-ribbon {
        background-color: var(--bg-2);
        border-radius: var(--border-radius);
        padding: 0 var(--space-xs);
      }

      > button {
        background-color: var(--bg-2);
      }
    }
  }
}

// 終日・タスク設定の入力欄
form > section:nth-of-type(3) {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding-top: var(--space-xs);

  > label {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    cursor: pointer;
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
    width: 100%;
    padding: var(--space-xs) var(--space-sm);
    background-color: var(--bg-2);
  }

  .task-sub-option {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: var(--text-size-sm);
    padding: 0 var(--space-sm);
    cursor: pointer;

    select {
      flex: 1;
      min-width: 0;
    }

    > span {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
    }
  }

  .task-hint {
    font-size: var(--text-size-xs);
    color: var(--text-light);
    padding: 0 var(--space-sm);
  }
}

// 日付と時間の入力欄
form > section:nth-of-type(4),
form > section:nth-of-type(5) {
  width: 100%;
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;

  > label {
    display: flex;
    flex-direction: column;

    > span {
      font-size: var(--text-size-xs);
    }

    > div {
      display: flex;
      gap: var(--space-xs);
      align-items: center;
      flex-wrap: wrap;

      > button {
        background-color: var(--bg-2);
        border: 1px solid var(--border);
        font-size: var(--text-size-xs);

        &:hover {
          background-color: var(--bg-3);
        }
      }

      // 日付
      > input {
        width: 8rem;
      }
    }

    // 時間
    > input {
      width: 6rem;

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }
}

// 日付と時間の計算結果
form > section:nth-of-type(6) > p {
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

// メモ・招待の入力欄
form > section:nth-of-type(7),
form > section:nth-of-type(8) {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);

  > label {
    display: flex;
    flex-direction: column;

    > span {
      font-size: var(--text-size-xs);
      display: flex;
      align-items: center;
      gap: var(--space-sm);
    }

    > textarea {
      resize: vertical;
      min-height: 3rem;
    }
  }

  > .task-hint {
    font-size: var(--text-size-xs);
    color: var(--text-light);
    display: flex;
    align-items: center;
    gap: var(--space-xs);
  }
}

// 説明のヒント
form > .task-hint {
  font-size: var(--text-size-xs);
  color: var(--text-light);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

// アクションボタン
form > section.form-actions {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);

  div {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-sm);

    button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-xs);
      padding: var(--space-xs) var(--space-md);
      border: 1px solid var(--border);
      border-radius: var(--border-radius);

      &:hover {
        background-color: var(--bg-2);
      }

      &:disabled {
        opacity: 0.5;
      }
    }
  }
}
</style>
