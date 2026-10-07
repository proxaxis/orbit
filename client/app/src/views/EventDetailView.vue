<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import dayjs from '@/services/dayjs.js';
import { useEventStore } from '@/stores/event.js';
import { useAuthStore } from '@/stores/auth.js';
import { usePhotosStore } from '@/stores/photos.js';
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
import IconImage from '@/components/icons/IconImage.vue';
import IconDownload from '@/components/icons/IconDownload.vue';
import IconCloudArrowDown from '@/components/icons/IconCloudArrowDown.vue';
import IconArrowsRotate from '@/components/icons/IconArrowsRotate.vue';

const router = useRouter();
const eventStore = useEventStore();
const userStore = useUserStore();
const authStore = useAuthStore();
const photosStore = usePhotosStore();

/** @type {Ref<HandyCalendarEvent|null>} */
const event = ref(null);
/** @type {Ref<boolean>} 参加ステータス更新中かどうか */
const isUpdatingAttendance = ref(false);

/** @type {ComputedRef<OrbitEventPhotoAlbum|null>} イベントに紐づく共有アルバム */
const albumBinding = computed(() => photosStore.bindingOf(event.value));
/** @type {Ref<GooglePhotosAlbum|null>} 取得したアルバム情報 */
const album = ref(null);
/** @type {Ref<GooglePhotosMediaItem[]>} アルバム内の写真 */
const albumPhotos = ref([]);
/** @type {Ref<boolean>} 写真の読み込み中かどうか */
const isPhotosLoading = ref(false);
/** @type {Ref<string>} 写真操作のエラー */
const photoError = ref('');
/** @type {Ref<HTMLInputElement|null>} ローカルファイル入力 */
const rfFileInput = ref(null);

/** 写真共有機能のセクションを表示するか */
const photoSectionVisible = computed(() => authStore.isAuthenticated && (userStore.usePhotoSharing || !!albumBinding.value));
/** API 経由で写真を操作できるか */
const photoApiReady = computed(() => photosStore.canUsePhotoSharing());
/** イベントに本人以外の参加者がいるか */
const hasOtherAttendees = computed(() => (event.value?.raw?.attendees ?? []).some((attendee) => !attendee.self));

/** アルバムの写真一覧を読み込む（未参加なら shareToken で参加する） */
async function loadAlbumPhotos() {
  const binding = albumBinding.value;
  if (!binding || !photoApiReady.value) return;
  isPhotosLoading.value = true;
  photoError.value = '';
  try {
    album.value = await photosStore.openAlbum(binding);
    albumPhotos.value = await photosStore.listAlbumPhotos(binding);
  } catch (error) {
    photoError.value = error instanceof Error ? error.message : String(error);
  } finally {
    isPhotosLoading.value = false;
  }
}

/** @param {Event} inputEvent ローカルファイルの選択 */
async function onSelectLocalFiles(inputEvent) {
  const input = /** @type {HTMLInputElement} */ (inputEvent.target);
  const files = Array.from(input.files ?? []).map((file) => ({ blob: file, fileName: file.name, mimeType: file.type || 'application/octet-stream' }));
  input.value = '';
  if (!files.length || !event.value) return;
  photoError.value = '';
  try {
    await photosStore.uploadFiles(event.value, files);
    await loadAlbumPhotos();
  } catch (error) {
    photoError.value = error instanceof Error ? error.message : String(error);
  }
}

