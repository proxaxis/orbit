<script setup>
import { computed, reactive, ref, onMounted, onUnmounted, watch } from 'vue';
import dayjs, { toDayjs } from '@/services/dayjs.js';
import { useUserStore } from '@/stores/user.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { usePeopleStore } from '@/stores/people.js';
import { useEvents } from '@/composables/useEvents.js';
import { usePeople } from '@/composables/usePeople.js';
import { usePhotos } from '@/composables/usePhotos.js';
import { useAuth } from '@/composables/useAuth.js';
import TimezoneSelecter from '@/components/TimezoneSelecter.vue';
import CalendarRibbon from '@/components/CalendarRibbon.vue';
import EmojiSelecter from '@/components/EmojiSelecter.vue';
import IconAnglesDown from '@/components/icons/IconAnglesDown.vue';
import { buildRecurrence, parseRecurrence, HOLIDAY_ADJUSTMENT_PROPERTY } from '@/services/rrule.js';
import { focusNextOnEnter } from '@/services/form-focus.js';
import { ensureNotificationPermission, rescheduleNotifications } from '@/composables/useNotifications.js';
import { takeQuickAddDraft, repeatToRecurrence } from '@/composables/useQuickAdd.js';
import IconCalendar from '@/components/icons/IconCalendar.vue';
import SuggestPulldown from '@/components/SuggestPulldown.vue';
import AccordionMenu from '@/components/AccordionMenu.vue';
import EventFormAttendeeField from '@/components/items/EventFormAttendeeField.vue';
import EventFormRecurrenceField from '@/components/items/EventFormRecurrenceField.vue';
import EventFormReminderField from '@/components/items/EventFormReminderField.vue';
import EventFormPhotoAlbumField from '@/components/items/EventFormPhotoAlbumField.vue';
import EventFormColorField from '@/components/items/EventFormColorField.vue';
import EventFormTemplateSaveDialog from '@/components/items/EventFormTemplateSaveDialog.vue';
import { useEventTemplates, createEventTemplate } from '@/composables/useEventTemplates.js';
import { normalizeTags, appendTagsToDescription, TAGS_SHARED_PROPERTY } from '@/services/event-tags.js';
import { buildTaskSharedProperties, isTaskEvent, isTaskDeferred, taskStatusLabel, taskStatusOf, TASK_SHARED_PROPERTY_KEYS, TASK_STATUS_NOT_STARTED, TASK_STATUSES } from '@/services/task-events.js';
import IconFloppyDisk from '@/components/icons/IconFloppyDisk.vue';
import IconRotateLeft from '@/components/icons/IconRotateLeft.vue';
import IconFileCirclePlus from '@/components/icons/IconFileCirclePlus.vue';
import IconArrowsRotate from '@/components/icons/IconArrowsRotate.vue';
import IconLocationDot from '@/components/icons/IconLocationDot.vue';
import IconAlignLeft from '@/components/icons/IconAlignLeft.vue';
import IconTag from '@/components/icons/IconTag.vue';
import IconFileShield from '@/components/icons/IconFileShield.vue';
import IconUserPlus from '@/components/icons/IconUserPlus.vue';
import IconBell from '@/components/icons/IconBell.vue';
import IconUserLock from '@/components/icons/IconUserLock.vue';
import IconClock from '@/components/icons/IconClock.vue';
import IconImage from '@/components/icons/IconImage.vue';
import IconPalette from '@/components/icons/IconPalette.vue';

const props = defineProps({
  submitLabel: { type: String, default: '保存' },
  /** @type {boolean} 複製モード（選択中のイベントの内容をフォームへ複写し、新規作成として送信する） */
  clone: { type: Boolean, default: false },
  /** @type {OrbitEventTemplate|null} 適用するイベントテンプレート（日時はフォームの既定値を維持する） */
  template: { type: Object, default: null },
  /** @type {{start: string, end: string, isAllDay: boolean}|null} カレンダーのドラッグ選択などから引き継ぐ初期日時（終日の end は含む側の日付） */
  initialRange: { type: Object, default: null },
});

const emit = defineEmits(['submit', 'cancel']);

