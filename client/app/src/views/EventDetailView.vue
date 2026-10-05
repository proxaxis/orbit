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
import IconUserCheck from '@/components/icons/IconUserCheck.vue';
import IconAnglesDown from '@/components/icons/IconAnglesDown.vue';
import IconClone from '@/components/icons/IconClone.vue';
import IconArrowUpRightFromSquare from '@/components/icons/IconArrowUpRightFromSquare.vue';

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

/** @param {Dayjs} startDateTime @param {Dayjs} endDateTime @description イベントまであと何日後か計算 */
function howLongBeforeEvent(startDateTime, endDateTime) {
  if (!startDateTime || !endDateTime) return '';
  const now = dayjs();
  const s = startDateTime;
  const e = endDateTime;
  const monthsAgo = now.diff(s, 'month'); // 何か月前
  const weeksAgo = now.diff(s, 'week'); // 何週間前
  const daysAgo = now.diff(s, 'day'); // 何日前
  const hoursAgo = now.diff(s, 'hour'); // 何時間前
  const minutesAgo = now.diff(s, 'minute'); // 何分前
  const secondsAgo = now.diff(s, 'second'); // 何秒前

  if (now.isBefore(s)) {
    // イベントがまだ始まっていない場合
    if (monthsAgo < 0) return `${-monthsAgo}か月後`;
    if (weeksAgo < 0) return `${-weeksAgo}週間後`;
    if (daysAgo < 0) return `${-daysAgo}日前`;
    if (hoursAgo < 0) return `${-hoursAgo}時間後`;
    if (minutesAgo < 0) return `${-minutesAgo}分後`;
    if (secondsAgo < 0) return `${-secondsAgo}秒後`;
  } else if (now.isAfter(e)) {
    // イベントが終了している場合
    if (monthsAgo > 0) return `${monthsAgo}か月前`;
    if (weeksAgo > 0) return `${weeksAgo}週間前`;
    if (daysAgo > 0) return `${daysAgo}日前`;
    if (hoursAgo > 0) return `${hoursAgo}時間前`;
    if (minutesAgo > 0) return `${minutesAgo}分前`;
    if (secondsAgo > 0) return `${secondsAgo}秒前`;
  } else {
    // イベントが進行中の場合
    return '進行中';
  }
}

const dateText = computed(() => {
  if (!event.value) return { startText: '', endText: '', duration: '' };
  let startText = '';
  let endText = '';
  if (event.value.isAllDay) {
    startText = event.value.startDateTime.format('YYYY年 M月 D日 (ddd)');
    endText = dayjs(event.value.endDateTime).subtract(1, 'day').format('YYYY年 M月 D日 (ddd)');
  } else {
    startText = dayjs(event.value.startDateTime).format('YYYY年 M月 D日 (ddd) HH:mm');
    endText = dayjs(event.value.endDateTime).format('YYYY年 M月 D日 (ddd) HH:mm');
  }
  return { startText, endText, duration: howLongBeforeEvent(event.value.startDateTime, event.value.endDateTime) };
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
            <IconTrash size="1.2rem" />
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
        <button title="タイトルをコピー" @click="userStore.writeClipboard(event?.summary ?? '')">
          <IconClone size="1rem" />
        </button>
        <div class="calendar-ribbon-wrapper">
          <CalendarRibbon :gCalendarId="event?.calendarId" />
        </div>
      </div>
      <dl>
        <section>
          <dt>
            <IconClock />
          </dt>
          <dd class="date-text">
            <span>{{ dateText.startText }}</span>
            <IconAnglesDown size="0.7rem" />
            <span>{{ dateText.endText }}</span>
            <small>{{ dateText.duration }}（{{ event?.raw.start?.timeZone ?? 'タイムゾーン利用不可' }}）</small>
          </dd>
          <button title="日時をコピー" @click="userStore.writeClipboard(`${dateText.startText} ~ ${dateText.endText}`)">
            <IconClone size="1rem" />
          </button>
        </section>
        <section v-if="event?.location">
          <dt>
            <IconLocationDot />
          </dt>
          <dd>
            {{ event.location }}
          </dd>
          <button title="場所をコピー" @click="userStore.writeClipboard(event?.location ?? '')">
            <IconClone size="1rem" />
          </button>
        </section>
        <section v-if="event?.description">
          <dt>
            <IconAlignLeft />
          </dt>
          <dd>{{ event.description }}</dd>
          <button title="説明をコピー" @click="userStore.writeClipboard(event?.description ?? '')">
            <IconClone size="1rem" />
          </button>
        </section>
      </dl>
      <dl v-if="myAttendee">
        <div>
          <dt><IconUserCheck /></dt>
          <dd>
            参加承諾:
            <span data-response-status="accepted" v-if="myAttendee.responseStatus === 'accepted'">承諾済み</span>
            <span data-response-status="declined" v-else-if="myAttendee.responseStatus === 'declined'">辞退済み</span>
            <span data-response-status="needsAction" v-else>未回答</span>
          </dd>
        </div>
      </dl>
      <details v-if="myAttendee" aria-label="参加回答" class="attendance-section">
        <summary>参加回答を変更または確定する</summary>
        <p>現在の回答: {{ myAttendee.responseStatus === 'accepted' ? '承諾' : myAttendee.responseStatus === 'declined' ? '辞退' : '未回答' }}</p>
        <div class="attendance-actions">
          <button type="button" class="accept-button" :disabled="isUpdatingAttendance" @click="respondToInvitation('accepted')">承諾</button>
          <button type="button" class="decline-button" :disabled="isUpdatingAttendance" @click="respondToInvitation('declined')">辞退</button>
        </div>
      </details>
      <details v-if="event.raw.attendees?.length" class="attendees-section">
        <summary>参加者（{{ event.raw.attendees.length }}人）</summary>
        <ul>
          <li v-for="attendee in event.raw.attendees" :key="attendee.email || attendee.id">
            <span>{{ attendee.displayName || attendee.email || '不明な参加者' }}</span>
            <small>
              <span data-response-status="accepted" v-if="attendee.responseStatus && attendee.responseStatus === 'accepted'">承諾済み</span>
              <span data-response-status="declined" v-else-if="attendee.responseStatus && attendee.responseStatus === 'declined'">辞退済み</span>
              <span data-response-status="needsAction" v-else>未回答</span>
            </small>
          </li>
        </ul>
      </details>
      <details class="more-info">
        <summary>More Information</summary>
        <ul>
          <li>
            Status: <span class="inline-text">{{ event.raw.status ?? 'Unavailable' }}</span>
          </li>
          <li>
            Google Calendar URL: <span class="inline-text">{{ event.raw.htmlLink ?? 'Unavailable' }}</span>
            <a v-if="event.raw.htmlLink" :href="event.raw.htmlLink" target="_blank" rel="noopener noreferrer">
              <IconArrowUpRightFromSquare size="1rem" />
            </a>
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
    background-color: var(--bg-1);
    &:has(.icon-trash),
    &:has(.icon-pen),
    &:has(.icon-x-mark) {
      &:hover {
        background-color: var(--bg-2);
      }
    }

    .icon-trash {
      fill: var(--danger);
    }
  }
}

