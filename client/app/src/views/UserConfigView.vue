<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { USER_FONT_FAMILIES, USER_TEXT_SIZE_VALUES, useUserStore } from '@/stores/user.js';
import { useAuthStore, BFF_BASE_URL } from '@/stores/auth.js';
import { clearOfflineCache, deleteOffline, USER_SETTINGS_KEY } from '@/services/offline-storage.js';
import MenuBar from '@/components/MenuBar.vue';
import { ensureNotificationPermission, notificationPermission } from '@/services/notifications.js';
import IconFloppyDisk from '@/components/icons/IconFloppyDisk.vue';
import IconTrash from '@/components/icons/IconTrash.vue';
import IconXMark from '@/components/icons/IconXMark.vue';
import IconBell from '@/components/icons/IconBell.vue';
import IconImage from '@/components/icons/IconImage.vue';

const router = useRouter();
const userStore = useUserStore();
const authStore = useAuthStore();
const savedMessage = ref('');
/** @type {Ref<'unsupported'|NotificationPermission>} ブラウザーの通知許可状態 */
const notificationPermissionState = ref(notificationPermission());

/** ブラウザーの通知許可を要求し、表示中の状態を再取得する */
async function requestNotificationPermission() {
  notificationPermissionState.value = await ensureNotificationPermission();
}

/** 写真共有の有効化（Google OAuth 認証へリダイレクト） */
function startPhotoSharingAuth() {
  window.location.href = `${BFF_BASE_URL}/auth/photo-sharing`;
}

/** 写真共有を無効化し、保存済みの写真トークンを破棄する */
async function disablePhotoSharing() {
  const confirmed = await userStore.confirm({
    title: '写真共有を無効化',
    message: 'イベントへの写真共有機能を無効にします。作成済みのアルバムは削除されません。',
  });
  if (!confirmed) return;
  userStore.setUsePhotoSharing(false);
  authStore.clearPhotoToken();
}

const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const draft = reactive({
  theme: userStore.userSelectedTheme,
  themeColor: userStore.themeColor,
  firstDayOfWeek: userStore.firstDayOfWeek,
  useMiniCalendar: userStore.useMiniCalendar,
  useWheelMonthNavigation: userStore.useWheelMonthNavigation,
  maxEventBarsPerCell: userStore.maxEventBarsPerCell,
  calendarCellHeightMode: userStore.calendarCellHeightMode,
  uiFontFamily: userStore.uiFontFamily,
  calendarFontFamily: userStore.calendarFontFamily,
  uiTextSize: userStore.uiTextSize,
  calendarTextSize: userStore.calendarTextSize,
  labels: [...userStore.weekdayLabels],
  weekendDays: userStore.weekendDays.map((day) => ({ ...day })),
});

/** @returns {{index: number, color: string}|undefined} */
function weekend(/** @type {number} */ dayIndex) {
  return draft.weekendDays.find((day) => day.index === dayIndex);
}

function updateWeekendColor(/** @type {number} */ dayIndex, /** @type {Event} */ event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const current = weekend(dayIndex);
  if (current) current.color = target.value;
}

function toggleWeekend(/** @type {number} */ dayIndex) {
  const current = weekend(dayIndex);
  if (current) draft.weekendDays = draft.weekendDays.filter((day) => day.index !== dayIndex);
  else draft.weekendDays.push({ index: dayIndex, color: dayIndex === 0 ? '#d32f2f' : '#0a0dd6' });
}

function applyTheme() {
  userStore.applyTheme(draft.theme);
}

function save() {
  userStore.applyTheme(draft.theme);
  userStore.themeColor = draft.themeColor;
  userStore.applyThemeColor();
  userStore.setFirstDayOfWeek(Number(draft.firstDayOfWeek));
  userStore.useMiniCalendar = draft.useMiniCalendar;
  userStore.useWheelMonthNavigation = draft.useWheelMonthNavigation;
  userStore.maxEventBarsPerCell = Math.min(10, Math.max(1, Number(draft.maxEventBarsPerCell)));
  userStore.calendarCellHeightMode = draft.calendarCellHeightMode;
  userStore.uiFontFamily = draft.uiFontFamily;
  userStore.calendarFontFamily = draft.calendarFontFamily;
  userStore.applyFonts();
  userStore.uiTextSize = draft.uiTextSize;
  userStore.calendarTextSize = draft.calendarTextSize;
  userStore.applyTextSizes();
  userStore.weekendDays = draft.weekendDays.map((day) => ({ ...day }));
  userStore.setWeekdayLabels(draft.labels);
  userStore.saveSettings();
  savedMessage.value = '設定を保存しました。';
}