const userStore = useUserStore();
const calendarStore = useCalendarStore();
const peopleStore = usePeopleStore();
const events = useEvents();
const people = usePeople();
const photos = usePhotos();
const auth = useAuth();
const eventTemplates = useEventTemplates();

// #region State
/** @type {Ref<boolean>} カレンダーセレクターが開いているかどうか */
const isOpenCalendarSelecter = ref(false);
/** @type {Ref<boolean>} People API 検索中かどうか */
const isSearchingPeople = ref(false);
/** @type {Ref<string[]>} 最近使ったタイトル候補 */
const titleSuggestions = ref([]);
/** @type {Ref<HandyCalendarEvent|null>} オリジナルのイベントデータ */
const originalEvent = ref(null);
/** @type {Ref<string>} 出席者の検索クエリ */
const attendeeQuery = ref('');
/** @type {Ref<Array<GoogleCalendarAttendee & { email: string }>>} 招待済み参加者 */
const attendees = ref([]);
/** @type {Ref<string>} タグ入力欄（空白・カンマ区切り） */
const eventTagsInput = ref('');
/** @type {number|null} People API 検索のデバウンスタイマー */
let peopleSearchTimer = null;
/** @type {number} People API 検索の世代 */
let peopleSearchGeneration = 0;
/** @type {{startDate: string, endDate: string, startTime: string, endTime: string}} 入力された日付と時間 */
const dateFields = reactive({ startDate: '', endDate: '', startTime: '', endTime: '' });
/** @type {Ref<{value: number, unit: 'minute'|'hour'|'day'}[]>} イベント開始前に送る通知の一覧 */
const reminders = ref([]);
/** @type {Ref<string>} イベント個別のカラー ID（'' はカレンダーの色を使う） */
const eventColorId = ref('');
/** @type {Ref<boolean>} 保存時に写真共有アルバムを作成するか */
const createPhotoAlbum = ref(false);
/** @type {Ref<boolean>} テンプレート保存ダイアログを開いているか */
const isTemplateSaveDialogOpen = ref(false);
/** 写真共有機能が利用可能かどうか（設定で有効化済み + OAuth 認証済み + オンライン） */
const photoAlbumAvailable = computed(() => photos.canUsePhotoSharing());
/** @type {ComputedRef<OrbitEventPhotoAlbum|null>} 編集中のイベントに紐づく既存の共有アルバム（複製時は元の紐づけを引き継がない） */
const existingPhotoAlbum = computed(() => (props.clone ? null : photos.bindingOf(originalEvent.value)));
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

/** 詳細入力欄を表示するかどうか */
const showDetailInputs = reactive({
  location: false,
  description: false,
  tag: false,
  note: false,
});
/** false に空欄に戻す */
watch(
  () => showDetailInputs,
  (to) => {
    if (!to.location && !formData.location) formData.location = '';
    if (!to.description && !formData.description) formData.description = '';
    if (!to.tag && !eventTagsInput.value) eventTagsInput.value = '';
    if (!to.note && !formData.privacyNote) formData.privacyNote = '';
  },
);

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
  /** @type {'default'|'public'|'private'|'confidential'} Google イベントの公開設定 */
  visibility: 'default',
  /** @type {boolean} タスクとして管理するか（shared 拡張プロパティで表現・非公開イベントになる） */
  isTask: false,
  /** @type {string} タスクのステータス（not-started/in-progress/pending/completed/カスタム） */
  taskStatus: TASK_STATUS_NOT_STARTED,
  /** @type {boolean} 未完了のとき翌日へ持ち越すか */
  taskDeferred: true,
});

/** @type {ComputedRef<boolean>} 主催者としてイベントの共有情報を変更できるか（複製・テンプレート・新規は常に可） */
const isOrganizerEvent = computed(() => Boolean(props.clone || props.template || (originalEvent.value?.raw?.organizer?.self ?? true)));

// タスクは共有カレンダーの閲覧者へ見せないため、タスク化したら公開設定を非公開へ固定する
watch(
  () => formData.isTask,
  (isTask) => {
    if (isTask) formData.visibility = 'private';
  },
);

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

/** タイトル入力に対応する履歴候補を更新します。 */
function updateTitleSuggestions() {
  titleSuggestions.value = userStore.getRecentEventTitleSuggestions(formData.summary);
}

