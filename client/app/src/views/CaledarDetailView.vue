<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import * as gCalAPI from '@/services/google-calendar-api.js';
import MenuBar from '@/components/MenuBar.vue';
import ColorPicker from '@/components/ColorPicker.vue';
import TimezoneSelecter from '@/components/TimezoneSelecter.vue';
import CalendarRibbon from '@/components/CalendarRibbon.vue';
import IconXMark from '@/components/icons/IconXMark.vue';
import IconFloppyDisk from '@/components/icons/IconFloppyDisk.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const calendarStore = useCalendarStore();

const isLoading = ref(false);
const isSaving = ref(false);
const errorMessage = ref('');
const savedMessage = ref('');
const calendarData = ref(null);
const form = reactive({
  summary: '',
  description: '',
  location: '',
  timeZone: '',
  color: '#54a0ff',
});

const calendarId = computed(() => typeof route.query.calendarId === 'string' ? route.query.calendarId : '');
const calendarEntry = computed(() => calendarStore.list.find((calendar) => calendar.id === calendarId.value));
const isOwner = computed(() => calendarEntry.value?.accessRole === 'owner' || calendarEntry.value?.primary === true);
const canEditCalendar = computed(() => isOwner.value || calendarEntry.value?.accessRole === 'writer');
const hasToken = computed(() => !!authStore.token);

function setFormValues(calendar, entry) {
  Object.assign(form, {
    summary: entry?.summaryOverride || calendar?.summary || entry?.summary || '',
    description: calendar?.description || entry?.description || '',
    location: calendar?.location || entry?.location || '',
    timeZone: calendar?.timeZone || entry?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    color: entry?.backgroundColor || '#54a0ff',
  });
}

async function loadCalendar() {
  errorMessage.value = '';
  savedMessage.value = '';
  calendarData.value = null;
  if (!calendarId.value || !hasToken.value) return;

  isLoading.value = true;
  try {
    const [calendar, entry] = await Promise.all([
      gCalAPI.getCalendar(authStore.token, calendarId.value),
      gCalAPI.getCalendarListEntry(authStore.token, calendarId.value),
    ]);
    calendarData.value = calendar;
    setFormValues(calendar, entry || calendarEntry.value);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
    setFormValues(calendarData.value, calendarEntry.value);
  } finally {
    isLoading.value = false;
  }
}

async function save() {
  errorMessage.value = '';
  savedMessage.value = '';
  if (!calendarId.value || !hasToken.value) return;
  if (!form.summary.trim()) {
    errorMessage.value = 'カレンダー名を入力してください。';
    return;
  }

  isSaving.value = true;
  try {
    const listBody = {
      backgroundColor: form.color,
      foregroundColor: '#000000',
      ...(!isOwner.value ? { summaryOverride: form.summary.trim() } : {}),
    };
    const updatedEntry = await gCalAPI.patchCalendarListEntry(authStore.token, calendarId.value, listBody);
    let updatedCalendar = calendarData.value;
    if (canEditCalendar.value) {
      updatedCalendar = await gCalAPI.patchCalendar(authStore.token, calendarId.value, {
        summary: form.summary.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        timeZone: form.timeZone,
      });
    }
    calendarData.value = updatedCalendar || calendarData.value;
    calendarStore.updateCalendar({
      ...(calendarEntry.value || {}),
      ...(updatedEntry || {}),
      ...(updatedCalendar || {}),
      id: calendarId.value,
      summary: isOwner.value ? form.summary.trim() : (updatedEntry?.summaryOverride || form.summary.trim()),
      summaryOverride: isOwner.value ? undefined : form.summary.trim(),
      backgroundColor: form.color,
      foregroundColor: '#000000',
    });
    savedMessage.value = '設定を保存しました。';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isSaving.value = false;
  }
}

watch([calendarId, () => authStore.token], loadCalendar, { immediate: true });
onMounted(() => {
  if (!calendarId.value) errorMessage.value = '設定するカレンダーが選択されていません。';
});
</script>

