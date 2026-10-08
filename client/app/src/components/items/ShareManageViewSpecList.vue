<script setup>
/**
 * ShareManageView の共有中カレンダー一覧。
 * 共有条件の表示・今すぐ同期・共有解除・コピーカレンダー ID のコピーを担う。
 */
import { ref } from 'vue';
import dayjs from '@/services/dayjs.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import { useShareStore } from '@/stores/share.js';
import { useShare } from '@/composables/useShare.js';
import IconArrowRotateLeft from '@/components/icons/IconArrowRotateLeft.vue';
import IconClipboard from '@/components/icons/IconClipboard.vue';
import IconTrash from '@/components/icons/IconTrash.vue';

const calendarStore = useCalendarStore();
const userStore = useUserStore();
const shareStore = useShareStore();
const share = useShare();

const roleOptions = [
  { value: 'freeBusyReader', label: '予定の有無のみ（空き時間）' },
  { value: 'reader', label: '予定の詳細を閲覧' },
];

/** @type {Ref<string|null>} 処理中の共有 ID */
const processingSpecId = ref(null);
/** @type {Ref<string|null>} クリップボードにコピーしたカレンダー ID */
const copiedCalendarId = ref(null);

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

/** @param {OrbitShareSpec} spec 共有を手動で今すぐ同期する */
async function syncNow(spec) {
  processingSpecId.value = spec.id;
  try {
    await share.syncShare(spec);
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
    await share.removeShare(spec.id);
  } catch (error) {
    userStore.setError(true, error);
  } finally {
    processingSpecId.value = null;
  }
}
</script>

<template>
  <section class="share-list">
    <div class="heading">
      <h2>共有中のカレンダー</h2>
      <span>{{ shareStore.specs.length }}件</span>
    </div>
    <p v-if="!shareStore.specs.length" class="hint">現在、期間を指定した共有はありません.</p>
    <ul>
      <li v-for="spec in shareStore.specs" :key="spec.id" :class="{ 'is-expired': share.isExpired(spec) }">
        <div class="spec-info">
          <strong>{{ spec.title }}</strong>
          <small>共有相手: {{ spec.recipient }}（{{ roleOptions.find((option) => option.value === spec.role)?.label ?? spec.role }}）</small>
          <small>{{ specSummary(spec) }}</small>
          <small>有効期限: {{ spec.expiresAt }}{{ share.isExpired(spec) ? '（期限切れ）' : '' }}</small>
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

<style lang="scss" scoped>
section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.share-list .heading {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  border-bottom: 1px solid var(--border);
  margin-top: var(--space-sm);

  h2 {
    font-size: var(--text-size-md);
  }

  span {
    margin-left: auto;
    font-size: var(--text-size-sm);
    color: var(--text-light);
  }
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

.hint {
  font-size: var(--text-size-xs);
  color: var(--text-light);
}

.error {
  font-size: var(--text-size-xs);
  color: var(--danger);
}
</style>
