<script setup>
import { computed, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import dayjs from '@/services/dayjs.js';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import { useShareStore } from '@/stores/share.js';
import MenuBar from '@/components/MenuBar.vue';
import AskLoginMessage from '@/components/AskLoginMessage.vue';
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

const formCalendarIds = computed(() => new Set(form.calendarIds));

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
    formError.value = '共有相手のメールアドレスを入力してください。';
    return;
  }
  if (!form.calendarIds.length) {
    formError.value = '共有するカレンダーを1つ以上選択してください。';
    return;
  }
  if (!form.rangeStart || !form.rangeEnd || form.rangeEnd < form.rangeStart) {
    formError.value = '共有する日付範囲を正しく入力してください。';
    return;
  }
  const expiresAt = resolveExpiresAt();
  if (!expiresAt) {
    formError.value = '有効期限を入力してください。';
    return;
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
    successMessage.value = `${recipient} に共有カレンダーを作成しました。相手にカレンダー ID を伝えてください。`;
    form.recipient = '';
    form.title = '';
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
    message: `${spec.recipient} への共有を解除し、コピーカレンダーを削除します。よろしいですか？`,
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
</script>

<template>
  <div class="share-manage-view">
    <MenuBar>
      <template #main>
        <h1 class="title">期間を指定して共有</h1>
      </template>
      <template #sub>
        <button title="カレンダーに戻る" @click="router.push({ name: 'Home' })">
          <IconXMark />
        </button>
      </template>
      選択した期間の予定だけをコピーしたカレンダーを作成して共有します
    </MenuBar>

    <AskLoginMessage v-if="!authStore.isAuthenticated">共有するには Google アカウントでログインする必要があります</AskLoginMessage>

    <template v-else>
      <section class="create-form">
        <div class="heading">
          <IconUserPlus />
          <h2>新しい共有を作成</h2>
        </div>
        <form @submit.prevent="submitShare">
          <label
            >共有相手のメールアドレス
            <input v-model="form.recipient" type="email" placeholder="name@example.com" required />
          </label>
          <label
            >共有カレンダーの名前（省略可）
            <input v-model="form.title" type="text" placeholder="例: 10月の予定" />
          </label>
          <fieldset>
            <legend>共有するカレンダー</legend>
            <label v-for="cal in calendarStore.listWritableCalendars" :key="cal.id" class="switch-row">
              <input type="checkbox" :checked="formCalendarIds.has(cal.id)" @change="($event.target.checked ? form.calendarIds.push(cal.id) : (form.calendarIds = form.calendarIds.filter((id) => id !== cal.id)))" />
              {{ cal.summary }}
            </label>
            <p v-if="!calendarStore.listWritableCalendars.length" class="hint">共有できるカレンダーがありません。</p>
          </fieldset>
          <div class="date-row">
            <label
              >範囲の開始日
              <input v-model="form.rangeStart" type="date" required />
            </label>
            <label
              >範囲の終了日
              <input v-model="form.rangeEnd" type="date" required />
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
          <p class="hint">期限が来ると共有は自動で解除され、コピーカレンダーは削除されます。範囲内の予定が追加・変更・削除されるとコピー先にも反映されます。</p>
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
        <p v-if="!shareStore.specs.length" class="hint">現在、期間を指定した共有はありません。</p>
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
              <button type="button" title="カレンダー ID をコピー" @click="copyCalendarId(spec.copyCalendarId)">
                <IconClipboard />{{ copiedCalendarId === spec.copyCalendarId ? 'コピーしました' : 'ID をコピー' }}
              </button>
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
  gap: var(--space-md);
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
  border-bottom: 1px solid var(--border);

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
  .date-row label {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    font-size: var(--text-size-xs);
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

  fieldset {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
    padding: var(--space-sm);
    font-size: var(--text-size-xs);

    legend {
      font-size: var(--text-size-xxs);
      color: var(--text-light);
    }
  }

  .switch-row {
    flex-direction: row;
    align-items: center;
    gap: var(--space-xs);
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
</style>