/** カレンダー一覧と表示中の予定を最新状態へ同期します。 */
// async function syncCalendarData() {
//   if (isSyncing.value || !authStore.isAuthenticated || userStore.isOffline) return;
//   isSyncing.value = true;
//   userStore.setLoading(true, 'Syncing calendars and events...');
//   try {
//     await eventStore.syncPendingOperations();
//     await calendarStore.loadCalendars();
//     events.value = await eventStore.syncEvents(userStore.nowUsingDate.year(), userStore.nowUsingDate.month());
//   } catch (error) {
//     userStore.setError(true, error);
//   } finally {
//     isSyncing.value = false;
//     userStore.setLoading(false);
//   }
// }

async function clearCache() {
  const confirmed = await userStore.confirm({
    title: 'キャッシュを削除',
    message: '設定以外のオフラインデータとアプリのキャッシュを削除します。続行しますか？',
  });
  if (!confirmed) return;

  try {
    await clearOfflineCache([USER_SETTINGS_KEY]);
    window.location.reload();
  } catch (error) {
    console.warn('Failed to clear offline cache.', error);
    savedMessage.value = 'キャッシュを削除できませんでした。';
  }
}

async function clearSettings() {
  const confirmed = await userStore.confirm({
    title: '設定を削除',
    message: '保存したユーザー設定を削除して初期設定に戻します。続行しますか？',
  });
  if (!confirmed) return;

  try {
    await deleteOffline(USER_SETTINGS_KEY);
    window.location.reload();
  } catch (error) {
    console.warn('Failed to clear user settings.', error);
    savedMessage.value = '設定を削除できませんでした。';
  }
}
</script>

