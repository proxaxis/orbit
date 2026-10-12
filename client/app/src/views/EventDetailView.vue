<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import dayjs from '@/services/dayjs.js';
import { useEventActions } from '@/composables/useEventActions.js';
import { parseGoogleMapsLink, fetchPlaceInfo } from '@/services/google-maps.js';
import EventDetailViewPhotoAlbum from '@/components/items/EventDetailViewPhotoAlbum.vue';
import MenuBar from '@/components/MenuBar.vue';
import CalendarRibbon from '@/components/CalendarRibbon.vue';
import IconPen from '@/components/icons/IconPen.vue';
import IconCopy from '@/components/icons/IconCopy.vue';
import IconTrash from '@/components/icons/IconTrash.vue';
import IconLocationDot from '@/components/icons/IconLocationDot.vue';
import IconXMark from '@/components/icons/IconXMark.vue';
import { useUserStore } from '@/stores/user.js';
import { useCalendarStore } from '@/stores/calendar.js';
import IconClock from '@/components/icons/IconClock.vue';
import IconAlignLeft from '@/components/icons/IconAlignLeft.vue';
import IconUserCheck from '@/components/icons/IconUserCheck.vue';
import IconAnglesDown from '@/components/icons/IconAnglesDown.vue';
import IconClone from '@/components/icons/IconClone.vue';
import IconBell from '@/components/icons/IconBell.vue';
import IconArrowUpRightFromSquare from '@/components/icons/IconArrowUpRightFromSquare.vue';
import InlineEmoji from '@/components/InlineEmoji.vue';
import AccordionMenu from '@/components/AccordionMenu.vue';
import IconUserLock from '@/components/icons/IconUserLock.vue';

const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const calendarStore = useCalendarStore();
const eventActions = useEventActions();

/** @type {Ref<HandyCalendarEvent|null>} */
const event = ref(null);

/** @type {Ref<InstanceType<typeof EventDetailViewPhotoAlbum>|null>} 写真アルバム欄コンポーネント */
const rfPhotoAlbum = ref(null);

/** イベントに本人以外の参加者がいるか */
const hasOtherAttendees = computed(() => eventActions.hasOtherAttendees(event.value));

/** @type {ComputedRef<boolean>} イベントの属するカレンダーに書き込み権限があるか（ない場合は編集・削除を表示しない） */
const canWriteCalendar = computed(() => calendarStore.listWritableCalendars.some((calendar) => calendar.id === event.value?.calendarId));

const myAttendee = computed(() => event.value?.raw?.attendees?.find((attendee) => attendee.self) ?? null);

/** 場所に保存された Google Maps URL から取り出せるリンクカード情報（なければ null） */
const mapsPlaceBase = computed(() => parseGoogleMapsLink(event.value?.location ?? ''));

/** @type {Ref<{name: string, address: string}|null>} BFF のスクレイピングで解決した場所情報 */
const mapsPlaceResolved = ref(null);

/** リンクカードの表示情報。URL 解析の結果を即時表示し、BFF で解決できた名前・住所で上書きする */
const mapsPlace = computed(() => {
  const base = mapsPlaceBase.value;
  if (!base) return null;
  const resolved = mapsPlaceResolved.value;
  return {
    url: base.url,
    name: resolved?.name || base.name,
    address: resolved?.address || base.address,
  };
});

/** イベントに有効な通知設定（分）のリスト。カレンダー既定使用時は既定値を展開する */
const reminderMinutesList = computed(() => {
  const reminders = event.value?.raw?.reminders;
  if (!reminders) return [];
  const overrides = reminders.useDefault ? (calendarStore.list.find((cal) => cal.id === event.value?.calendarId)?.defaultReminders ?? []) : (reminders.overrides ?? []);
  return overrides.map((override) => override?.minutes ?? 0).sort((a, b) => a - b);
});

/** @param {number} minutes @returns {string} 通知タイミングの表示文字列 */
function formatReminderMinutes(minutes) {
  if (minutes % 1440 === 0) return `${minutes / 1440}日前`;
  if (minutes % 60 === 0) return `${minutes / 60}時間前`;
  return `${minutes}分前`;
}

const reminderText = computed(() => reminderMinutesList.value.map(formatReminderMinutes).join(' / '));