.heading {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  border-bottom: 1px solid var(--border);
  padding-bottom: var(--space-sm);
  margin-bottom: var(--space-md);
  position: relative;

  h2 {
    font-size: var(--text-size-lg);
    font-weight: bold;
    padding: var(--space-xs) calc(var(--space-sm) * 2 + 1rem) var(--space-sm) var(--space-xs); // 右は余白に加えてボタンの分だけ余白を空ける
  }

  .calendar-ribbon-wrapper {
    margin-left: var(--space-sm);
  }

  button {
    position: absolute;
    right: 0;
    top: 0;
    background-color: var(--bg-1);
    &:hover {
      background-color: var(--bg-2);
    }
  }
}

dl {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);

  section {
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
    padding: var(--space-xs) calc(var(--space-sm) * 2 + 1rem) var(--space-xs) var(--space-sm); // 右はボタンの分と gap だけ余白を空ける
    position: relative;
    display: flex;
    gap: var(--space-sm);

    dt {
      display: flex;
      justify-content: center;
      align-items: center;
      color: var(--text-light);
      font-size: 0.9rem;
    }

    dd {
      flex-grow: 1;
      word-break: break-all;

      &.date-text {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
    }

    button {
      position: absolute;
      right: 0;
      top: 0;
      background-color: var(--bg-1);
      &:hover {
        background-color: var(--bg-2);
      }
    }
  }
}
small,
.attendance-section p {
  color: var(--text-light);
  font-size: var(--text-size-sm);
}
.more-info {
  margin-top: var(--space-sm);
  padding: var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  background: var(--bg-1);
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
  margin-top: var(--space-sm);
  padding: var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  background: var(--bg-1);
}

.attendance-section h3 {
  font-size: var(--text-size-md);
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
.accept-button {
  background-color: var(--success);
  color: var(--text);
  &:hover:not(:disabled) {
    opacity: 0.8;
  }
}
.decline-button {
  background-color: var(--danger);
  color: var(--text);
  &:hover:not(:disabled) {
    opacity: 0.8;
  }
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

span[data-response-status='accepted'] {
  font-size: var(--text-size-sm);
  background-color: var(--success);
  border-radius: var(--border-radius);
  padding: 0 var(--space-xs);
  color: var(--text);
}
span[data-response-status='declined'] {
  font-size: var(--text-size-sm);
  background-color: var(--danger);
  border-radius: var(--border-radius);
  padding: 0 var(--space-xs);
  color: var(--text);
}
span[data-response-status='needsAction'] {
  font-size: var(--text-size-sm);
  background-color: var(--warning);
  border-radius: var(--border-radius);
  padding: 0 var(--space-xs);
  color: var(--text);
}
</style>
