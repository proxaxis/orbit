<script setup>
import { computed, reactive, ref, watch, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import dayjs from '@/services/dayjs.js';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import { useShareStore } from '@/stores/share.js';
import { usePeopleStore } from '@/stores/people.js';
import MenuBar from '@/components/MenuBar.vue';
import CalendarRibbon from '@/components/CalendarRibbon.vue';
import DatePicker from '@/components/DatePicker.vue';
import AskLoginMessage from '@/components/AskLoginMessage.vue';
import IconCalendar from '@/components/icons/IconCalendar.vue';
import IconUserPlus from '@/components/icons/IconUserPlus.vue';
import IconTrash from '@/components/icons/IconTrash.vue';
import IconXMark from '@/components/icons/IconXMark.vue';
import IconArrowRotateLeft from '@/components/icons/IconArrowRotateLeft.vue';
import IconClipboard from '@/components/icons/IconClipboard.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const calendarStore = useCalendarStore();
const userStore = useUserStore();
const shareStore = useShareStore();
const peopleStore = usePeopleStore();

const roleOptions = [
  { value: 'freeBusyReader', label: '予定の有無のみ（空き時間）' },
  { value: 'reader', label: '予定の詳細を閲覧' },
];

const expiryOptions = [
  { value: '1w', label: '1週間後' },
  { value: '2w', label: '2週間後' },
  { value: '1m', label: '1か月後' },
  { value: 'custom', label: '日付を指定' },
];

const today = dayjs();
const requestedCalendarId = typeof route.query.cid === 'string' ? route.query.cid : '';

const form = reactive({
  recipient: '',
  title: '',
  calendarIds: calendarStore.listWritableCalendars.some((cal) => cal.id === requestedCalendarId) ? [requestedCalendarId] : calendarStore.listWritableCalendars.slice(0, 1).map((cal) => cal.id),
  rangeStart: today.format('YYYY-MM-DD'),
  rangeEnd: today.add(1, 'week').format('YYYY-MM-DD'),
  expiryKind: '1w',
  expiryDate: today.add(1, 'month').format('YYYY-MM-DD'),
  role: 'reader',
});

const formError = ref('');
const successMessage = ref('');
/** @type {Ref<string|null>} 処理中の共有 ID */
const processingSpecId = ref(null);
/** @type {Ref<string|null>} クリップボードにコピーしたカレンダー ID */
const copiedCalendarId = ref(null);
/** @type {Ref<boolean>} People API 検索中かどうか */
const isSearchingPeople = ref(false);
/** @type {number|null} People API 検索のデバウンスタイマー */
let peopleSearchTimer = null;
/** @type {number} People API 検索の世代 */
let peopleSearchGeneration = 0;
/** 候補を選択して入力欄を更新した直後の再検索を抑制する */
let suppressRecipientSearch = false;
/** @type {Ref<'rangeStart'|'rangeEnd'|null>} 開いている日付ピッカーの対象 */
const openDatePicker = ref(null);
/** @type {{rangeStart: string, rangeEnd: string}} 入力された範囲日付（数字のみ） */
const rangeDateFields = reactive({
  rangeStart: today.format('YYYYMMDD'),
  rangeEnd: today.add(1, 'week').format('YYYYMMDD'),
});

const formCalendarIds = computed(() => new Set(form.calendarIds));

const showRecipientSuggestions = computed(() => isSearchingPeople.value || peopleStore.suggestions.length > 0 || form.recipient.trim().length >= 2);

/** @returns {string} 選択された期限指定から有効期限日付を求める */
function resolveExpiresAt() {
  const base = dayjs();
  if (form.expiryKind === '1w') return base.add(1, 'week').format('YYYY-MM-DD');
  if (form.expiryKind === '2w') return base.add(2, 'week').format('YYYY-MM-DD');
  if (form.expiryKind === '1m') return base.add(1, 'month').format('YYYY-MM-DD');
  return form.expiryDate;
}

/** @param {OrbitShareSpec} spec @returns {string} 共有条件の概要テキスト */
function specSummary(spec) {
  const names = spec.calendarIds.map((id) => calendarStore.list.find((cal) => cal.id === id)?.summary ?? id).join(', ');
  return `${spec.rangeStart} 〜 ${spec.rangeEnd} / ${names}`;
}

/** @param {string} value @returns {string} 日付を桁数に応じて空白区切りで表示する */
function formatDateField(value) {
  if (value.length === 8) return `${value.slice(0, 4)} ${value.slice(4, 6)} ${value.slice(6, 8)}`;
  if (value.length === 6) return `${value.slice(0, 2)} ${value.slice(2, 4)} ${value.slice(4, 6)}`;
  if (value.length === 4) return `${value.slice(0, 2)} ${value.slice(2, 4)}`;
  return value;
}

/** @param {string} digits @returns {string} 入力された数字を YYYY-MM-DD に変換する（不完全・無効なら空文字） */
function digitsToISODate(digits) {
  let year = 0,
    month = 0,
    day = 0;
  if (digits.length === 8) {
    year = Number(digits.slice(0, 4));
    month = Number(digits.slice(4, 6));
    day = Number(digits.slice(6, 8));
  } else if (digits.length === 6) {
    year = 2000 + Number(digits.slice(0, 2));
    month = Number(digits.slice(2, 4));
    day = Number(digits.slice(4, 6));
  } else if (digits.length === 4) {
    year = dayjs().year();
    month = Number(digits.slice(0, 2));
    day = Number(digits.slice(2, 4));
  } else {
    return '';
  }
  const parsed = dayjs(new Date(year, month - 1, day));
  return parsed.isValid() && parsed.year() === year && parsed.month() === month - 1 && parsed.date() === day ? parsed.format('YYYY-MM-DD') : '';
}

/** @param {'rangeStart'|'rangeEnd'} field @param {Event} event 日付のタイピング入力 */
function updateRangeDateField(field, event) {
  const input = /** @type {HTMLInputElement} */ (event.currentTarget);
  const digits = input.value.replace(/\D/g, '').slice(0, 8);
  rangeDateFields[field] = digits;
  let iso = digitsToISODate(digits);
  // 4桁入力で終了日が開始日より前になる場合は翌年とみなす
  if (field === 'rangeEnd' && digits.length === 4 && iso && form.rangeStart && iso < form.rangeStart) {
    iso = dayjs(iso).add(1, 'year').format('YYYY-MM-DD');
  }
  form[field] = iso;
}

/** @param {'rangeStart'|'rangeEnd'} field @returns {string} DatePicker に渡す ISO 日付 */
function datePickerValue(field) {
  return form[field] || dayjs().format('YYYY-MM-DD');
}

/** @param {'rangeStart'|'rangeEnd'} field @param {string} value DatePicker で選択された日付 */
function selectRangeDate(field, value) {
  form[field] = value;
  rangeDateFields[field] = value.replace(/\D/g, '');
  openDatePicker.value = null;
}

/** @param {string} calendarId 共有対象カレンダーの選択を切り替える */
function toggleCalendar(calendarId) {
  if (formCalendarIds.value.has(calendarId)) form.calendarIds = form.calendarIds.filter((id) => id !== calendarId);
  else form.calendarIds = [...form.calendarIds, calendarId];
}

/** @param {GooglePeoplePerson} person People API の候補を共有相手に設定する */
function selectRecipient(person) {
  const email = person.emailAddresses?.find((entry) => entry.value)?.value?.trim();
  if (!email) return;
  suppressRecipientSearch = true;
  form.recipient = email;
  peopleStore.clearSuggestions();
}

/** 入力欄からフォーカスが外れた後、候補選択の時間を確保して一覧を閉じる */
function clearPeopleSuggestionsLater() {
  window.setTimeout(() => peopleStore.clearSuggestions(), 150);
}

/** @param {string} email @returns {Promise<boolean>} メールアドレスが連絡先に存在するか */
async function isKnownRecipient(email) {
  const needle = email.toLowerCase();
  const people = await peopleStore.search(email);
  return people.some((person) => person.emailAddresses?.some((entry) => entry.value?.trim().toLowerCase() === needle));
}

/** @param {string} calendarId コピーカレンダー ID をクリップボードへコピーする */
async function copyCalendarId(calendarId) {
  try {
    await navigator.clipboard.writeText(calendarId);
    copiedCalendarId.value = calendarId;
    window.setTimeout(() => {
      if (copiedCalendarId.value === calendarId) copiedCalendarId.value = null;
    }, 2000);
  } catch (error) {
    console.warn('Failed to copy calendar ID.', error);
  }
}

/** フォームの内容から共有を作成する */
async function submitShare() {
  formError.value = '';
  successMessage.value = '';
  const recipient = form.recipient.trim();
  if (!recipient || !recipient.includes('@')) {
    formError.value = '共有相手のメールアドレスを入力してください. ';
    return;
  }
  if (!form.calendarIds.length) {
    formError.value = '共有するカレンダーを1つ以上選択してください. ';
    return;
  }
  if (!form.rangeStart || !form.rangeEnd || form.rangeEnd < form.rangeStart) {
    formError.value = '共有する日付範囲を正しく入力してください. ';
    return;
  }
  const expiresAt = resolveExpiresAt();
  if (!expiresAt) {
    formError.value = '有効期限を入力してください. ';
    return;
  }

  let registerContact = false;
  if (!(await isKnownRecipient(recipient))) {
    registerContact = await userStore.confirm({
      title: '連絡先に登録',
      message: `${recipient} は連絡先に見つかりませんでした. 連絡先に登録しますか？`,
    });
  }

  const firstCalendar = calendarStore.list.find((cal) => cal.id === form.calendarIds[0]);
  try {
    await shareStore.createShare({
      title: form.title.trim() || `${firstCalendar?.summary ?? 'カレンダー'} の共有 (${form.rangeStart}〜${form.rangeEnd})`,
      recipient,
      calendarIds: [...form.calendarIds],
      rangeStart: form.rangeStart,
      rangeEnd: form.rangeEnd,
      expiresAt,
      role: form.role,
    });
    form.recipient = '';
    form.title = '';
    if (registerContact) {
      peopleStore.setPendingRegistrationEmails([recipient]);
      router.push({ name: 'PeopleEditor' });
      return;
    }
    successMessage.value = `${recipient} に共有カレンダーを作成しました. 相手にカレンダー ID を伝えてください. `;
  } catch (error) {
    formError.value = error instanceof Error ? error.message : String(error);
  }
}

/** @param {OrbitShareSpec} spec 共有を手動で今すぐ同期する */
async function syncNow(spec) {
  processingSpecId.value = spec.id;
  try {
    await shareStore.syncShare(spec);
  } finally {
    processingSpecId.value = null;
  }
}

/** @param {OrbitShareSpec} spec 共有を解除してコピーカレンダーを削除する */
async function revokeShare(spec) {
  const confirmed = await userStore.confirm({
    title: '共有を解除',
    message: `${spec.recipient} への共有を解除し、コピーカレンダーを削除します. よろしいですか？`,
  });
  if (!confirmed) return;
  processingSpecId.value = spec.id;
  try {
    await shareStore.removeShare(spec.id);
  } catch (error) {
    formError.value = error instanceof Error ? error.message : String(error);
  } finally {
    processingSpecId.value = null;
  }
}

watch(
  () => form.recipient,
  (query, _previousQuery, onCleanup) => {
    if (peopleSearchTimer !== null) window.clearTimeout(peopleSearchTimer);
    const generation = ++peopleSearchGeneration;
    const normalizedQuery = query.trim();
    if (suppressRecipientSearch || normalizedQuery.length < 2 || (normalizedQuery.startsWith('@') && normalizedQuery.length < 3)) {
      suppressRecipientSearch = false;
      isSearchingPeople.value = false;
      peopleStore.clearSuggestions();
      return;
    }

    isSearchingPeople.value = true;
    peopleSearchTimer = window.setTimeout(async () => {
      try {
        await peopleStore.search(normalizedQuery);
      } finally {
        if (generation === peopleSearchGeneration) isSearchingPeople.value = false;
        peopleSearchTimer = null;
      }
    }, 300);
    onCleanup(() => {
      if (peopleSearchTimer !== null) window.clearTimeout(peopleSearchTimer);
    });
  },
);

onUnmounted(() => {
  peopleSearchGeneration += 1;
  if (peopleSearchTimer !== null) window.clearTimeout(peopleSearchTimer);
  peopleStore.clearSuggestions();
});
</script>

<template>
  <div class="share-manage-view">
    <MenuBar>
      <template #main>
        <h1 class="title">期間を指定して共有</h1>
      </template>
      <template #sub>
        <button class="icon-x-mark-btn" title="カレンダーに戻る" @click="router.push({ name: 'Home' })">
          <IconXMark />
        </button>
      </template>
      選択した期間の予定だけを共有します
    </MenuBar>

    <AskLoginMessage v-if="!authStore.isAuthenticated">共有するには Google アカウントでログインする必要があります</AskLoginMessage>

    <template v-else>
      <section class="create-form">
        <div class="heading">
          <IconUserPlus />
          <h2>新しい共有を作成</h2>
        </div>
        <form @submit.prevent="submitShare">
          <div class="recipient-field">
            <label
              >共有相手
              <input v-model="form.recipient" type="text" autocomplete="off" placeholder="名前またはメールアドレス" required @blur="clearPeopleSuggestionsLater" />
            </label>
            <p v-if="form.recipient.trim().startsWith('@')" class="hint">ラベルで検索中</p>
            <ul v-if="showRecipientSuggestions" class="recipient-suggestions">
              <li v-if="isSearchingPeople">検索中...</li>
              <li v-for="person in peopleStore.suggestions" :key="person.resourceName">
                <button type="button" @mousedown.prevent="selectRecipient(person)">
                  <span>{{ person.names?.[0]?.displayName || '名前なし' }}</span>
                  <small>{{ person.emailAddresses?.[0]?.value }}</small>
                </button>
              </li>
              <li v-if="!isSearchingPeople && !peopleStore.suggestions.length">候補が見つかりません</li>
            </ul>
          </div>
          <label
            >共有の名前（省略可）
            <input v-model="form.title" type="text" placeholder="例: 10月の予定" />
          </label>
          <fieldset>
            <legend>共有するカレンダー</legend>
            <p v-if="!calendarStore.listWritableCalendars.length" class="hint">共有できるカレンダーがありません.</p>
            <div v-else class="calendar-list">
              <CalendarRibbon v-for="cal in calendarStore.listWritableCalendars" :key="cal.id" :cid="cal.id" :selectable="true" :selected="formCalendarIds.has(cal.id)" @select="toggleCalendar" />
            </div>
          </fieldset>
          <div class="date-row">
            <label
              >範囲の開始日
              <div class="date-field">
                <button type="button" aria-label="開始日をカレンダーから選択" @click="openDatePicker = 'rangeStart'">
                  <IconCalendar />
                </button>
                <input :value="formatDateField(rangeDateFields.rangeStart)" inputmode="numeric" maxlength="10" placeholder="YYYY MM DD" required @input="updateRangeDateField('rangeStart', $event)" />
                <DatePicker v-if="openDatePicker === 'rangeStart'" :model-value="datePickerValue('rangeStart')" @update:model-value="selectRangeDate('rangeStart', $event)" @close="openDatePicker = null" />
              </div>
            </label>
            <label
              >範囲の終了日
              <div class="date-field">
                <button type="button" aria-label="終了日をカレンダーから選択" @click="openDatePicker = 'rangeEnd'">
                  <IconCalendar />
                </button>
                <input :value="formatDateField(rangeDateFields.rangeEnd)" inputmode="numeric" maxlength="10" placeholder="YYYY MM DD" required @input="updateRangeDateField('rangeEnd', $event)" />
                <DatePicker v-if="openDatePicker === 'rangeEnd'" :model-value="datePickerValue('rangeEnd')" @update:model-value="selectRangeDate('rangeEnd', $event)" @close="openDatePicker = null" />
              </div>
            </label>
          </div>
          <div class="date-row">
            <label
              >共有の有効期限
              <select v-model="form.expiryKind">
                <option v-for="option in expiryOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
            <label v-if="form.expiryKind === 'custom'"
              >期限の日付
              <input v-model="form.expiryDate" type="date" required />
            </label>
            <label
              >相手の権限
              <select v-model="form.role">
                <option v-for="option in roleOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
              </select>
            </label>
          </div>
          <p class="hint">期限が来ると共有は自動で解除されます. 範囲内の予定が追加、変更、削除されると相手にも反映されます.</p>
          <p v-if="formError" class="error">{{ formError }}</p>
          <p v-if="successMessage" class="success">{{ successMessage }}</p>
          <div class="actions">
            <button data-app-button="primary" type="submit" :disabled="shareStore.isBusy"><IconUserPlus />{{ shareStore.isBusy ? shareStore.busyMessage || '作成中...' : '共有を作成' }}</button>
          </div>
        </form>
      </section>

      <section class="share-list">
        <div class="heading">
          <h2>共有中のカレンダー</h2>
          <span>{{ shareStore.specs.length }}件</span>
        </div>
        <p v-if="!shareStore.specs.length" class="hint">現在、期間を指定した共有はありません.</p>
        <ul>
          <li v-for="spec in shareStore.specs" :key="spec.id" :class="{ 'is-expired': shareStore.isExpired(spec) }">
            <div class="spec-info">
              <strong>{{ spec.title }}</strong>
              <small>共有相手: {{ spec.recipient }}（{{ roleOptions.find((option) => option.value === spec.role)?.label ?? spec.role }}）</small>
              <small>{{ specSummary(spec) }}</small>
              <small>有効期限: {{ spec.expiresAt }}{{ shareStore.isExpired(spec) ? '（期限切れ）' : '' }}</small>
              <small v-if="spec.lastSyncedAt">最終同期: {{ dayjs(spec.lastSyncedAt).format('YYYY-MM-DD HH:mm') }}</small>
            </div>
            <div v-if="spec.copyCalendarId" class="spec-id">
              <code>{{ spec.copyCalendarId }}</code>
              <button type="button" title="カレンダー ID をコピー" @click="copyCalendarId(spec.copyCalendarId)"><IconClipboard />{{ copiedCalendarId === spec.copyCalendarId ? 'コピーしました' : 'ID をコピー' }}</button>
            </div>
            <div class="spec-actions">
              <button type="button" :disabled="processingSpecId === spec.id" @click="syncNow(spec)"><IconArrowRotateLeft />今すぐ同期</button>
              <button type="button" class="revoke" :disabled="processingSpecId === spec.id" @click="revokeShare(spec)"><IconTrash />共有を解除</button>
            </div>
          </li>
        </ul>
        <p v-if="shareStore.lastSyncError" class="error">{{ shareStore.lastSyncError }}</p>
      </section>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.share-manage-view {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  height: 100%;
}

section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.heading {
  display: flex;
  align-items: center;
  gap: var(--space-xs);

  h2 {
    font-size: var(--text-size-md);
  }

  span {
    margin-left: auto;
    font-size: var(--text-size-sm);
    color: var(--text-light);
  }
}

.create-form form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);

  > label,
  .date-row label,
  .recipient-field > label {
    display: flex;
    flex-direction: column;
    font-size: var(--text-size-xs);
  }

  .recipient-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .recipient-suggestions {
    display: flex;
    flex-direction: column;
    gap: var(--space-xxs);
    padding: var(--space-xs);
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
    background: var(--bg-2);
    list-style: none;
    font-size: var(--text-size-xs);

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

  .date-row {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;

    label {
      flex: 1;
      min-width: 9rem;
    }
  }

  .date-field {
    position: relative;
    display: flex;
    gap: var(--space-xs);
    align-items: center;

    > button {
      background-color: var(--bg-2);
      border: 1px solid var(--border);
      padding: var(--space-sm);
      flex-shrink: 0;

      &:hover {
        background-color: var(--bg-3);
      }
    }

    > input {
      flex: 1;
      min-width: 0;
    }
  }

  fieldset {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
    font-size: var(--text-size-xs);
    min-width: 0;
    padding: 0 var(--space-sm) var(--space-sm) var(--space-sm);

    legend {
      padding: 0 var(--space-xs);
    }
  }

  .calendar-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xxs);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
  }
}