/** @param {string} title 履歴から選択したタイトル */
function selectRecentTitle(title) {
  formData.summary = title;
  titleSuggestions.value = [];
}

/** @type {ComputedRef<string>} タグ入力欄の末尾トークン（サジェストの検索クエリ） */
const tagInputFragment = computed(() => {
  const parts = eventTagsInput.value.split(/[\s,]+/);
  return parts[parts.length - 1] ?? '';
});

/** @type {ComputedRef<string[]>} 過去に使ったタグの候補（入力済みのタグは除く） */
const tagSuggestions = computed(() => {
  const existing = new Set(normalizeTags(eventTagsInput.value));
  return userStore.getRecentEventTagSuggestions(tagInputFragment.value).filter((tag) => !existing.has(tag));
});

/** @param {string} tag 候補から選択したタグ（末尾トークンを置き換える） */
function selectTagSuggestion(tag) {
  eventTagsInput.value = eventTagsInput.value.replace(/[^\s,]*$/, `${tag} `);
}

/** @returns {boolean} 日時入力が正当かどうか */
function validateDateTime() {
  // 入力欄が途中・不正のままだと直近の有効値が残るため送信を止める
  if (!dateTimeCalculator.value.startDateTime || !dateTimeCalculator.value.endDateTime) {
    userStore.showToast('日時を正しく入力してください.');
    return false;
  }
  // 終日イベントは「終了日（含む）」が開始日より前にならないよう矯正する
  if (formData.isAllDay && formData.endDateTime.isBefore(formData.startDateTime, 'day')) {
    formData.endDateTime = formData.startDateTime;
    dateFields.endDate = dateFields.startDate;
  }
  if (!formData.isAllDay && formData.endDateTime.toDate() <= formData.startDateTime.toDate()) {
    userStore.showToast('Set the end date or time after the start date or time.');
    return false;
  }
  return true;
}
// #endregion

