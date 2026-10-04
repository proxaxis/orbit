<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import MenuBar from '@/components/MenuBar.vue';
import EventForm from '@/components/EventForm.vue';
import { useEventStore } from '@/stores/event.js';
import { useUserStore } from '@/stores/user.js';
import IconXMark from '@/components/icons/IconXMark.vue';
import { usePeopleStore } from '@/stores/people.js';

const router = useRouter();
const eventStore = useEventStore();
const userStore = useUserStore();
const peopleStore = usePeopleStore();

/** @type {Ref<HandyCalendarEvent|null>} */
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

/** @param {{ body: Record<string, unknown>, peopleToCreate?: string[] }} payload */
async function update(payload) {
  const { body, peopleToCreate = [] } = payload;
  try {
    if (!userStore.nowSelectedEvent) throw new Error('You do not have an event selected. You must select an event to update it.');
    userStore.setLoading(true, 'Updating the event...');
    await eventStore.updateEvent(userStore.nowSelectedEvent.eid, userStore.nowSelectedEvent.cid, body);
    if (peopleToCreate.length) {
      peopleStore.setPendingRegistrationEmails(peopleToCreate);
      router.replace({ name: 'PeopleEditor' });
    } else router.replace({ name: 'EventDetail' });
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
            <IconXMark size="1.2rem" />
          </button>
        </div>
      </template>
    </MenuBar>
    <EventForm submit-label="Update" @submit="update" @cancel="router.back()" />
  </section>
</template>

<style lang="scss" scoped>
.icon-x-mark {
  padding: var(--space-xs);

  &:hover {
    background-color: var(--bg-2);
    border-radius: 50%;
  }
}
</style>
