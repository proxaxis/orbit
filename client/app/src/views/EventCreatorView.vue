<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import MenuBar from '@/components/MenuBar.vue';
import EventForm from '@/components/EventForm.vue';
import { useCalendarStore } from '@/stores/calendar.js';
import { useEventStore } from '@/stores/event.js';

const router = useRouter();
const calendarStore = useCalendarStore();
const eventStore = useEventStore();
const loading = ref(false);
const error = ref('');
const create = async ({ body, calendarId }) => {
  loading.value = true;
  error.value = '';
  try {
    const event = await eventStore.createEvent(body, calendarId);
    router.replace({ name: 'EventDetail' });
  } catch (err) {
    error.value = err.message || '予定を作成できませんでした。';
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <section class="event-view">
    <MenuBar><template #main>
        <h1 class="title">予定を作成</h1>
      </template></MenuBar>
    <p v-if="error" class="error">{{ error }}</p>
    <EventForm :calendars="calendarStore.list" :loading="loading" @submit="create" @cancel="router.back()" />
  </section>
</template>

<style lang="scss" scoped>
.event-view {
  width: 100%;
}

.error {
  color: var(--danger);
  margin-bottom: 1rem;
}
</style>
