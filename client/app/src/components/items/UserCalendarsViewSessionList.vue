<script setup>
/**
 * UserCalendarsView のセッションカレンダー欄。
 * カレンダー ID または連絡先検索からのセッション追加と、
 * セッションカレンダーの一覧・削除を担う。
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.js';
import { useCalendarStore } from '@/stores/calendar.js';
import { useShareStore } from '@/stores/share.js';
import { useUserStore } from '@/stores/user.js';
import { usePeopleStore } from '@/stores/people.js';
import { useCalendars } from '@/composables/useCalendars.js';
import { useClipboard } from '@/composables/useClipboard.js';
import { usePeople } from '@/composables/usePeople.js';
import { useShare } from '@/composables/useShare.js';
import AccordionMenu from '@/components/AccordionMenu.vue';
import CalendarRibbon from '@/components/CalendarRibbon.vue';
import SuggestPulldown from '@/components/SuggestPulldown.vue';
import DropdownMenu from '@/components/DropdownMenu.vue';
import IconClipboard from '@/components/icons/IconClipboard.vue';
import IconEllipsisVertical from '@/components/icons/IconEllipsisVertical.vue';
import IconEyeSlash from '@/components/icons/IconEyeSlash.vue';
import IconEye from '@/components/icons/IconEye.vue';
import IconTrash from '@/components/icons/IconTrash.vue';
import IconUserGroup from '@/components/icons/IconUserGroup.vue';
import IconCloudArrowDown from '../icons/IconCloudArrowDown.vue';

const router = useRouter();
const authStore = useAuthStore();
const calendarStore = useCalendarStore();
const shareStore = useShareStore();
const userStore = useUserStore();
const peopleStore = usePeopleStore();
const calendars = useCalendars();
const clipboard = useClipboard();
const people = usePeople();
const share = useShare();

/** @type {Ref<string>} セッションカレンダー検索の入力値 */
const sessionCalendarQuery = ref('');

/** 入力されたカレンダー ID をセッションカレンダーとして検索・追加する */
async function searchSessionCalendar() {
  try {
    const query = sessionCalendarQuery.value.trim();
    if (!query) return;
    userStore.setLoading(true, 'カレンダーを検索しています...');
    await calendars.searchSessionCalendar(query);
    sessionCalendarQuery.value = '';
    peopleStore.clearSuggestions();
  } catch (error) {
    userStore.setError(true, error instanceof Error ? error : 'カレンダーを検索できませんでした。');
  } finally {
    userStore.setLoading(false);
  }
}

/** 入力値から People API の連絡先候補を検索する */
async function searchPeopleForSessionCalendar() {
  if (sessionCalendarQuery.value.trim().length < 2) return;
  await people.search(sessionCalendarQuery.value);
}

/** @param {GooglePeoplePerson} person 連絡先候補からセッションカレンダーを追加する */
function selectPersonSuggestion(person) {
  sessionCalendarQuery.value = person.emailAddresses?.[0]?.value ?? '';
  peopleStore.clearSuggestions();
  searchSessionCalendar();
}

/** @type {ComputedRef<{spec: OrbitShareSpec, copyId: string, entry: GoogleCalendarListEntry|null}[]>} 期間指定共有で作成されたコピーカレンダー一覧 */
const sharedCalendars = computed(() =>
  shareStore.specs.filter((spec) => typeof spec.copyCalendarId === 'string' && spec.copyCalendarId.length > 0).map((spec) => ({ spec, copyId: /** @type {string} */ (spec.copyCalendarId), entry: calendarStore.list.find((calendar) => calendar.id === spec.copyCalendarId) ?? null })),
);

/** @param {OrbitShareSpec} spec コピーカレンダー ID をクリップボードへコピーする */
function copyShareCalendarId(spec) {
  if (spec.copyCalendarId) clipboard.writeClipboard(spec.copyCalendarId);
}

/** @param {OrbitShareSpec} spec 共有を停止してコピーカレンダーを削除する */
async function stopShare(spec) {
  const confirmed = await userStore.confirm({
    title: '共有を停止',
    message: `${spec.recipient} への共有を停止し、共有用カレンダーを削除します. よろしいですか？`,
  });
  if (!confirmed) return;
  try {
    await share.removeShare(spec.id);
  } catch (error) {
    userStore.setError(true, error);
  }
}
</script>