<template>
  <section class="calendar-detail-view">
    <MenuBar>
      <template #main>
        <h1 class="title">カレンダーの詳細</h1>
      </template>
      <template #sub>
        <button title="戻る" @click="router.push({ name: 'Home' })">
          <IconXMark />戻る
        </button>
      </template>
    </MenuBar>

    <div class="content">
      <div v-if="calendarEntry" class="heading">
        <CalendarRibbon :gCalendarId="calendarId" />
        <div>
          <h2>{{ calendarEntry.summary }}</h2>
          <p>{{ isOwner ? 'このカレンダーの共有元設定' : 'あなたのカレンダー一覧での表示設定' }}</p>
        </div>
      </div>
      <p v-if="!hasToken" class="empty-state">設定を変更するには Google アカウントでログインしてください。</p>
      <p v-else-if="isLoading" class="empty-state">カレンダー情報を読み込んでいます...</p>
      <p v-else-if="errorMessage && !calendarEntry" class="error">{{ errorMessage }}</p>
      <form v-else class="detail-form" @submit.prevent="save">
        <div class="section-heading">
          <h2>基本情報</h2><span v-if="!canEditCalendar">共有元の情報は読み取り専用です</span>
        </div>
        <label>カレンダー名
          <input v-model="form.summary" required maxlength="100" :readonly="!canEditCalendar" />
          <small v-if="!canEditCalendar">変更した名前は自分のカレンダー一覧だけに表示されます。</small>
        </label>
        <label>説明 <textarea v-model="form.description" rows="4" maxlength="500"
            :readonly="!canEditCalendar"></textarea></label>
        <label>場所 <input v-model="form.location" maxlength="255" :readonly="!canEditCalendar" /></label>
        <label>デフォルトタイムゾーン
          <TimezoneSelecter v-if="canEditCalendar" v-model="form.timeZone" />
          <input v-else :value="form.timeZone" readonly />
        </label>
        <div class="section-heading">
          <h2>表示設定</h2><span>この端末のカレンダー一覧に適用</span>
        </div>
        <label>色
          <ColorPicker v-model="form.color" />
        </label>
        <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
        <p v-if="savedMessage" class="saved">{{ savedMessage }}</p>
        <div class="actions">
          <button type="button" @click="router.push({ name: 'Home' })">キャンセル</button>
          <button data-app-button="primary" type="submit" :disabled="isSaving || isLoading">
            <IconFloppyDisk />{{ isSaving ? '保存中...' : '保存' }}
          </button>
        </div>
      </form>
    </div>
  </section>
</template>

<style lang="scss" scoped>
.calendar-detail-view {
  width: 100%;
  padding: var(--space-md);
}

.content {
  max-width: 720px;
  margin: 0 auto;
}

.heading {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-xl);
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--border);
}

.heading h2 {
  font-size: var(--text-size-lg);
}

.heading p,
small,
.section-heading span {
  color: var(--text-light);
  font-size: var(--text-size-xs);
}

.detail-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

label {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: var(--text-size-xs);
}

textarea {
  resize: vertical;
}

input[readonly],
textarea[readonly] {
  opacity: 0.7;
  cursor: not-allowed;
}

.section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-sm);
  padding-top: var(--space-sm);
  border-bottom: 1px solid var(--border);
}

.section-heading h2 {
  font-size: var(--text-size-md);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  padding-top: var(--space-sm);
}

.actions button {
  min-height: 2.25rem;
  padding: var(--space-xs) var(--space-sm);
  gap: var(--space-xs);
}

.error {
  color: var(--danger);
  font-size: var(--text-size-sm);
}

.saved {
  color: var(--primary);
  font-size: var(--text-size-sm);
}

.empty-state {
  padding: var(--space-xl) 0;
  color: var(--text-light);
  text-align: center;
}

@media (max-width: 720px) {
  .calendar-detail-view {
    padding: var(--space-sm);
  }
}
</style>