/** @param {'accepted'|'declined'} responseStatus 本人の参加ステータスを更新します。 */
async function respondToInvitation(responseStatus) {
  if (!event.value || !myAttendee.value || userStore.isLoading) return;
  await eventActions.respondToEvent(event.value, responseStatus);
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
    if (daysAgo < 0) return `${-daysAgo}日後`;
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

/** イベント編集画面へ遷移する */
function edit() {
  router.push({ name: 'EventEditor' });
}

/** イベント複製画面へ遷移する */
function clone() {
  router.push({ name: 'EventCloner' });
}

/** 確認ダイアログを表示してからイベントを削除し、ホームへ戻る */
async function remove() {
  if (!event.value) throw new Error('You do not have an event selected. You must select an event to remove it.');
  if (await eventActions.confirmAndRemoveEvent(event.value.id, event.value.calendarId)) {
    router.replace({ name: 'Home' });
  }
}

/** 選択中のイベントを読み込む。URL クエリ（通知タップからの遷移など）から選択状態を復元する。 */
async function loadEvent() {
  const result = await eventActions.loadSelectedEvent(route.query);
  if (!result) return;
  event.value = result;
  rfPhotoAlbum.value?.reload();
}

onMounted(loadEvent);

// Google Maps URL があれば BFF で場所名・住所を解決する（短縮 URL など URL から取れない場合の補完）
watch(
  mapsPlaceBase,
  async (base) => {
    mapsPlaceResolved.value = null;
    if (!base) return;
    const info = await fetchPlaceInfo(base.url);
    if (info && mapsPlaceBase.value?.url === base.url) mapsPlaceResolved.value = info;
  },
  { immediate: true },
);

// 通知タップなどで表示中に別のイベントが選択された場合は読み込み直す
watch(
  () => userStore.nowSelectedEvent,
  async (next, previous) => {
    if (!next || (next.eid === previous?.eid && next.cid === previous?.cid)) return;
    await loadEvent();
  },
);
</script>

<template>
  <section class="event-detail-view">
    <MenuBar>
      <template #main>
        <h1 class="title">詳細</h1>
      </template>
      <template #sub>
        <div class="menu-bar-actions">
          <button v-if="canWriteCalendar" title="Delete" :disabled="!event" @click="remove">
            <IconTrash size="1.2rem" />
          </button>
          <button v-if="canWriteCalendar" title="Edit" :disabled="!event" @click="edit">
            <IconPen size="1.1rem" />
          </button>
          <button title="複製" :disabled="!event" @click="clone">
            <IconCopy size="1.1rem" />
          </button>
          <button title="Back" @click="router.push({ name: 'Home' })">
            <IconXMark size="1.2rem" />
          </button>
        </div>
      </template>
    </MenuBar>

    <article v-if="!!event">
      <div class="heading">
        <h2><InlineEmoji :emoji="event.icon" /> {{ event?.summary }}</h2>
        <button title="タイトルをコピー" @click="userStore.writeClipboard(event?.summary ?? '')">
          <IconClone size="1rem" />
        </button>
        <div class="calendar-ribbon-wrapper">
          <CalendarRibbon :cid="event?.calendarId" />
        </div>
      </div>
      <dl>
        <div class="detail-row">
          <dt>
            <IconClock />
          </dt>
          <dd class="date-text">
            <span>{{ dateText.startText }}</span>
            <IconAnglesDown size="0.7rem" />
            <span>{{ dateText.endText }}</span>
            <small>{{ dateText.duration }}</small>
          </dd>
          <button title="日時をコピー" @click="userStore.writeClipboard(`${dateText.startText} ~ ${dateText.endText}`)">
            <IconClone size="1rem" />
          </button>
        </div>
        <div class="detail-row" v-if="reminderMinutesList.length">
          <dt>
            <IconBell />
          </dt>
          <dd>{{ reminderText }}に通知</dd>
          <button title="通知設定をコピー" @click="userStore.writeClipboard(reminderText)">
            <IconClone size="1rem" />
          </button>
        </div>
        <div class="detail-row" v-if="event?.location">
          <dt>
            <IconLocationDot />
          </dt>
          <dd>
            <template v-if="!mapsPlace || event.location.trim() !== mapsPlace.url">{{ event.location }}</template>
            <a v-if="mapsPlace" class="map-link-card" :href="mapsPlace.url" target="_blank" rel="noopener noreferrer">
              <span class="map-link-text">
                <strong>{{ mapsPlace.name }}</strong>
                <small v-if="mapsPlace.address">{{ mapsPlace.address }}</small>
              </span>
              <IconArrowUpRightFromSquare class="map-link-external" />
            </a>
          </dd>
          <button title="場所をコピー" @click="userStore.writeClipboard(event?.location ?? '')">
            <IconClone size="1rem" />
          </button>
        </div>
        <div class="detail-row" v-if="event?.description">
          <dt>
            <IconAlignLeft />
          </dt>
          <dd>{{ event.description }}</dd>
          <button title="説明をコピー" @click="userStore.writeClipboard(event?.description ?? '')">
            <IconClone size="1rem" />
          </button>
        </div>
      </dl>

      <!-- 写真アルバム -->
      <EventDetailViewPhotoAlbum ref="rfPhotoAlbum" :event="event" :has-other-attendees="hasOtherAttendees" />

      <dl>
        <div class="detail-row">
          <dt>
            <IconUserLock />
          </dt>
          <dd v-if="event.raw.visibility === 'default'">カレンダーの既定値</dd>
          <dd v-else-if="event.raw.visibility === 'public'">公開</dd>
          <dd v-else-if="event.raw.visibility === 'private'">非公開</dd>
          <dd v-else>カレンダーの既定値</dd>
        </div>
      </dl>

      <dl v-if="myAttendee">
        <div class="detail-row">
          <dt><IconUserCheck /></dt>
          <dd>
            参加承諾:
            <span data-response-status="accepted" v-if="myAttendee.responseStatus === 'accepted'">承諾済み</span>
            <span data-response-status="declined" v-else-if="myAttendee.responseStatus === 'declined'">辞退済み</span>
            <span data-response-status="needsAction" v-else>未回答</span>
          </dd>
        </div>
      </dl>

      <AccordionMenu v-if="myAttendee" label="参加回答を変更または確定する">
        <div class="attendance-container">
          <button type="button" data-response-action="declined" :disabled="userStore.isLoading || myAttendee.responseStatus === 'declined'" @click="respondToInvitation('declined')">辞退する</button>
          <button type="button" data-response-action="accepted" :disabled="userStore.isLoading || myAttendee.responseStatus === 'accepted'" @click="respondToInvitation('accepted')">承諾する</button>
        </div>
      </AccordionMenu>

      <AccordionMenu v-if="event.raw.attendees?.length" :label="`参加者（${event.raw.attendees.length}人）`">
        <ul class="attendees-container">
          <li v-for="attendee in event.raw.attendees" :key="attendee.email || attendee.id">
            <span>{{ attendee.displayName || attendee.email || '不明な参加者' }}</span>
            <small>
              <span :data-response-status="attendee.responseStatus ?? 'needsAction'">
                {{ attendee.responseStatus === 'accepted' ? '承諾済み' : attendee.responseStatus === 'declined' ? '辞退済み' : '未回答' }}
              </span>
            </small>
          </li>
        </ul>
      </AccordionMenu>

      <AccordionMenu label="その他の詳細情報">
        <ul class="other-more-info">
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
      </AccordionMenu>
    </article>
    <article v-else>
      <p>イベントの詳細を読み込めませんでした</p>
    </article>
  </section>
</template>

<style lang="scss" scoped>
.menu-bar-actions {
  display: flex;

  button {
    background-color: var(--bg-1);
    &:has(.icon-trash),
    &:has(.icon-pen),
    &:has(.icon-copy),
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

article {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.heading {
  display: flex;
  flex-direction: column;
  position: relative;

  h2 {
    background-color: var(--bg-2);
    border-radius: var(--border-radius);
    font-size: var(--text-size-lg);
    font-weight: bold;
    padding: var(--space-xs) calc(var(--space-sm) * 2 + 1rem) var(--space-xs) var(--space-xs); // 右は余白に加えてボタンの分だけ余白を空ける
  }

  .calendar-ribbon-wrapper {
    margin-left: 0.63rem;
    padding-top: var(--space-sm);
  }

  button {
    position: absolute;
    right: 0;
    top: 0;
    background-color: var(--bg-2);
    &:hover {
      background-color: var(--bg-3);
    }
  }
}

dl {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);

  .detail-row {
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

.map-link-card {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  border-radius: var(--border-radius);
  color: var(--text);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }

  .map-link-icon {
    fill: var(--danger);
    flex-shrink: 0;
    font-size: 1.2rem;
  }

  .map-link-text {
    display: flex;
    flex-direction: column;
    min-width: 0;

    strong {
      font-size: var(--text-size-sm);
      overflow-wrap: anywhere;
    }

    small {
      color: var(--text-light);
      font-size: var(--text-size-xs);
      overflow-wrap: anywhere;
    }
  }

  .map-link-external {
    margin-left: auto;
    fill: var(--text-light);
    flex-shrink: 0;
  }
}

span[data-response-status='accepted'] {
  font-size: var(--text-size-sm);
  background-color: var(--success);
  border-radius: var(--border-radius);
  padding: var(--space-xxs) var(--space-xs);
  color: var(--text);
}

span[data-response-status='declined'] {
  font-size: var(--text-size-sm);
  background-color: var(--danger);
  border-radius: var(--border-radius);
  padding: var(--space-xxs) var(--space-xs);
  color: var(--text);
}

span[data-response-status='needsAction'] {
  font-size: var(--text-size-sm);
  background-color: var(--warning);
  border-radius: var(--border-radius);
  padding: var(--space-xxs) var(--space-xs);
  color: var(--text);
}

.attendance-container {
  display: flex;
  justify-content: center;
  gap: var(--space-sm);

  button {
    width: 5rem;
  }

  button[data-response-action='accepted'] {
    background-color: var(--success);
    color: var(--text);
    &:hover:not(:disabled) {
      opacity: 0.8;
    }
  }

  button[data-response-action='declined'] {
    background-color: var(--danger);
    color: var(--text);
    &:hover:not(:disabled) {
      opacity: 0.8;
    }
  }
}

.attendees-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);

  li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-sm);
    border-radius: var(--border-radius);
  }
}

.inline-text {
  font-family: monospace;
  color: var(--danger);
  background-color: var(--bg-3);
  padding: var(--space-xxs) var(--space-xs);
  border-radius: var(--border-radius);
  word-break: break-all;
}
</style>
