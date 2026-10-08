<script setup>
import { reactive } from 'vue';
import { useRouter } from 'vue-router';
import { USER_FONT_FAMILIES, USER_TEXT_SIZE_VALUES, useUserStore } from '@/stores/user.js';
import { useTheme } from '@/composables/useTheme.js';
import MenuBar from '@/components/MenuBar.vue';
import IconFloppyDisk from '@/components/icons/IconFloppyDisk.vue';
import IconXMark from '@/components/icons/IconXMark.vue';
import UserConfigViewAccountSection from '@/components/items/UserConfigViewAccountSection.vue';
import UserConfigViewPhotoSharingSection from '@/components/items/UserConfigViewPhotoSharingSection.vue';
import UserConfigViewNotificationSection from '@/components/items/UserConfigViewNotificationSection.vue';
import UserConfigViewDataSection from '@/components/items/UserConfigViewDataSection.vue';

const router = useRouter();
const userStore = useUserStore();
const theme = useTheme();

const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const draft = reactive({
  theme: userStore.userSelectedTheme,
  themeColor: userStore.themeColor,
  firstDayOfWeek: userStore.firstDayOfWeek,
  useMiniCalendar: userStore.useMiniCalendar,
  useWheelMonthNavigation: userStore.useWheelMonthNavigation,
  maxEventBarsPerCell: userStore.maxEventBarsPerCell,
  calendarCellHeightMode: userStore.calendarCellHeightMode,
  allDayEventBarStyle: userStore.allDayEventBarStyle,
  timedEventBarStyle: userStore.timedEventBarStyle,
  uiFontFamily: userStore.uiFontFamily,
  calendarFontFamily: userStore.calendarFontFamily,
  uiTextSize: userStore.uiTextSize,
  calendarTextSize: userStore.calendarTextSize,
  labels: [...userStore.weekdayLabels],
  weekendDays: userStore.weekendDays.map((day) => ({ ...day })),
  customHolidayColor: userStore.customHolidayColor,
  holidayColor: userStore.holidayColor,
});

/** @returns {{index: number, color: string}|undefined} */
function weekend(/** @type {number} */ dayIndex) {
  return draft.weekendDays.find((day) => day.index === dayIndex);
}

/** @param {number} dayIndex 曜日番号 @param {Event} event 色変更イベント */
function updateWeekendColor(/** @type {number} */ dayIndex, /** @type {Event} */ event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const current = weekend(dayIndex);
  if (current) current.color = target.value;
}

/** @param {number} dayIndex 週末扱いにする曜日の切り替え */
function toggleWeekend(/** @type {number} */ dayIndex) {
  const current = weekend(dayIndex);
  if (current) draft.weekendDays = draft.weekendDays.filter((day) => day.index !== dayIndex);
  else draft.weekendDays.push({ index: dayIndex, color: dayIndex === 0 ? '#d32f2f' : '#0a0dd6' });
}

/** 入力中のテーマ設定を即時プレビュー反映する */
function applyTheme() {
  theme.applyTheme(draft.theme);
}

