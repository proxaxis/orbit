<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user.js';
import MenuBar from '@/components/MenuBar.vue';
import IconGear from '@/components/icons/IconGear.vue';
import IconFloppyDisk from '@/components/icons/IconFloppyDisk.vue';
import IconXMark from '@/components/icons/IconXMark.vue';

const router = useRouter();
const userStore = useUserStore();
const savedMessage = ref('');

const dayNames = ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'];
const draft = reactive({
  theme: userStore.userSelectedTheme,
  firstDayOfWeek: userStore.firstDayOfWeek,
  useMiniCalendar: userStore.useMiniCalendar,
  useWheelMonthNavigation: userStore.useWheelMonthNavigation,
  labels: [...userStore.weekdayLabels],
  weekendDays: userStore.weekendDays.map((day) => ({ ...day })),
});

function weekend(dayIndex) {
  return draft.weekendDays.find((day) => day.index === dayIndex);
}

function toggleWeekend(dayIndex) {
  const current = weekend(dayIndex);
  if (current) draft.weekendDays = draft.weekendDays.filter((day) => day.index !== dayIndex);
  else draft.weekendDays.push({ index: dayIndex, color: dayIndex === 0 ? '#d32f2f' : '#0a0dd6' });
}

function applyTheme() {
  userStore.applyTheme(draft.theme);
}

function save() {
  userStore.applyTheme(draft.theme);
  userStore.setFirstDayOfWeek(Number(draft.firstDayOfWeek));
  userStore.useMiniCalendar = draft.useMiniCalendar;
  userStore.useWheelMonthNavigation = draft.useWheelMonthNavigation;
  userStore.weekendDays = draft.weekendDays.map((day) => ({ ...day }));
  userStore.setWeekdayLabels(draft.labels);
  userStore.saveSettings();
  savedMessage.value = '設定を保存しました。';
}
</script>

<template>
  <section class="user-config-view">
    <MenuBar>
      <template #main>
        <h1 class="title">
          <IconGear />ユーザー設定
        </h1>
      </template>
      <template #sub><button title="戻る" @click="router.push({ name: 'Home' })">
          <IconXMark />戻る
        </button></template>
    </MenuBar>

    <form class="config-form" @submit.prevent="save">
      <section class="config-section">
        <h2>表示</h2>
        <label>テーマ
          <select v-model="draft.theme" @change="applyTheme">
            <option value="SYSTEM">システム設定に合わせる</option>
            <option value="LIGHT">ライト</option>
            <option value="DARK">ダーク</option>
          </select>
        </label>
        <label class="switch-row"><input v-model="draft.useMiniCalendar" type="checkbox" />小型カレンダーを表示する</label>
        <label class="switch-row"><input v-model="draft.useWheelMonthNavigation" type="checkbox" />スクロールで月を移動する</label>
      </section>

      <section class="config-section">
        <h2>カレンダー</h2>
        <label>週の開始曜日
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
            <label class="switch-row"><input type="checkbox" :checked="!!weekend(index)"
                @change="toggleWeekend(index)" />{{
                  day }}</label>
            <input v-if="weekend(index)" type="color" :value="weekend(index).color" :aria-label="`${day}の休日色`"
              @input="weekend(index).color = $event.target.value" />
            <span v-else class="not-set">休日にしない</span>
          </div>
        </div>
      </section>

      <section class="config-section">
        <h2>曜日ラベル</h2>
        <p class="hint">カレンダー上部に表示する曜日名を変更できます。</p>
        <div class="labels-grid">
          <label v-for="(day, index) in dayNames" :key="day">{{ day }}
            <input v-model="draft.labels[index]" maxlength="8" required />
          </label>
        </div>
      </section>

      <p v-if="savedMessage" class="saved">{{ savedMessage }}</p>
      <div class="actions">
        <button type="button" @click="router.push({ name: 'Home' })">キャンセル</button>
        <button data-app-button="primary" type="submit">
          <IconFloppyDisk />保存
        </button>
      </div>
    </form>
  </section>
</template>

<style lang="scss" scoped>
.user-config-view {
  width: 100%;
  padding: var(--space-md);
}

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
  grid-column: 2;
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

@media (max-width: 600px) {
  .user-config-view {
    padding: var(--space-sm);
  }

  .labels-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