// #region Form submission and attendees
/** フォームを検証して送信イベントを発行する */
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
  // 主催者以外(招待されたイベント等)が shared 拡張プロパティを変更すると
  // 403 forbiddenForNonOrganizer で更新全体が失敗するため送信しない。
  // アイコン・タグ・繰り返しの共有情報は shared に保持するため主催者のみ変更が反映される
  const isOrganizer = isOrganizerEvent.value;
  const shared = isOrganizer ? { ...((formData.icon ?? '') === '' ? {} : { icon: formData.icon }), ...recurrenceData.shared } : {};
  // タグは shared 拡張プロパティへ保持し、検索に効くよう description 末尾にも #tag として付与する
  const tags = normalizeTags(eventTagsInput.value);
  if (isOrganizer && tags.length) shared[TAGS_SHARED_PROPERTY] = JSON.stringify(tags);
  // タスクのメタデータは shared 拡張プロパティへ保持する（招待者も変更できるようイベント側で guestsCanModify を立てる）
  if (isOrganizer && formData.isTask) Object.assign(shared, buildTaskSharedProperties({ status: formData.taskStatus, isDeferred: formData.taskDeferred }));
  const privateProperties = { ...(originalEvent.value?.raw?.extendedProperties?.private ?? {}) };
  if (formData.privacyNote.trim()) privateProperties.privacyNote = formData.privacyNote.trim();
  else delete privateProperties.privacyNote;
  // PATCH では extendedProperties がキー単位でマージされ、値の null だけが削除として扱われる。
  // フォームから消えた既存キーは null で明示的に削除する（空オブジェクトを送っても残る）
  const sharedOut = { ...shared };
  const privateOut = { ...privateProperties };
  if (!props.clone && !props.template) {
    // shared の削除はフォームが管理するキーに限定する。写真アルバム紐づけなど
    // 他機能が shared に保持するキーまで null で消してしまわないようにするため
    if (isOrganizer) {
      for (const key of ['icon', TAGS_SHARED_PROPERTY, HOLIDAY_ADJUSTMENT_PROPERTY, ...TASK_SHARED_PROPERTY_KEYS]) {
        if (key in (originalEvent.value?.raw?.extendedProperties?.shared ?? {}) && !(key in sharedOut)) sharedOut[key] = null;
      }
    }
    for (const key of Object.keys(originalEvent.value?.raw?.extendedProperties?.private ?? {})) if (!(key in privateOut)) privateOut[key] = null;
  }
  const extendedProperties = {};
  if (Object.keys(sharedOut).length) extendedProperties.shared = sharedOut;
  if (Object.keys(privateOut).length) extendedProperties.private = privateOut;
  const body = {
    summary: formData.summary.trim(),
    // タスクは共有相手へ見せないため非公開固定（招待者は参加者として見える）
    visibility: formData.isTask ? 'private' : formData.visibility,
    // 招待者にもタスクプロパティの変更を許可する。タスク解除時はイベント側の許可も元へ戻す
    // （非主催者は guestsCanModify を変更できないため送信しない）
    ...(isOrganizer ? (formData.isTask ? { guestsCanModify: attendees.value.length > 0 } : !props.clone && isTaskEvent(originalEvent.value) ? { guestsCanModify: false } : {}) : {}),
    // イベント個別の色。未選択で編集中のイベントに色が設定済みなら明示的にクリアする（PATCH では null で解除される）
    ...(eventColorId.value ? { colorId: eventColorId.value } : originalEvent.value?.eventColorId ? { colorId: null } : {}),
    // PATCH では省略フィールドが保持されるため、クリアしたい項目は空文字で送る
    description: appendTagsToDescription(formData.description.trim(), tags) || '',
    location: formData.location.trim() || '',
    // 元のイベントに参加者がいた場合は空配列でも送信する（PATCH では省略すると参加者が残ったままになる）
    ...(attendees.value.length || (!props.clone && originalEvent.value?.raw?.attendees?.length) ? { attendees: attendees.value } : {}),
    ...(Object.keys(extendedProperties).length ? { extendedProperties } : {}),
    // 繰り返しを解除した場合は空配列で送る（PATCH では省略すると元の繰り返しが残る）
    ...(recurrenceData.recurrence ? { recurrence: recurrenceData.recurrence } : !props.clone && !props.template && originalEvent.value?.raw?.recurrence ? { recurrence: [] } : {}),
    start: formData.isAllDay ? { date: formData.startDateTime.format('YYYY-MM-DD') } : { dateTime: formData.startDateTime.toISOString(), timeZone: formData.timeZone },
    // 終日イベントの end.date は排他のため、フォームで扱う「終了日（含む）」の翌日を送る
    end: formData.isAllDay ? { date: formData.endDateTime.add(1, 'day').format('YYYY-MM-DD') } : { dateTime: formData.endDateTime.toISOString(), timeZone: formData.timeZone },
  };
  const reminderMinutes = reminderMinutesList();
  const reminderKey = JSON.stringify([...reminderMinutes].sort((a, b) => a - b));
  if (props.clone || props.template || reminderKey !== initialReminderKey) {
    // 通知設定が変更された場合のみ reminders を送信する（未変更ならカレンダー既定値のまま）。
    // 複製時は元のイベントの通知設定を引き継ぐため常に送信する。
    const overrides = [...preservedReminderOverrides, ...reminderMinutes.map((minutes) => ({ method: 'popup', minutes }))];
    body.reminders = overrides.length ? { useDefault: false, overrides } : { useDefault: false };
    if (reminderMinutes.length) {
      ensureNotificationPermission().then(() => rescheduleNotifications());
    } else {
      rescheduleNotifications();
    }
  }
  emit('submit', {
    body,
    calendarId: formData.calendarId,
    attendees: attendees.value,
    createPhotoAlbum: createPhotoAlbum.value && !existingPhotoAlbum.value,
  });
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
// #endregion

// #region Event templates

/**
 * テンプレートの内容をフォームへ反映する。
 * 日時は保持しないため、開始日は選択中の日付、終了日時はテンプレートの所要時間から再構成する。
 * @param {OrbitEventTemplate} template 適用するテンプレート
 */
