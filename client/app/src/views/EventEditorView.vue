<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import MenuBar from '@/components/MenuBar.vue';
import EventForm from '@/components/EventForm.vue';
import { useEventStore } from '@/stores/event.js';
import { useUserStore } from '@/stores/user.js';
import IconXMark from '@/components/icons/IconXMark.vue';

const router = useRouter();
const eventStore = useEventStore();
const userStore = useUserStore();

/** @type {Ref<(GoogleEvent & { sourceCalendarId: string })|null>} */
const event = ref(null);

onMounted(async () => {
  try {
    if (!userStore.nowSelectedEvent) throw new Error('You do not have an event selected. You must select an event to edit it.');
    userStore.setLoading(true, 'Loading the event...');
    const result = await eventStore.getEventById(userStore.nowSelectedEvent.eid, userStore.nowSelectedEvent.cid);
    if (!result) throw new Error('The event could not be found. Go back to the calendar and select a different event.');
    event.value = result;
  } catch (err) {
    userStore.setError(true, err);
  } finally {
    userStore.setLoading(false);
  }
});

/** @param {{ body: Record<string, unknown> }} payload */
async function update(payload) {
  const { body } = payload;
  try {
    if (!userStore.nowSelectedEvent) throw new Error('You do not have an event selected. You must select an event to update it.');
    userStore.setLoading(true, 'Updating the event...');
    await eventStore.updateEvent(userStore.nowSelectedEvent.eid, userStore.nowSelectedEvent.cid, body);
    router.replace({ name: 'EventDetail' });
  } catch (err) {
    userStore.setError(true, err);
  } finally {
    userStore.setLoading(false);
  }
};
</script>

<template>
  <section class="event-view">
    <MenuBar>
      <template #main>
        <h1 class="title">Edit Event</h1>
      </template>
      <template #sub>
        <div class="menu-bar-actions">
          <button title="Don't save and close" @click="router.push({ name: 'Home' })">
            <IconXMark size="1.2rem" />Close
          </button>
        </div>
      </template>
    </MenuBar>
    <EventForm submit-label="Update" @submit="update" @cancel="router.back()" />
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
