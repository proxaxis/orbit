<script setup>
/**
 * ShareManageView の共有作成フォーム。
 * 共有相手の People 検索・カレンダー選択・期間/期限/権限の入力から
 * 共有作成リクエストを実行する。
 */
import { computed, reactive, ref, watch, onUnmounted } from 'vue';
import { useRoute } from 'vue-router';
import dayjs from '@/services/dayjs.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import { usePeopleStore } from '@/stores/people.js';
import { useShare } from '@/composables/useShare.js';
import { usePeople } from '@/composables/usePeople.js';
import CalendarRibbon from '@/components/CalendarRibbon.vue';
import SuggestPulldown from '@/components/SuggestPulldown.vue';
import IconCalendar from '@/components/icons/IconCalendar.vue';
import IconUserPlus from '@/components/icons/IconUserPlus.vue';

const route = useRoute();
const calendarStore = useCalendarStore();
const userStore = useUserStore();
const peopleStore = usePeopleStore();
const share = useShare();
const people = usePeople();

const roleOptions = [
  { value: 'reader', label: '予定の詳細を閲覧', isDefault: false },
  { value: 'freeBusyReader', label: '予定の有無のみ（空き時間）', isDefault: true },
];

const expiryOptions = [
  { value: '1w', label: '1週間後' },
  { value: '2w', label: '2週間後' },
  { value: '1m', label: '1か月後' },
  { value: 'custom', label: '日付を指定' },
];

const today = dayjs();
const requestedCalendarId = typeof route.query.cid === 'string' ? route.query.cid : '';

/** 共有作成フォームの入力値 */
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

/** @type {Ref<boolean>} People API 検索中かどうか */
const isSearchingPeople = ref(false);
/** @type {number|null} People API 検索のデバウンスタイマー */
let peopleSearchTimer = null;
/** @type {number} People API 検索の世代 */
let peopleSearchGeneration = 0;
/** 候補を選択して入力欄を更新した直後の再検索を抑制する */
let suppressRecipientSearch = false;
/** @type {{rangeStart: string, rangeEnd: string, expiryDate: string}} 入力された日付（数字のみ） */
const dateFields = reactive({
  rangeStart: today.format('YYYYMMDD'),
  rangeEnd: today.add(1, 'week').format('YYYYMMDD'),
  expiryDate: today.add(1, 'month').format('YYYYMMDD'),
});

const formCalendarIds = computed(() => new Set(form.calendarIds));

/** @returns {string} 選択された期限指定から有効期限日付を求める */
function resolveExpiresAt() {
  const base = dayjs();
  if (form.expiryKind === '1w') return base.add(1, 'week').format('YYYY-MM-DD');
  if (form.expiryKind === '2w') return base.add(2, 'week').format('YYYY-MM-DD');
  if (form.expiryKind === '1m') return base.add(1, 'month').format('YYYY-MM-DD');
  return form.expiryDate;
}