/** Google フォトのライブラリから写真を選択してアルバムへコピーする */
async function pickFromGooglePhotos() {
  if (!event.value) return;
  photoError.value = '';
  // ポップアップブロックを避けるため、クリック処理内で先にウィンドウを開いておく
  const pickerWindow = window.open('', 'orbit-photos-picker', 'width=960,height=720');
  try {
    const result = await photosStore.uploadPickedPhotos(event.value, pickerWindow);
    if (result) await loadAlbumPhotos();
  } catch (error) {
    if (pickerWindow && !pickerWindow.closed) pickerWindow.close();
    photoError.value = error instanceof Error ? error.message : String(error);
  }
}

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
    loadAlbumPhotos();
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
        <h1 class="title">詳細</h1>
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
          <CalendarRibbon :cid="event?.calendarId" />
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
      <!-- 共有アルバム -->
      <section v-if="photoSectionVisible" class="photos-section">
        <h3><IconImage size="1rem" /> 共有アルバム</h3>
        <template v-if="albumBinding">
          <p v-if="hasOtherAttendees" class="hint">このアルバムは参加者と共有されています。</p>
          <p v-if="isPhotosLoading" class="hint">写真を読み込んでいます...</p>
          <div v-if="albumPhotos.length" class="photo-grid">
            <a v-for="photo in albumPhotos" :key="photo.id" :href="`${photo.baseUrl}=d`" :title="`${photo.filename ?? '写真'} をダウンロード`" target="_blank" rel="noopener noreferrer" class="photo-cell">
              <img :src="`${photo.baseUrl}=w240-h240-c`" :alt="photo.filename ?? '写真'" loading="lazy" />
              <span class="download-badge"><IconDownload size="0.7rem" /></span>
            </a>
          </div>
          <p v-else-if="!isPhotosLoading && photoApiReady" class="hint">まだ写真がありません。</p>
          <div class="photo-actions">
            <a v-if="albumBinding.shareUrl || album?.productUrl" :href="albumBinding.shareUrl || album?.productUrl" target="_blank" rel="noopener noreferrer" class="album-link">
              <IconArrowUpRightFromSquare size="0.85rem" /> アルバムを開く
            </a>
            <button v-if="photoApiReady" type="button" :disabled="isPhotosLoading || photosStore.isPhotoBusy" @click="loadAlbumPhotos">
              <IconArrowsRotate size="0.85rem" /> 再読み込み
            </button>
          </div>
        </template>
        <template v-else-if="photoApiReady">
          <p class="hint">写真を選択してアップロードすると、このイベント専用の共有アルバムが作成されます。{{ hasOtherAttendees ? '参加者がいるため、作成後は参加者と共有されます。' : '' }}</p>
        </template>
        <template v-else-if="!userStore.usePhotoSharing">
          <p class="hint">写真共有は無効です。共有されたアルバムを利用するには、ユーザー設定で有効化してください。</p>
        </template>
        <p v-else class="hint">Google アカウントの認証が必要です。ユーザー設定から認証してください。</p>

        <div v-if="photoApiReady" class="photo-actions">
          <input ref="rfFileInput" type="file" accept="image/*,video/*" multiple hidden @change="onSelectLocalFiles" />
          <button type="button" :disabled="photosStore.isPhotoBusy" @click="rfFileInput?.click()">
            <IconCloudArrowDown size="0.85rem" /> ファイルをアップロード
          </button>
          <button type="button" :disabled="photosStore.isPhotoBusy" @click="pickFromGooglePhotos">
            <IconImage size="0.85rem" /> Google フォトから選択
          </button>
        </div>
        <p v-if="photosStore.isPhotoBusy" class="hint">{{ photosStore.photoStatus }}</p>
        <p v-if="photoError" class="photo-error">{{ photoError }}</p>
      </section>

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
  // gap: var(--space-sm);

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

.photos-section {
  margin-top: var(--space-sm);
  padding: var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  background: var(--bg-1);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);

  h3 {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    font-size: var(--text-size-md);
  }

  .hint {
    color: var(--text-light);
    font-size: var(--text-size-sm);
  }

  .photo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: var(--space-xs);
  }

  .photo-cell {
    position: relative;
    aspect-ratio: 1;
    border-radius: var(--border-radius);
    overflow: hidden;
    background: var(--bg-2);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .download-badge {
      position: absolute;
      right: var(--space-xxs);
      bottom: var(--space-xxs);
      display: flex;
      padding: var(--space-xxs);
      border-radius: 50%;
      background: color-mix(in srgb, var(--bg-0) 70%, transparent);
      color: var(--text);
      opacity: 0;
      transition: opacity 0.15s ease;
    }

    &:hover .download-badge,
    &:focus-visible .download-badge {
      opacity: 1;
    }
  }

  .photo-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);

    button,
    .album-link {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xxs);
      padding: var(--space-xs) var(--space-sm);
      border: 1px solid var(--border);
      border-radius: var(--border-radius);
      font-size: var(--text-size-xs);

      &:hover {
        background-color: var(--bg-2);
      }
    }
  }

  .photo-error {
    color: var(--danger);
    font-size: var(--text-size-xs);
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