<template>
  <section class="session-section">
    <AccordionMenu title="セッションリストの開閉" :useMenuSlot="true">
      <template #summary>セッションリスト</template>
      <template #menu>
        <DropdownMenu>
          <template #button>
            <button class="cal-list-menu-open" title="セッションカレンダーの操作">
              <IconEllipsisVertical />
            </button>
          </template>
          <button :disabled="!calendarStore.sessionCalendars.length" @click="calendarStore.clearSessionCalendars"><IconTrash />全て削除</button>
        </DropdownMenu>
      </template>
      <div class="accordion-content">
        <div class="session-calendar-search">
          <div class="session-search-row">
            <SuggestPulldown v-model="sessionCalendarQuery" :suggestions="peopleStore.suggestions" :item-key="(person) => person.resourceName" placeholder="カレンダーを検索..."
              @update:model-value="searchPeopleForSessionCalendar" @enter="searchSessionCalendar" @select="selectPersonSuggestion">
              <template #suggestion="{ item: person }">{{ person.names?.[0]?.displayName || person.emailAddresses?.[0]?.value }}</template>
            </SuggestPulldown>
            <button type="button" :disabled="userStore.isLoading" @click="searchSessionCalendar"><IconCloudArrowDown />追加</button>
          </div>
        </div>

        <ul v-if="authStore.isAuthenticated" class="session-calendar-list">
          <li v-for="c in calendarStore.sessionCalendars" :key="c.id" :title="c.description">
            <div class="list-item">
              <label :title="c.description">
                <CalendarRibbon :cid="c.id" :useMenuSlot="true">
                  <template #menu>
                    <DropdownMenu>
                      <template #button>
                        <button class="cal-list-dm-open" title="カレンダーの操作">
                          <IconEllipsisVertical />
                        </button>
                      </template>
                      <button @click="userStore.setCalendarVisibility(c.id, true)"><IconEye />表示</button>
                      <button @click="userStore.setCalendarVisibility(c.id, false)"><IconEyeSlash />非表示</button>
                      <button @click="calendarStore.removeSessionCalendar(c.id)">セッションから削除</button>
                    </DropdownMenu>
                  </template>
                </CalendarRibbon>
                <small class="session-badge">SESSION</small>
              </label>
            </div>
          </li>
        </ul>

        <ul v-if="authStore.isAuthenticated && sharedCalendars.length" class="session-calendar-list">
          <li v-for="item in sharedCalendars" :key="item.spec.id" :title="item.spec.title">
            <input
              type="checkbox"
              :id="`iptbx-share-${item.spec.id}`"
              :checked="userStore.visibleShareCalendarIds.includes(item.copyId)"
              :style="{ accentColor: item.entry?.backgroundColor, borderColor: item.entry?.backgroundColor }"
              @change="userStore.setShareCalendarVisibility(item.copyId, /** @type {HTMLInputElement} */ ($event.target).checked)" />
            <div class="list-item">
              <label :for="`iptbx-share-${item.spec.id}`" :title="item.spec.title">
                <CalendarRibbon v-if="item.entry" :cid="item.entry.id" />
                <span v-else class="share-ribbon">
                  <span class="share-dot"></span>
                  <span class="share-name">{{ item.spec.title }}</span>
                </span>
                <small class="share-badge">SHARED</small>
              </label>
              <DropdownMenu>
                <template #button>
                  <button class="cal-list-dm-open" title="カレンダーの操作">
                    <IconEllipsisVertical />
                  </button>
                </template>
                <button @click="copyShareCalendarId(item.spec)"><IconClipboard />IDをコピー</button>
                <button @click="stopShare(item.spec)"><IconTrash />すぐに共有停止</button>
                <button @click="router.push({ name: 'SharingConfig', query: { cid: item.copyId } })"><IconUserGroup />共有設定</button>
              </DropdownMenu>
            </div>
          </li>
        </ul>
        <small v-if="authStore.isAuthenticated && calendarStore.sessionCalendars.length === 0 && !sharedCalendars.length">表示するカレンダーはありません</small>
        <small v-if="!authStore.isAuthenticated" class="login-message">カレンダーを同期するにはログインしてください</small>
      </div>
    </AccordionMenu>
  </section>
</template>

<style lang="scss" scoped>
.accordion-content {
  overflow: visible;
  small {
    display: block;
    color: var(--text-light);
  }
}

ul {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  min-height: 0;
  overflow-y: visible;
  margin-bottom: var(--space-sm);

  li {
    display: flex;
    border-radius: var(--border-radius);
    padding: var(--space-xs) 0 var(--space-xs) var(--space-sm);
    gap: var(--space-sm);

    &:hover {
      background-color: var(--bg-2);

      * {
        cursor: pointer;
      }
    }
  }
}

.list-item {
  display: flex;
  justify-content: space-between;
  width: 100%;
  overflow: hidden;

  label {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--space-sm);
    user-select: none;
    overflow: hidden;
  }
}

.cal-list-menu-open {
  padding: var(--space-sm) calc(var(--space-xs) + var(--space-sm)) var(--space-sm) var(--space-sm);
  background-color: var(--bg-1);

  &:hover {
    background-color: var(--bg-2);
  }
}

.cal-list-dm-open {
  padding: var(--space-sm);
  background-color: transparent;
}

.session-calendar-search {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin: var(--space-sm) 0;
  font-size: var(--text-size-xs);
}

.session-search-row {
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;

  button {
    background-color: var(--primary);

    &:hover {
      background-color: var(--primary-light);
    }
  }

  .suggest-pulldown {
    flex: 1;
    min-width: 0;

    :deep(input) {
      height: 100%;
    }
  }
}

.session-badge,
.share-badge {
  color: var(--primary);
  font-size: var(--text-size-xxs);
}

.share-ribbon {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--space-sm);
  overflow: hidden;
}

.share-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  background-color: #607d8b;
}

.share-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.error {
  color: var(--danger);
}
</style>