function applyTemplate(template) {
  const event = template.event ?? {};
  formData.endDateTime = formData.startDateTime.add(event.durationMinutes ?? 60, 'minute');
  // 入力欄を新しい日時へ合わせる（欄と formData がずれると同期 watcher が値を戻してしまう）
  Object.assign(dateFields, {
    endDate: formData.endDateTime.format(dateFields.startDate.length === 8 ? 'YYYYMMDD' : 'MMDD'),
    startTime: formData.startDateTime.format('HHmm'),
    endTime: formData.endDateTime.format('HHmm'),
  });
  Object.assign(formData, {
    summary: event.summary ?? '',
    description: event.description ?? '',
    location: event.location ?? '',
    privacyNote: event.privacyNote ?? '',
    calendarId: calendarStore.listWritableCalendars.some((calendar) => calendar.id === event.calendarId) ? event.calendarId : formData.calendarId,
    icon: event.icon ?? '',
    isAllDay: Boolean(event.isAllDay),
    timeZone: event.timeZone || userStore.timeZone,
    visibility: event.visibility ?? 'default',
  });
  if (event.recurrence) Object.assign(recurrence, event.recurrence);
  attendees.value = (event.attendees ?? []).filter((attendee) => typeof attendee.email === 'string').map((attendee) => ({ email: attendee.email, ...(attendee.displayName ? { displayName: attendee.displayName } : {}), responseStatus: 'needsAction' }));
  reminders.value = (event.reminders ?? []).map((reminder) => ({ ...reminder }));
  preservedReminderOverrides = (event.preservedReminderOverrides ?? []).map((override) => ({ ...override }));
  createPhotoAlbum.value = Boolean(event.createPhotoAlbum);
  eventColorId.value = event.eventColorId ?? '';
  eventTagsInput.value = normalizeTags(event.tags ?? []).join(' ');
}

/**
 * 現在のフォーム内容をイベントテンプレートとして保存する
 * @param {{name: string, description: string}} meta テンプレートの名前と説明
 */
