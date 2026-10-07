<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useUserStore } from '@/stores/user.js';
import * as gCalAPI from '@/services/google-calendar-api.js';
import MenuBar from '@/components/MenuBar.vue';
import ColorPicker from '@/components/ColorPicker.vue';
import TimezoneSelecter from '@/components/TimezoneSelecter.vue';
import CalendarRibbon from '@/components/CalendarRibbon.vue';
import IconXMark from '@/components/icons/IconXMark.vue';
import AskLoginMessage from '@/components/AskLoginMessage.vue';
import { getCalendarListColorIdByColor, getRandomCalendarListColorId } from '@/services/google-calendar-colors.js';
import AccordionMenu from '@/components/AccordionMenu.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const calendarStore = useCalendarStore();
const userStore = useUserStore();

/** @type {Ref<{listEntry: GoogleCalendarListEntry|null, calendar: GoogleCalendarResource|null}>} */
const source = ref({ listEntry: null, calendar: null });
const isSaving = ref(false);
const form = reactive({
  summary: '',
  description: '',
  location: '',
  timeZone: '',
  colorId: getRandomCalendarListColorId().colorId,
});

/** @type {ComputedRef<string|null>} 対象のカレンダー ID */
const theCalendarId = computed(() => (typeof route.query.cid === 'string' ? route.query.cid : null));
/** @type {ComputedRef<GoogleCalendarListEntry|null>} */
const storedCalendarEntry = computed(() => calendarStore.list.find((calendar) => calendar.id === theCalendarId.value) ?? null);
/** @type {ComputedRef<boolean>} カレンダーのオーナーかどうか */
const isOwner = computed(() => storedCalendarEntry.value?.accessRole === 'owner' || storedCalendarEntry.value?.primary === true);
/** @type {ComputedRef<boolean>} カレンダーを編集できる権限を持っているかどうか */
const canEditCalendar = computed(() => isOwner.value || storedCalendarEntry.value?.accessRole === 'writer');
/** @type {ComputedRef<boolean>} カレンダー自体を削除できるかどうか */
const canDeleteCalendar = computed(() => isOwner.value && storedCalendarEntry.value?.primary !== true);
/** @type {ComputedRef<boolean>} カレンダーリストから削除できるかどうか */
const canRemoveFromCalendarList = computed(() => storedCalendarEntry.value?.primary !== true);

/** @returns {string|null} フォームに入力されたカレンダー名の有効性をチェックする */
function checkInputSummary() {
  if (!form.summary.trim()) {
    return 'The calendar name is not specified. Please enter a name for the calendar.';
  }
  return null;
}

async function save() {
  if (!theCalendarId.value || !authStore.isAuthenticated) return;
  if (checkInputSummary() !== null) return;

  isSaving.value = true;
  userStore.setLoading(true, 'Saving the calendar settings...');
  try {
    // カレンダーリストエントリの更新
    const newListEntry = await gCalAPI.patchCalendarListEntry(authStore.token, theCalendarId.value, {
      colorId: form.colorId,
      ...(!isOwner.value ? { summaryOverride: form.summary.trim() } : {}),
    });

    // カレンダーの更新
    let newCalendar = source.value.calendar;
    if (canEditCalendar.value) {
      newCalendar = await gCalAPI.patchCalendar(authStore.token, theCalendarId.value, {
        summary: form.summary.trim(),
        description: form.description.trim(),
        location: form.location.trim(),
        timeZone: form.timeZone,
      });
    }
    source.value.calendar = newCalendar;
    const currentEntry = source.value.listEntry ?? storedCalendarEntry.value;
    if (!currentEntry) throw new Error('The selected calendar could not be found.');
    calendarStore.updateCalendar({
      ...currentEntry,
      ...(newListEntry ?? {}),
      id: theCalendarId.value,
      summary: isOwner.value ? form.summary.trim() : (newListEntry?.summaryOverride ?? form.summary.trim()),
      ...(isOwner.value ? { summaryOverride: undefined } : { summaryOverride: form.summary.trim() }),
      colorId: newListEntry?.colorId ?? form.colorId,
      backgroundColor: newListEntry?.backgroundColor,
      foregroundColor: newListEntry?.foregroundColor,
    });
  } catch (err) {
    userStore.setError(true, err);
  } finally {
    isSaving.value = false;
    userStore.setLoading(false);
  }
}

/** カレンダー自体、または自分のカレンダーリストから対象を削除します。 */
async function removeCalendar() {
  if (!theCalendarId.value || !authStore.isAuthenticated || (!canDeleteCalendar.value && !canRemoveFromCalendarList.value)) return;

  const deleteCalendarItself = canDeleteCalendar.value;
  const message = deleteCalendarItself ? 'このカレンダー自体を削除します。予定や共有設定も利用できなくなります。実行しますか？' : 'このカレンダーを自分のカレンダーリストから削除しますか？';
  const confirmed = await userStore.confirm({
    title: deleteCalendarItself ? 'カレンダーを削除' : 'カレンダーリストから削除',
    message,
  });
  if (!confirmed) return;

  isSaving.value = true;
  userStore.setLoading(true, deleteCalendarItself ? 'Deleting the calendar...' : 'Removing the calendar from your list...');
  try {
    if (deleteCalendarItself) await gCalAPI.deleteCalendar(authStore.token, theCalendarId.value);
    else await gCalAPI.deleteCalendarListEntry(authStore.token, theCalendarId.value);
    calendarStore.removeCalendar(theCalendarId.value);
    await router.push({ name: 'Home' });
  } catch (err) {
    userStore.setError(true, err);
  } finally {
    isSaving.value = false;
    userStore.setLoading(false);
  }
}