/** 設定を保存してホームへ戻る */
function save() {
  theme.applyTheme(draft.theme);
  userStore.themeColor = draft.themeColor;
  theme.applyThemeColor();
  userStore.setFirstDayOfWeek(Number(draft.firstDayOfWeek));
  userStore.useMiniCalendar = draft.useMiniCalendar;
  userStore.useWheelMonthNavigation = draft.useWheelMonthNavigation;
  userStore.maxEventBarsPerCell = Math.min(10, Math.max(1, Number(draft.maxEventBarsPerCell)));
  userStore.calendarCellHeightMode = draft.calendarCellHeightMode;
  userStore.allDayEventBarStyle = draft.allDayEventBarStyle;
  userStore.timedEventBarStyle = draft.timedEventBarStyle;
  userStore.uiFontFamily = draft.uiFontFamily;
  userStore.calendarFontFamily = draft.calendarFontFamily;
  theme.applyFonts();
  userStore.uiTextSize = draft.uiTextSize;
  userStore.calendarTextSize = draft.calendarTextSize;
  theme.applyTextSizes();
  userStore.weekendDays = draft.weekendDays.map((day) => ({ ...day }));
  userStore.customHolidayColor = draft.customHolidayColor;
  userStore.holidayColor = draft.holidayColor;
  userStore.setWeekdayLabels(draft.labels);
  userStore.saveSettings();
  userStore.showToast('設定を保存しました。');
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
      <UserConfigViewAccountSection />

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
          >終日の予定バー
          <select v-model="draft.allDayEventBarStyle">
            <option value="FILL">背景を塗りつぶす</option>
            <option value="DOT">ドット表示</option>
          </select>
        </label>
        <label
          >時間指定の予定バー
          <select v-model="draft.timedEventBarStyle">
            <option value="FILL">背景を塗りつぶす</option>
            <option value="DOT">ドット表示</option>
          </select>
        </label>
        <label
          >カレンダーのフォント
          <select v-model="draft.calendarFontFamily">
            <option v-for="(family, key) in USER_FONT_FAMILIES" :key="key" :value="key">{{ key }}</option>
          </select>
        </label>
        <label
          >その他のフォント
          <select v-model="draft.uiFontFamily">
            <option v-for="(family, key) in USER_FONT_FAMILIES" :key="key" :value="key">{{ key }}</option>
          </select>
        </label>
        <label
          >カレンダーの文字サイズ
          <select v-model="draft.calendarTextSize">
            <option v-for="(size, key) in USER_TEXT_SIZE_VALUES" :key="key" :value="key">{{ key }}</option>
          </select>
        </label>
        <label
          >その他の文字サイズ
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
        <p class="hint">休日に指定した曜日は、カレンダー上で設定した色で表示されます.</p>
        <div class="weekend-list">
          <div v-for="(day, index) in dayNames" :key="day" class="day-row">
            <label class="switch-row"><input type="checkbox" :checked="!!weekend(index)" @change="toggleWeekend(index)" />{{ day }}</label>
            <input v-if="weekend(index)" type="color" :value="weekend(index)?.color ?? ''" :aria-label="`${day}の休日色`" @input="updateWeekendColor(index, $event)" />
            <span v-else class="not-set">休日にしない</span>
          </div>
        </div>
        <label class="custom-holiday-color">
          祝日の色
          <input v-model="draft.holidayColor" type="color" aria-label="祝日の色" />
        </label>
        <p class="hint">日本の祝日の日付は、この色で日付が表示されます.</p>
        <label class="custom-holiday-color">
          カスタム休日の色
          <input v-model="draft.customHolidayColor" type="color" aria-label="カスタム休日の色" />
        </label>
        <p class="hint">日付セルの右クリックメニューから「この日を休日にする」で登録した日は、この色で日付が表示されます.</p>
      </section>

      <section class="config-section">
        <h2>曜日ラベル</h2>
        <p class="hint">カレンダー上部に表示する曜日名を変更できます.</p>
        <div class="labels-grid">
          <label v-for="(day, index) in dayNames" :key="day"
            >{{ day }}
            <input v-model="draft.labels[index]" maxlength="8" required />
          </label>
        </div>
      </section>

      <UserConfigViewPhotoSharingSection />

      <UserConfigViewNotificationSection />

      <UserConfigViewDataSection />

      <div class="actions">
        <button data-app-button="secondary" type="button" @click="router.push({ name: 'Home' })">キャンセル</button>
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

.custom-holiday-color {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;

  input[type='color'] {
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 0;
    background: transparent;
  }
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

.icon-x-mark-wrapper {
  background-color: var(--bg-1);

  &:hover {
    background-color: var(--bg-2);
  }
}
</style>