async function saveAsTemplate({ name, description }) {
  isTemplateSaveDialogOpen.value = false;
  await eventTemplates.ensureLoaded();
  await eventTemplates.addTemplate(
    createEventTemplate({
      name,
      description,
      snapshot: {
        summary: formData.summary,
        description: formData.description,
        location: formData.location,
        privacyNote: formData.privacyNote,
        calendarId: formData.calendarId,
        icon: formData.icon,
        isAllDay: formData.isAllDay,
        durationMinutes: formData.endDateTime.diff(formData.startDateTime, 'minute'),
        timeZone: formData.timeZone,
        visibility: formData.visibility,
        attendees: attendees.value,
        reminders: reminders.value,
        preservedReminderOverrides,
        recurrence: { ...recurrence },
        createPhotoAlbum: createPhotoAlbum.value,
        eventColorId: eventColorId.value,
        tags: normalizeTags(eventTagsInput.value),
      },
    }),
  );
  userStore.showToast('テンプレートを保存しました');
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
    // 写真共有が有効ならトークンを復元してアルバム作成セクションを表示できるようにする
    if (userStore.usePhotoSharing) auth.ensurePhotoToken().catch(() => null);
    // 編集対象のイベントが選択されていない場合は新規作成
    if (!userStore.nowSelectedEvent) {
      originalEvent.value = null;
      // 自然言語クイック登録で解析されたドラフト（1回限り消費）。開始時刻がなければ終日として扱う
      const draft = takeQuickAddDraft();
      const draftDateTime = (/** @type {string|undefined} */ date, /** @type {string|undefined} */ time) => {
        const parsed = toDayjs(date ?? '');
        if (!parsed.isValid()) return null;
        const [h, m] = /^\d{1,2}:\d{2}$/.test(time ?? '') ? time.split(':').map(Number) : [0, 0];
        return parsed.hour(h).minute(m).second(0).millisecond(0);
      };
      const draftStart = draft ? draftDateTime(draft.startDate, draft.startTime) : null;
      let draftEnd = draft ? draftDateTime(draft.endDate || draft.startDate, draft.endTime) : null;
      const draftAllDay = Boolean(draft && (draft.isAllDay || !draft.startTime));
      // 時刻なし・逆転している終了は既定値へ矯正する
      if (draftStart && (!draftEnd || (!draftAllDay && !draftEnd.isAfter(draftStart)) || (draftAllDay && draftEnd.isBefore(draftStart, 'day')))) {
        draftEnd = draftAllDay ? draftStart : draftStart.add(1, 'hour');
      }
      // ドラッグ選択などから渡された初期範囲。終日の end は「含む側」の日付として受け取る
      const range = props.initialRange;
      const rangeStart = range ? toDayjs(range.start) : null;
      const rangeEnd = range ? toDayjs(range.end) : null;
      const hasRange = Boolean(rangeStart?.isValid?.());
      const isAllDay = draft ? draftAllDay : range ? Boolean(range.isAllDay) : true;
      Object.assign(formData, {
        summary: draft?.summary ?? '',
        description: draft?.description ?? '',
        location: draft?.location ?? '',
        privacyNote: '',
        calendarId: initialCalendarId.value,
        icon: draft?.icon ?? '',
        isAllDay,
        startDateTime: draftStart ?? (hasRange ? rangeStart : userStore.nowSelectedDate ? toDayjs(userStore.nowSelectedDate) : toDayjs()),
        endDateTime: draftEnd ?? (rangeEnd?.isValid?.() ? rangeEnd : userStore.nowSelectedDate ? toDayjs(userStore.nowSelectedDate).add(1, 'hour') : toDayjs().add(1, 'hour')),
        timeZone: userStore.timeZone,
        visibility: 'default',
        isTask: false,
        taskStatus: TASK_STATUS_NOT_STARTED,
        taskDeferred: true,
      });
      Object.assign(recurrence, { frequency: '', interval: 1, weekdays: [], monthDay: '', month: '', count: '', until: '', exclusions: '', holidayAdjustment: '' });
      eventColorId.value = '';
      eventTagsInput.value = '';
      if (draft?.repeat) {
        const recur = repeatToRecurrence(draft.repeat);
        if (recur) Object.assign(recurrence, recur);
        // フォームで表現できない繰り返しルールは説明文へ退避して情報を失わない
        else formData.description = [formData.description, `繰り返し: ${draft.repeat}`].filter(Boolean).join('\n');
      }
      // テンプレート適用時は日時以外の全項目をテンプレートの値で上書きする
      if (props.template) applyTemplate(props.template);
      Object.assign(dateFields, {
        startDate: formData.startDateTime.format(formData.startDateTime.year() === dayjs().year() ? 'MMDD' : 'YYYYMMDD'),
        endDate: formData.endDateTime.format(formData.endDateTime.year() === dayjs().year() ? 'MMDD' : 'YYYYMMDD'),
        startTime: formData.startDateTime.format('HHmm'),
        endTime: formData.endDateTime.format('HHmm'),
      });
      if (!props.template) initReminders(null, formData.calendarId);
    }
    // 編集対象のイベントが選択されている場合は、イベントを取得してフォームに反映
    else {
      originalEvent.value = await events.getEventById(userStore.nowSelectedEvent.eid, userStore.nowSelectedEvent.cid);

      Object.assign(formData, {
        summary: originalEvent.value?.summary ?? '',
        description: originalEvent.value?.description ?? '',
        location: originalEvent.value?.location ?? '',
        privacyNote: originalEvent.value?.raw?.extendedProperties?.private?.privacyNote ?? '',
        // 複製は元カレンダーへの書き込み権限がない場合があるため、常にデフォルトカレンダーを保存先にする
        calendarId: props.clone ? initialCalendarId.value : (originalEvent.value?.calendarId ?? initialCalendarId.value),
        icon: originalEvent.value?.icon ?? '',
        isAllDay: !!originalEvent.value?.isAllDay,
        startDateTime: originalEvent.value?.startDateTime,
        // 終日イベントの raw end は排他のため、フォームでは「終了日（含む）」へ変換する
        endDateTime: originalEvent.value?.isAllDay ? originalEvent.value?.endDateTime?.subtract(1, 'day') : originalEvent.value?.endDateTime,
        timeZone: originalEvent.value?.timeZone ?? userStore.timeZone,
        // 'confidential' 等の UI 未対応の値もそのまま保持し、保存時に再送信する
        visibility: originalEvent.value?.raw?.visibility ?? 'default',
        isTask: isTaskEvent(originalEvent.value),
        taskStatus: taskStatusOf(originalEvent.value),
        taskDeferred: isTaskDeferred(originalEvent.value),
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
      eventColorId.value = originalEvent.value?.eventColorId ?? '';
      eventTagsInput.value = (originalEvent.value?.tags ?? []).join(' ');
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
      <label for="title">
        <span>アイコンとタイトル</span>
        <div>
          <EmojiSelecter v-model="formData.icon" />
          <SuggestPulldown id="title" v-model="formData.summary" :suggestions="titleSuggestions" placeholder="イベントのタイトル" aria-label="タイトル" required autofocus enter-focus @select="selectRecentTitle" @focus="updateTitleSuggestions" @enter="focusNextOnEnter" />
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
    <!-- 終日 -->
    <section>
      <label> <input v-model="formData.isAllDay" type="checkbox" /> 終日 </label>
      <label> <input v-model="formData.isTask" type="checkbox" :disabled="!isOrganizerEvent" /> タスクとして管理 </label>
      <template v-if="formData.isTask">
        <label class="task-sub-option"> <input v-model="formData.taskDeferred" type="checkbox" :disabled="!isOrganizerEvent" /> 未完了のとき翌日へ持ち越す </label>
        <label class="task-sub-option">
          <span>タスクのステータス</span>
          <select v-model="formData.taskStatus" :disabled="!isOrganizerEvent">
            <option v-for="status in TASK_STATUSES" :key="status" :value="status">{{ taskStatusLabel(status) }}</option>
            <option v-if="!TASK_STATUSES.includes(formData.taskStatus)" :value="formData.taskStatus">{{ formData.taskStatus }}</option>
          </select>
        </label>
        <p class="task-hint">タスクは非公開の予定として保存され、共有カレンダーには表示されません.</p>
      </template>
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
    <!-- 場所と説明とノート -->
    <section>
      <button type="button" v-if="!showDetailInputs.location" @click="showDetailInputs.location = !showDetailInputs.location"><IconLocationDot />場所を追加</button>
      <label v-if="showDetailInputs.location">
        <span><IconLocationDot />場所</span>
        <input v-model="formData.location" placeholder="Google Maps の URL または場所の名前" data-enter-focus @keydown.enter="focusNextOnEnter" />
      </label>
      <button v-if="!showDetailInputs.description" type="button" @click="showDetailInputs.description = !showDetailInputs.description"><IconAlignLeft />説明を追加</button>
      <label v-if="showDetailInputs.description">
        <span><IconAlignLeft />説明</span>
        <textarea v-model="formData.description" rows="5" placeholder="イベントの説明" data-enter-focus @keydown.shift.enter="focusNextOnEnter"></textarea>
      </label>
      <button v-if="!showDetailInputs.tag" type="button" @click="showDetailInputs.tag = !showDetailInputs.tag"><IconTag />タグを追加</button>
      <label v-if="showDetailInputs.tag">
        <span><IconTag />タグ</span>
        <SuggestPulldown v-model="eventTagsInput" :suggestions="tagSuggestions" placeholder="空白またはカンマ区切り (例: 仕事, 買い物)" aria-label="タグ" enter-focus @select="selectTagSuggestion" @enter="focusNextOnEnter" />
      </label>
      <button v-if="!showDetailInputs.note" type="button" @click="showDetailInputs.note = !showDetailInputs.note"><IconFileShield />ノートを追加</button>
      <label v-if="showDetailInputs.note">
        <span><IconFileShield />個人用ノート</span>
        <textarea v-model="formData.privacyNote" rows="3" placeholder="自分だけに表示されます" data-enter-focus @keydown.shift.enter="focusNextOnEnter"></textarea>
      </label>
      <!-- イベントの色 -->
    </section>
    <!-- 色 -->
    <section>
      <label>
        <span><IconPalette />イベントの色</span>
        <EventFormColorField v-model="eventColorId" :calendar-color="calendarStore.getCalendarColor(formData.calendarId)?.backgroundColor ?? '#2196f3'" />
      </label>
    </section>
    <!-- 詳細設定 -->
    <AccordionMenu label="詳細設定">
      <!-- 招待するユーザー -->
      <section class="accordion-content">
        <label>
          <span><IconUserPlus />招待するユーザー</span>
          <EventFormAttendeeField v-model="attendeeQuery" :attendees="attendees" :suggestions="peopleStore.suggestions" :is-searching="isSearchingPeople" @add-attendee="addAttendee" @add-unknown-email="addUnknownEmail" @remove-attendee="removeAttendee" @query-blur="clearPeopleSuggestionsLater" />
        </label>
      </section>
      <!-- タイムゾーン -->
      <section class="accordion-content">
        <label
          ><span><IconClock />タイムゾーン</span>
          <TimezoneSelecter v-model="formData.timeZone" />
        </label>
      </section>
      <!-- 公開設定 -->
      <section class="accordion-content">
        <label
          ><span><IconUserLock />公開設定</span>
          <select v-model="formData.visibility" :disabled="formData.isTask">
            <option value="default">デフォルトの公開設定</option>
            <option value="public">公開</option>
            <option value="private">非公開</option>
          </select>
        </label>
      </section>
      <!-- 繰り返し設定 -->
      <section class="accordion-content">
        <label
          ><span><IconArrowsRotate />繰り返し</span>
          <EventFormRecurrenceField :recurrence="recurrence" />
        </label>
      </section>

      <!-- 通知設定 -->
      <section class="accordion-content">
        <label
          ><span><IconBell />通知</span>
          <EventFormReminderField :reminders="reminders" @add-reminder="addReminderRow" @remove-reminder="removeReminderRow" />
        </label>
      </section>

      <!-- 写真アルバム -->
      <section class="accordion-content">
        <label
          ><span><IconImage />写真アルバム</span>
          <EventFormPhotoAlbumField v-if="photoAlbumAvailable" v-model="createPhotoAlbum" :existing-album="existingPhotoAlbum" :attendees-count="attendees.length" />
        </label>
      </section>
    </AccordionMenu>

    <section class="form-actions">
      <button data-app-button="secondary" type="button" title="現在の入力内容をテンプレートとして保存" @click="isTemplateSaveDialogOpen = true"><IconFileCirclePlus />テンプレートとして保存</button>
      <div>
        <button data-app-button="secondary" type="button" @click="emit('cancel')"><IconRotateLeft />キャンセル</button>
        <button data-app-button="primary" type="submit" data-enter-focus @keydown.enter.prevent="submitForm"><IconFloppyDisk />{{ props.submitLabel }}</button>
      </div>
    </section>
  </form>
  <EventFormTemplateSaveDialog v-if="isTemplateSaveDialogOpen" @save="saveAsTemplate" @cancel="isTemplateSaveDialogOpen = false" />
</template>

<style lang="scss" scoped>
form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  width: 100%;
}

// アイコンとタイトルの入力欄
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

      > div:last-child {
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

// 終日の入力欄
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
        // width: calc(100% - var(--space-md) * 2);
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

// 場所と説明とノートの入力欄
form > section:nth-of-type(7) {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);

  > button {
    background-color: var(--bg-2);
    border: 1px solid var(--border);
    font-size: var(--text-size-xs);
    justify-content: flex-start;

    &:hover {
      background-color: var(--bg-3);
    }
  }

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
}

// 色
form > section:nth-of-type(8) {
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
}

// 詳細設定
section.accordion-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-bottom: var(--space-sm);

  > label {
    display: flex;
    flex-direction: column;

    span {
      font-size: var(--text-size-xs);
      display: flex;
      align-items: center;
      gap: var(--space-sm);
    }
  }

  input,
  select,
  button {
    background-color: var(--bg-3);
  }

  // 招待するユーザー
  // &:nth-child(1) {}

  // タイムゾーン
  &:nth-child(2) {
    :deep(select),
    :deep(button) {
      background-color: var(--bg-3);
    }
  }

  // 公開設定
  // &:nth-child(3) {}

  // 繰り返し
  // &:nth-child(4) {}

  // 通知
  // &:nth-child(5) {}

  // 写真共有アルバム
  // &:nth-child(6) {}
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
  }
}
</style>