.hint {
  font-size: var(--text-size-xs);
  color: var(--text-light);
}

.error {
  font-size: var(--text-size-xs);
  color: var(--danger);
}

.success {
  font-size: var(--text-size-xs);
  color: var(--primary);
}

.share-list .heading {
  border-bottom: 1px solid var(--border);
  margin-top: var(--space-sm);
}

.share-list ul {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);

  li {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--border-radius);

    &.is-expired {
      opacity: 0.6;
    }
  }

  .spec-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-xxs);

    small {
      color: var(--text-light);
    }
  }

  .spec-id {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    flex-wrap: wrap;

    code {
      word-break: break-all;
      font-size: var(--text-size-xs);
      background-color: var(--bg-2);
      border-radius: var(--border-radius);
      padding: var(--space-xxs) var(--space-xs);
    }

    button {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xxs);
      font-size: var(--text-size-xxs);
      padding: var(--space-xxs) var(--space-xs);
      border: 1px solid var(--border);
      border-radius: var(--border-radius);
    }
  }

  .spec-actions {
    display: flex;
    gap: var(--space-xs);
    justify-content: flex-end;

    button {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xxs);
      font-size: var(--text-size-xs);
      padding: var(--space-xs) var(--space-sm);
      border: 1px solid var(--border);
      border-radius: var(--border-radius);

      &.revoke {
        color: var(--danger);
      }

      &:hover {
        background-color: var(--bg-2);
      }
    }
  }
}

.icon-x-mark-btn {
  background-color: var(--bg-1);
  &:hover {
    background-color: var(--bg-2);
  }
}
</style>