/** @param {string} value @returns {string} 日付を桁数に応じて空白区切りで表示する */
function formatDateField(value) {
  if (value.length === 8) return `${value.slice(0, 4)} ${value.slice(4, 6)} ${value.slice(6, 8)}`;
  if (value.length === 6) return `${value.slice(0, 2)} ${value.slice(2, 4)}`;
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
  const parsed = dayjs(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  return parsed.isValid() && parsed.year() === year && parsed.month() === month - 1 && parsed.date() === day ? parsed.format('YYYY-MM-DD') : '';
}

/** @param {'rangeStart'|'rangeEnd'|'expiryDate'} field @param {Event} event 日付のタイピング入力 */
function updateDateField(field, event) {
  const input = /** @type {HTMLInputElement} */ (event.currentTarget);
  const digits = input.value.replace(/\D/g, '').slice(0, 8);
  dateFields[field] = digits;
  let iso = digitsToISODate(digits);
  // 4桁入力で終了日が開始日より前になる場合は翌年とみなす
  if (field === 'rangeEnd' && digits.length === 4 && iso && form.rangeStart && iso < form.rangeStart) {
    iso = dayjs(iso).add(1, 'year').format('YYYY-MM-DD');
  }
  form[field] = iso;
}

/** @param {'rangeStart'|'rangeEnd'|'expiryDate'} field 日付ボタン押下でメインカレンダーからの日付選択を開始する */
function openDatePickerFor(field) {
  // 対象フィールドの月がカレンダーに表示されるようにする
  const base = dayjs(form[field]);
  userStore.nowUsingDate = base.isValid() ? base : dayjs();
  userStore.beginFormDatePick('shareForm', field);
}

/** @param {'rangeStart'|'rangeEnd'|'expiryDate'} field @param {string} value メインカレンダーで選択された日付 */
function selectFormDate(field, value) {
  form[field] = value;
  dateFields[field] = value.replace(/\D/g, '');
}

// メインカレンダーで確定された日付選択をフォームへ反映する（単日クリックは対象フィールドのみ、範囲ドラッグは開始日と終了日の両方）
watch(
  () => userStore.formPickResult,
  (result) => {
    if (!result || result.target !== 'shareForm') return;
    userStore.formPickResult = null;
    if (result.end && result.end !== result.start && result.field !== 'expiryDate') {
      selectFormDate('rangeStart', result.start);
      selectFormDate('rangeEnd', result.end);
      return;
    }
    selectFormDate(/** @type {'rangeStart'|'rangeEnd'|'expiryDate'} */ (result.field), result.start);
  },
);

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

/** フォームの内容から共有を作成する */
async function submitShare() {
  const recipient = form.recipient.trim();
  if (!recipient || !recipient.includes('@')) {
    userStore.showToast('共有相手のメールアドレスを入力してください.');
    return;
  }
  if (!form.calendarIds.length) {
    userStore.showToast('共有するカレンダーを1つ以上選択してください.');
    return;
  }
  if (!form.rangeStart || !form.rangeEnd || form.rangeEnd < form.rangeStart) {
    userStore.showToast('共有する日付範囲を正しく入力してください.');
    return;
  }
  const expiresAt = resolveExpiresAt();
  if (!expiresAt) {
    userStore.showToast('有効期限を入力してください.');
    return;
  }

  const firstCalendar = calendarStore.list.find((cal) => cal.id === form.calendarIds[0]);
  try {
    await share.createShare({
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
    userStore.showToast(`${recipient} に共有カレンダーを作成しました. 相手にカレンダー ID を伝えてください.`);
  } catch (error) {
    userStore.setError(true, error);
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
        await people.search(normalizedQuery);
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
  <section class="create-form">
    <div class="heading">
      <IconUserPlus />
      <h2>新しい共有を作成</h2>
    </div>
    <form @submit.prevent="submitShare">
      <div class="recipient-field">
        <label
          >共有相手
          <SuggestPulldown
            v-model="form.recipient"
            :suggestions="peopleStore.suggestions"
            :is-searching="isSearchingPeople"
            :show-empty="!isSearchingPeople && !peopleStore.suggestions.length && form.recipient.trim().length >= 2"
            :item-key="(person) => person.resourceName"
            placeholder="名前またはメールアドレス"
            required
            @select="selectRecipient"
            @blur="clearPeopleSuggestionsLater">
            <template #suggestion="{ item: person }">
              <span>{{ person.names?.[0]?.displayName || '名前なし' }}</span>
              <small>{{ person.emailAddresses?.[0]?.value }}</small>
            </template>
          </SuggestPulldown>
        </label>
        <p v-if="form.recipient.trim().startsWith('@')" class="hint">ラベルで検索中</p>
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
            <button type="button" title="カレンダーから選択" aria-label="開始日をカレンダーから選択" @click="openDatePickerFor('rangeStart')">
              <IconCalendar />
            </button>
            <input :value="formatDateField(dateFields.rangeStart)" inputmode="numeric" maxlength="10" placeholder="YYYY MM DD" required @input="updateDateField('rangeStart', $event)" />
          </div>
        </label>
        <label
          >範囲の終了日
          <div class="date-field">
            <button type="button" title="カレンダーから選択" aria-label="終了日をカレンダーから選択" @click="openDatePickerFor('rangeEnd')">
              <IconCalendar />
            </button>
            <input :value="formatDateField(dateFields.rangeEnd)" inputmode="numeric" maxlength="10" placeholder="YYYY MM DD" required @input="updateDateField('rangeEnd', $event)" />
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
          <div class="date-field">
            <button type="button" title="カレンダーから選択" aria-label="期限の日付をカレンダーから選択" @click="openDatePickerFor('expiryDate')">
              <IconCalendar />
            </button>
            <input :value="formatDateField(dateFields.expiryDate)" inputmode="numeric" maxlength="10" placeholder="YYYY MM DD" required @input="updateDateField('expiryDate', $event)" />
          </div>
        </label>
        <label
          >相手の権限
          <select v-model="form.role">
            <option v-for="option in roleOptions" :key="option.value" :value="option.value" :selected="option.isDefault">{{ option.label }}</option>
          </select>
        </label>
      </div>
      <p class="hint">期限が来ると共有は自動で解除されます. 範囲内の予定が追加、変更、削除されると相手にも反映されます.</p>
      <div class="actions">
        <button data-app-button="primary" type="submit" :disabled="userStore.isLoading"><IconUserPlus />{{ userStore.isLoading ? userStore.loadingMessage || '作成中...' : '共有を作成' }}</button>
      </div>
    </form>
  </section>
</template>

<style lang="scss" scoped>
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
</style>