watch(
  [theCalendarId, () => authStore.isAuthenticated],
  async () => {
    source.value = { listEntry: null, calendar: null };
    if (!theCalendarId.value || typeof theCalendarId.value !== 'string' || !authStore.isAuthenticated) return;

    userStore.setLoading(true, 'Loading the calendar...');
    try {
      source.value.listEntry = await gCalAPI.getCalendarListEntry(authStore.token, theCalendarId.value);
      source.value.calendar = await gCalAPI.getCalendar(authStore.token, theCalendarId.value);
      if (!source.value.listEntry) source.value.listEntry = storedCalendarEntry.value;
      Object.assign(form, {
        summary: source.value?.listEntry?.summaryOverride ?? source.value?.calendar?.summary ?? source.value?.listEntry?.summary ?? '',
        description: source.value?.calendar?.description ?? source.value?.listEntry?.description ?? '',
        location: source.value?.calendar?.location ?? source.value?.listEntry?.location ?? '',
        timeZone: source.value?.calendar?.timeZone ?? source.value?.listEntry?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
        colorId: source.value?.listEntry?.colorId ?? getCalendarListColorIdByColor(source.value?.listEntry?.backgroundColor ?? '') ?? '1',
      });
    } catch (err) {
      userStore.setError(true, err);
    } finally {
      userStore.setLoading(false);
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="calendar-detail-view">
    <MenuBar>
      <template #main>
        <h1 class="title">カレンダー設定</h1>
      </template>
      <template #sub>
        <button title="変更せずに戻る" @click="router.back" class="icon-x-mark-wrapper">
          <IconXMark />
        </button>
      </template>

      カレンダーの表示に関する設定
    </MenuBar>

    <AskLoginMessage v-if="!authStore.isAuthenticated"> カレンダーの表示設定を変更するには Google アカウントでログインする必要があります </AskLoginMessage>

    <section v-if="authStore.isAuthenticated">
      <div v-if="source.listEntry || source.calendar" class="section-heading">
        <span>設定対象のカレンダー:</span>
        <CalendarRibbon v-if="theCalendarId" :cid="theCalendarId" />
        <p v-else>カレンダーが選択されていません</p>
      </div>

      <form @submit.prevent="save">
        <div class="form-heading">
          <h2>基本情報</h2>
          <span v-if="!canEditCalendar">読み取り専用</span>
        </div>

        <label>
          カレンダー名称
          <input v-model="form.summary" required maxlength="100" />
          <p v-if="!canEditCalendar">変更した名前は自分のカレンダーだけに表示されます</p>
        </label>
        <label>
          説明
          <textarea v-model="form.description" rows="4" maxlength="500" :readonly="!canEditCalendar"></textarea>
          <p v-if="!canEditCalendar">変更できません</p>
        </label>
        <label>
          場所
          <input v-model="form.location" maxlength="255" :readonly="!canEditCalendar" />
          <p v-if="!canEditCalendar">変更できません</p>
        </label>
        <label>
          デフォルトタイムゾーン
          <TimezoneSelecter v-if="canEditCalendar" v-model="form.timeZone" />
          <input v-else :value="form.timeZone" readonly />
          <p v-if="!canEditCalendar">変更できません</p>
        </label>

        <div class="form-heading">
          <h2>表示設定</h2>
          <span>自分のカレンダーのみ変更</span>
        </div>

        <label>
          色
          <ColorPicker v-model="form.colorId" />
        </label>
        <div class="actions">
          <button data-app-button="secondary" type="button" @click="router.back">キャンセル</button>
          <button data-app-button="primary" type="submit" :disabled="userStore.isLoading">保存</button>
        </div>
        <AccordionMenu>
          <template #summary>
            <span>その他のアクション</span>
          </template>
          <div class="actions">
            <button v-if="canDeleteCalendar" type="button" class="danger-button" :disabled="userStore.isLoading" @click="removeCalendar">カレンダーを削除</button>
            <button v-else-if="canRemoveFromCalendarList" type="button" class="danger-button" :disabled="userStore.isLoading" @click="removeCalendar">リストから削除</button>
          </div>
        </AccordionMenu>
      </form>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.section-heading {
  display: flex;
  flex-direction: column;

  span {
    font-size: var(--text-size-sm);
    color: var(--text-light);
  }
}

form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.form-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
  margin-top: var(--space-md);

  h2 {
    font-size: var(--text-size-md);
  }

  span {
    font-size: var(--text-size-sm);
    color: var(--text-light);
  }
}

label {
  display: flex;
  flex-direction: column;
  font-size: var(--text-size-xs);

  textarea {
    resize: vertical;
  }

  p {
    font-size: var(--text-size-xs);
    color: var(--text-light);
  }
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
}

details div {
  margin-top: var(--space-sm);
  display: flex;
  justify-content: flex-end;

  button {
    background-color: var(--danger);
  }
}
.icon-x-mark-wrapper {
  background-color: var(--bg-1);
  &:hover {
    background-color: var(--bg-2);
  }
}
</style>