<template>
  <section class="user-config-view">
    <MenuBar>
      <template #main>
        <h1 class="title">ユーザー設定</h1>
      </template>
      <template #sub>
        <button title="変更せず戻る" @click="router.back" class="icon-x-mark-wrapper">
          <IconXMark />
        </button>
      </template>
    </MenuBar>

    <form class="config-form" @submit.prevent="save">
      <section class="config-section">
        <h2>表示</h2>
        <label
          >テーマ
          <select v-model="draft.theme" @change="applyTheme">
            <option value="SYSTEM">システム設定に合わせる</option>
            <option value="LIGHT">ライト</option>
            <option value="DARK">ダーク</option>
          </select>
        </label>
        <label
          >テーマカラー
          <input v-model="draft.themeColor" type="color" aria-label="テーマカラー" />
        </label>
        <label class="switch-row"><input v-model="draft.useMiniCalendar" type="checkbox" />小型カレンダーを表示する</label>
        <label class="switch-row"><input v-model="draft.useWheelMonthNavigation" type="checkbox" />スクロールで月を移動する</label>
        <label
          >セルに表示する予定バーの最大本数
          <input v-model.number="draft.maxEventBarsPerCell" type="number" min="1" max="10" required />
        </label>
        <label
          >カレンダーセルの高さ
          <select v-model="draft.calendarCellHeightMode">
            <option value="FIXED">固定</option>
            <option value="VARIABLE">可変</option>
          </select>
        </label>
        <label
          >カレンダー UI のフォント
          <select v-model="draft.calendarFontFamily">
            <option v-for="(family, key) in USER_FONT_FAMILIES" :key="key" :value="key">{{ key }}</option>
          </select>
        </label>
        <label
          >その他の UI のフォント
          <select v-model="draft.uiFontFamily">
            <option v-for="(family, key) in USER_FONT_FAMILIES" :key="key" :value="key">{{ key }}</option>
          </select>
        </label>
        <label
          >カレンダー UI の文字サイズ
          <select v-model="draft.calendarTextSize">
            <option v-for="(size, key) in USER_TEXT_SIZE_VALUES" :key="key" :value="key">{{ key }}</option>
          </select>
        </label>
        <label
          >その他の UI の文字サイズ
          <select v-model="draft.uiTextSize">
            <option v-for="(size, key) in USER_TEXT_SIZE_VALUES" :key="key" :value="key">{{ key }}</option>
          </select>
        </label>
      </section>

      <section class="config-section">
        <h2>カレンダー</h2>
        <label
          >週の開始曜日
          <select v-model.number="draft.firstDayOfWeek">
            <option v-for="(day, index) in dayNames" :key="day" :value="index">{{ day }}</option>
          </select>
        </label>
      </section>

      <section class="config-section">
        <h2>休日設定</h2>
        <p class="hint">休日に指定した曜日は、カレンダー上で設定した色で表示されます。</p>
        <div class="weekend-list">
          <div v-for="(day, index) in dayNames" :key="day" class="day-row">
            <label class="switch-row"><input type="checkbox" :checked="!!weekend(index)" @change="toggleWeekend(index)" />{{ day }}</label>
            <input v-if="weekend(index)" type="color" :value="weekend(index)?.color ?? ''" :aria-label="`${day}の休日色`" @input="updateWeekendColor(index, $event)" />
            <span v-else class="not-set">休日にしない</span>
          </div>
        </div>
      </section>

      <section class="config-section">
        <h2>曜日ラベル</h2>
        <p class="hint">カレンダー上部に表示する曜日名を変更できます。</p>
        <div class="labels-grid">
          <label v-for="(day, index) in dayNames" :key="day"
            >{{ day }}
            <input v-model="draft.labels[index]" maxlength="8" required />
          </label>
        </div>
      </section>

      <section class="config-section">
        <h2>写真共有</h2>
        <p class="hint">イベントに写真の共有アルバムを紐づけます。有効化には Google アカウントでの追加認証が必要です。</p>
        <p v-if="!authStore.isAuthenticated" class="hint">利用するには Google アカウントでログインしてください。</p>
        <template v-else-if="userStore.usePhotoSharing && authStore.isPhotoSharingAuthorized">
          <p class="hint">写真共有は有効です。イベント詳細画面から写真を追加できます。</p>
          <button type="button" class="clear-cache-button" @click="disablePhotoSharing"><IconXMark />無効にする</button>
        </template>
        <template v-else>
          <p v-if="userStore.usePhotoSharing" class="hint">認証が切れています。再度認証してください。</p>
          <button type="button" class="clear-cache-button" @click="startPhotoSharingAuth"><IconImage />Google アカウントで認証して有効化</button>
        </template>
      </section>

      <section class="config-section">
        <h2>通知</h2>
        <p class="hint">予定の通知にはブラウザーの通知機能を使います。通知タイミングは予定の編集画面で設定できます。</p>
        <p v-if="notificationPermissionState === 'unsupported'" class="hint">このブラウザーは通知に対応していません。</p>
        <p v-else-if="notificationPermissionState === 'granted'" class="hint">通知は許可されています。</p>
        <p v-else-if="notificationPermissionState === 'denied'" class="hint">通知がブロックされています。ブラウザーのサイト設定から許可してください。</p>
        <button v-if="notificationPermissionState === 'default'" type="button" class="clear-cache-button" @click="requestNotificationPermission"><IconBell />通知を許可する</button>
      </section>

      <section class="config-section">
        <h2>データ管理</h2>
        <p class="hint">設定のデータを削除します。</p>
        <button type="button" class="clear-cache-button" @click="clearSettings"><IconTrash />設定を削除</button>
        <p class="hint">設定以外の全てのオフラインデータを削除します。</p>
        <button type="button" class="clear-cache-button" @click="clearCache"><IconTrash />キャッシュを削除</button>
      </section>

      <p v-if="savedMessage" class="saved">{{ savedMessage }}</p>
      <div class="actions">
        <button data-app-button="secondary" type="button" @click="router.back">キャンセル</button>
        <button data-app-button="primary" type="submit"><IconFloppyDisk />保存</button>
      </div>
    </form>
  </section>
</template>

<style lang="scss" scoped>
.title {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
}

.config-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  max-width: 720px;
  margin: 0 auto;
}

.config-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--border);
}

.config-section h2 {
  font-size: var(--text-size-lg);
}

label {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: var(--text-size-xs);
}

.switch-row {
  flex-direction: row;
  align-items: center;
  gap: var(--space-sm);
}

.hint,
.not-set {
  color: var(--text-light);
  font-size: var(--text-size-xs);
}

.weekend-list {
  display: flex;
  flex-direction: column;
}

.day-row {
  display: grid;
  grid-template-columns: 1fr 3rem;
  align-items: center;
  gap: var(--space-sm);
  min-height: 2.5rem;
  border-bottom: 1px solid var(--border);
}

.day-row input[type='color'] {
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 0;
  background: transparent;
}

.not-set {
  grid-column: 4;
}

.labels-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-sm);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}

.actions button {
  min-height: 2.25rem;
  padding: var(--space-xs) var(--space-sm);
  gap: var(--space-xs);
}

.saved {
  color: var(--primary);
  font-size: var(--text-size-sm);
}

.clear-cache-button {
  align-self: flex-start;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);

  &:hover {
    background-color: var(--bg-2);
  }
}

.icon-x-mark-wrapper {
  background-color: var(--bg-1);

  &:hover {
    background-color: var(--bg-2);
  }
}
</style>
