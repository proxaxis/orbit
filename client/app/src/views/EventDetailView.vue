<script setup>
import { computed, onMounted, ref } from 'vue';
import dayjs from 'dayjs';
import { useRoute, useRouter } from 'vue-router';
import { useEventStore } from '@/stores/event.js';
import MenuBar from '@/components/MenuBar.vue';
import CalendarRibbon from '@/components/CalendarRibbon.vue';
import IconPen from '@/components/icons/IconPen.vue';
import IconTrash from '@/components/icons/IconTrash.vue';
import IconLocationDot from '@/components/icons/IconLocationDot.vue';
import IconXMark from '@/components/icons/IconXMark.vue';
import { useUserStore } from '@/stores/user.js';
import IconClock from '@/components/icons/IconClock.vue';
import IconAlignLeft from '@/components/icons/IconAlignLeft.vue';

const route = useRoute();
const router = useRouter();
const eventStore = useEventStore();
const userStore = useUserStore();

/** @type {Ref<(GoogleEvent & { sourceCalendarId: string })|null>} */
const event = ref(null);

/** @param {GoogleEvent|null} value @returns {string} */
function getEventIcon(value) {
  const shared = /** @type {Record<string, string>|undefined} */ (value?.extendedProperties?.shared);
  return shared?.icon ?? '📅';
}

const dateText = computed(() => {
  if (!event.value) return '';
  if (event.value.start.date) return `${event.value.start.date} - ${dayjs(event.value.end.date).subtract(1, 'day').format('YYYY-MM-DD')}`;
  return `${dayjs(event.value.start.dateTime).format('YYYY-MM-DD HH:mm')} - ${dayjs(event.value.end.dateTime).format('YYYY-MM-DD HH:mm')}`;
});

function edit() {
  router.push({ name: 'EventEditor' });
}

async function remove() {
  if (!event.value) throw new Error('You do not have an event selected. You must select an event to remove it.');
  if (!await userStore.confirm({ title: 'Remove Event', message: 'Are you sure you want to remove this event?' })) return;
  userStore.setLoading(true, 'Removing the event...');
  try {
    const res = await eventStore.removeEvent(event.value.id, event.value.sourceCalendarId);
    if (!res) throw new Error('Failed to remove the event.');
    router.replace({ name: 'Home' });
  } catch (err) {
    userStore.setError(true, err);
  } finally {
    userStore.setLoading(false);
  }
}

onMounted(async () => {
  userStore.setLoading(true, 'Loading the event...');
  try {
    if (!userStore.nowSelectedEvent) throw new Error('You do not have an event selected. You must select an event to view its details.');
    const result = await eventStore.getEventById(userStore.nowSelectedEvent.eid, userStore.nowSelectedEvent.cid);
    if (!result) throw new Error('The event could not be found. Go back to the calendar and select a different event.');
    event.value = result;
  } catch (err) {
    userStore.setError(true, err);
  } finally {
    userStore.setLoading(false);
  }
});
</script>

<template>
  <section class="event-view">
    <MenuBar>
      <template #main>
        <h1 class="title">Event Details</h1>
      </template>
      <template #sub>
        <div class="menu-bar-actions">
          <button title="Delete" :disabled="!event" @click="remove">
            <IconTrash />Delete
          </button>
          <button title="Edit" :disabled="!event" @click="edit">
            <IconPen size="1.1rem" />Edit
          </button>
          <button title="Back" @click="router.push({ name: 'Home' })">
            <IconXMark size="1.2rem" />Back
          </button>
        </div>
      </template>
    </MenuBar>

    <article v-if="!!event">
      <div class="heading">
        <h2>{{ getEventIcon(event) }}{{ event?.summary ?? '予定' }}</h2>
        <div class="calendar-ribbon-wrapper">
          <CalendarRibbon :gCalendarId="event?.sourceCalendarId ?? ''" />
        </div>
      </div>
      <dl>
        <div>
          <dt>
            <IconClock />
          </dt>
          <dd>{{ dateText }}<span v-if="event?.start?.timeZone"> ({{ event.start.timeZone }})</span></dd>
        </div>
        <div v-if="event?.location">
          <dt>
            <IconLocationDot />
          </dt>
          <dd>{{ event?.location }}</dd>
        </div>
        <div v-if="event?.description">
          <dt>
            <IconAlignLeft />
          </dt>
          <dd>{{ event.description }}</dd>
        </div>
      </dl>
      <details>
        <summary>More Information</summary>
        <ul>
          <li>Status: <span class="inline-text">{{ event?.status ?? 'Unavailable' }}</span></li>
          <li>Google Calendar URL: <span class="inline-text">{{ event?.htmlLink ?? 'Unavailable' }}</span></li>
          <li>Created: <span class="inline-text">{{ event?.created ?? 'Unavailable' }}</span></li>
          <li>Updated: <span class="inline-text">{{ event?.updated ?? 'Unavailable' }}</span></li>
          <li>Creator ID: <span class="inline-text">{{ event?.creator?.email ?? 'Unavailable' }}</span></li>
          <li>Event Type: <span class="inline-text">{{ event?.birthdayProperties?.type ?? 'Unavailable' }}</span></li>
        </ul>
      </details>
    </article>
    <article v-else>
      <p>We could not load the event details.</p>
    </article>
  </section>
</template>

<style lang="scss" scoped>
.event-view {
  width: 100%;
  // overflow-y: auto;
}

.menu-bar-actions {
  display: flex;
  gap: var(--space-sm);

  button {
    display: flex;
    align-items: center;
  }
}

.heading {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding-bottom: var(--space-sm);
  border-bottom: 1px solid var(--border);

  h2 {
    font-size: var(--text-size-lg);
    font-weight: bold;
  }

  .calendar-ribbon-wrapper {
    margin-left: var(--space-sm);
  }
}

dt {
  color: var(--text-light);
  font-size: .9rem;
}

dl {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding-top: var(--space-md);

  div {
    display: grid;
    grid-template-columns: var(--space-md) 1fr;
    gap: var(--space-sm);

    dt {
      display: flex;
      align-items: center;
    }
  }
}

.inline-text {
  font-family: monospace;
  font-size: var(--text-size-sm);
  color: rgb(231, 17, 17);
  background-color: var(--bg-3);
  padding: var(--space-xxs) var(--space-xs);
  border-radius: var(--border-radius);
  word-break: break-all;
}
</style>
