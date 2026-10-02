<script setup>
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import MenuBar from '@/components/MenuBar.vue';
import EventForm from '@/components/EventForm.vue';
import { useCalendarStore } from '@/stores/calendar.js';
import { useEventStore } from '@/stores/event.js';

const route = useRoute();
const router = useRouter();
const calendarStore = useCalendarStore();
const eventStore = useEventStore();
const event = ref(null);
const calendar = ref(null);
const loading = ref(true);
const saving = ref(false);
const error = ref('');

onMounted(async () => {
  try {
    const result = await eventStore.findEvent(route.params.id);
    if (!result) throw new Error('予定が見つかりません。');
    event.value = { ...result.event, calendarId: result.calendar.id };
    calendar.value = result.calendar;
  } catch (err) {
    error.value = err.message || '予定を読み込めませんでした。';
  } finally {
    loading.value = false;
  }
});

const update = async ({ body, calendarId }) => {
  saving.value = true;
  error.value = '';
  try {
    await eventStore.updateEvent(route.params.id, body, calendarId || calendar.value?.id);
    router.replace({ name: 'EventDetail', params: { id: route.params.id } });
  } catch (err) {
    error.value = err.message || '予定を更新できませんでした。';
  } finally {
    saving.value = false;
  }
};
</script>

<template>
  <section class="event-view">
    <MenuBar><template #main>
        <h1 class="title">予定を編集</h1>
      </template></MenuBar>
    <p v-if="loading">読み込み中...</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <EventForm v-else :initial-event="event" :calendars="calendarStore.list" :loading="saving" submit-label="更新"
      @submit="update" @cancel="router.back()" />
  </section>
</template>

<style lang="scss" scoped>
.event-view {
  width: 100%;
}

.error {
  color: var(--danger);
}
</style>
