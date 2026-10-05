<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import dayjs from '@/services/dayjs.js';
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

const router = useRouter();
const eventStore = useEventStore();
const userStore = useUserStore();

/** @type {Ref<HandyCalendarEvent|null>} */
const event = ref(null);
/** @type {Ref<boolean>} 参加ステータス更新中かどうか */
const isUpdatingAttendance = ref(false);

const myAttendee = computed(() => event.value?.raw?.attendees?.find((attendee) => attendee.self) ?? null);

/** @param {'accepted'|'declined'} responseStatus 本人の参加ステータスを更新します。 */
async function respondToInvitation(responseStatus) {
  if (!event.value || !myAttendee.value || isUpdatingAttendance.value) return;
  const attendees = (event.value.raw.attendees ?? []).map((attendee) => (attendee.self ? { ...attendee, responseStatus } : attendee));

  isUpdatingAttendance.value = true;
  userStore.setLoading(true, responseStatus === 'accepted' ? '承諾しています...' : '辞退しています...');
  try {
    await eventStore.updateEvent(event.value.id, event.value.calendarId, { attendees });
    event.value.raw.attendees = attendees;
  } catch (err) {
    userStore.setError(true, err);
  } finally {
    isUpdatingAttendance.value = false;
    userStore.setLoading(false);
  }
}

const dateText = computed(() => {
  if (!event.value) return '';
  if (event.value.isAllDay) return `${event.value.startDateTime.format('YYYY-MM-DD')} - ${dayjs(event.value.endDateTime).subtract(1, 'day').format('YYYY-MM-DD')}`;
  return `${dayjs(event.value.startDateTime).format('YYYY-MM-DD HH:mm')} - ${dayjs(event.value.endDateTime).format('YYYY-MM-DD HH:mm')}`;
});

function edit() {
  router.push({ name: 'EventEditor' });
}

async function remove() {
  if (!event.value) throw new Error('You do not have an event selected. You must select an event to remove it.');
  if (!(await userStore.confirm({ title: 'Remove Event', message: 'Are you sure you want to remove this event?' }))) return;
  userStore.setLoading(true, 'Removing the event...');
  try {
    const res = await eventStore.removeEvent(event.value.id, event.value.calendarId);
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
  <section class="event-detail-view">
    <MenuBar>
      <template #main>
        <h1 class="title">イベントの詳細</h1>
      </template>
      <template #sub>
        <div class="menu-bar-actions">
          <button title="Delete" :disabled="!event" @click="remove">
            <IconTrash />
          </button>
          <button title="Edit" :disabled="!event" @click="edit">
            <IconPen size="1.1rem" />
          </button>
          <button title="Back" @click="router.push({ name: 'Home' })">
            <IconXMark size="1.2rem" />
          </button>
        </div>
      </template>
    </MenuBar>

    <article v-if="!!event">
      <div class="heading">
        <h2>{{ event.icon ?? '📌' }}{{ event?.summary }}</h2>
        <div class="calendar-ribbon-wrapper">
          <CalendarRibbon :gCalendarId="event?.calendarId" />
        </div>
      </div>
      <dl>
        <div>
          <dt>
            <IconClock />
          </dt>
          <dd>
            {{ dateText }}<span v-if="event?.raw.start?.timeZone"> ({{ event?.raw.start?.timeZone }})</span>
          </dd>
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
      <section v-if="myAttendee" class="attendance-section" aria-label="参加回答">
        <h3>参加回答</h3>
        <p>現在の回答: {{ myAttendee.responseStatus === 'accepted' ? '承諾' : myAttendee.responseStatus === 'declined' ? '辞退' : '未回答' }}</p>
        <div class="attendance-actions">
          <button type="button" class="accept-button" :disabled="isUpdatingAttendance" @click="respondToInvitation('accepted')">承諾</button>
          <button type="button" class="decline-button" :disabled="isUpdatingAttendance" @click="respondToInvitation('declined')">辞退</button>
        </div>
      </section>
      <details v-if="event.raw.attendees?.length" class="attendees-section">
        <summary>参加者（{{ event.raw.attendees.length }}人）</summary>
        <ul>
          <li v-for="attendee in event.raw.attendees" :key="attendee.email || attendee.id">
            <span>{{ attendee.displayName || attendee.email || '不明な参加者' }}</span>
            <small>{{ attendee.responseStatus || '未回答' }}</small>
          </li>
        </ul>
      </details>
      <details>
        <summary>More Information</summary>
        <ul>
          <li>
            Status: <span class="inline-text">{{ event.raw.status ?? 'Unavailable' }}</span>
          </li>
          <li>
            Google Calendar URL: <span class="inline-text">{{ event.raw.htmlLink ?? 'Unavailable' }}</span>
          </li>
          <li>
            Created: <span class="inline-text">{{ event.raw.created ?? 'Unavailable' }}</span>
          </li>
          <li>
            Updated: <span class="inline-text">{{ event.raw.updated ?? 'Unavailable' }}</span>
          </li>
          <li>
            Creator ID: <span class="inline-text">{{ event.raw.creator?.email ?? 'Unavailable' }}</span>
          </li>
          <li>
            Event Type: <span class="inline-text">{{ event.raw.birthdayProperties?.type ?? 'Unavailable' }}</span>
          </li>
        </ul>
      </details>
    </article>
    <article v-else>
      <p>We could not load the event details.</p>
    </article>
  </section>
</template>

<style lang="scss" scoped>
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
  font-size: 0.9rem;
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

details {
  margin-left: var(--space-xs);
  margin-top: var(--space-sm);
}

.inline-text {
  font-family: monospace;
  color: var(--danger);
  background-color: var(--bg-3);
  padding: var(--space-xxs) var(--space-xs);
  border-radius: var(--border-radius);
  word-break: break-all;
}

.attendance-section,
.attendees-section {
  margin-top: var(--space-md);
  padding: var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  background: var(--bg-1);
}

.attendance-section h3 {
  font-size: var(--text-size-md);
}

.attendance-section p,
.attendees-section small {
  color: var(--text-light);
  font-size: var(--text-size-sm);
}

.attendance-actions {
  display: flex;
  gap: var(--space-sm);
  margin-top: var(--space-sm);
}

.attendance-actions button {
  padding: var(--space-xs) var(--space-md);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
}

.accept-button:hover:not(:disabled) {
  color: var(--primary);
}

.decline-button:hover:not(:disabled) {
  color: var(--danger);
}

.attendees-section ul {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-top: var(--space-sm);
}

.attendees-section li {
  display: flex;
  justify-content: space-between;
  gap: var(--space-sm);
}

.icon-trash,
.icon-pen,
.icon-x-mark {
  padding: var(--space-xs);

  &:hover {
    background-color: var(--bg-2);
    border-radius: 50%;
  }
}

.icon-trash {
  fill: var(--danger);
}
</style>
