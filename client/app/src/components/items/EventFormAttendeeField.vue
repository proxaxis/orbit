<script setup>
/**
 * EventForm の招待ユーザー入力欄。
 * 招待済み参加者の一覧表示と、People API 検索候補からの追加・
 * 未知メールアドレスの追加を担う。
 */
import { focusNextOnEnter } from '@/services/form-focus.js';
import IconXMark from '@/components/icons/IconXMark.vue';
import SuggestPulldown from '@/components/SuggestPulldown.vue';

defineProps({
  /** @type {import('vue').PropType<Array<GoogleCalendarAttendee & { email: string }>>} 招待済み参加者 */
  attendees: { type: Array, required: true },
  /** @type {import('vue').PropType<GooglePeoplePerson[]>} People API の検索候補 */
  suggestions: { type: Array, required: true },
  /** People API 検索中かどうか */
  isSearching: { type: Boolean, default: false },
});

const emit = defineEmits(['add-attendee', 'add-unknown-email', 'remove-attendee', 'query-blur']);

/** @type {ModelRef<string>} 招待先の検索クエリ */
const query = defineModel({ type: String, default: '' });

/**
 * Enter キーで未知のメールアドレスを追加するか、次の項目へ移動する
 * @param {KeyboardEvent} keyboardEvent キーダウンイベント
 * @returns {void}
 */
function onKeydown(keyboardEvent) {
  if (keyboardEvent.key !== 'Enter') return;
  const email = query.value.trim();
  if (email && !email.startsWith('@') && email.includes('@')) emit('add-unknown-email');
  focusNextOnEnter(keyboardEvent);
}
</script>

<template>
  <section>
    <label for="attendee-query"><span>招待するユーザー</span></label>
    <div>
      <span v-for="attendee in attendees" :key="attendee.email">
        {{ attendee.displayName || attendee.email }}
        <button type="button" :aria-label="`${attendee.email}を削除`" @click="emit('remove-attendee', attendee.email)">
          <IconXMark />
        </button>
      </span>
    </div>
    <SuggestPulldown
      v-model="query"
      input-id="attendee-query"
      :suggestions="suggestions"
      :is-searching="isSearching"
      :show-empty="!isSearching && !suggestions.length && query.trim().length > 0 && !query.includes('@')"
      :show-extra="!isSearching && !suggestions.length && query.includes('@') && !query.startsWith('@')"
      :item-key="(person) => person.resourceName"
      placeholder="名前またはメールアドレス"
      enter-focus
      @select="emit('add-attendee', $event)"
      @blur="emit('query-blur')"
      @keydown="onKeydown">
      <template #suggestion="{ item: person }">
        <span>{{ person.names?.[0]?.displayName || '名前なし' }}</span>
        <small>{{ person.emailAddresses?.[0]?.value }}</small>
      </template>
      <template #extra>
        <li>
          <button type="button" @mousedown.prevent="emit('add-unknown-email')">
            <span>メールアドレスを招待</span>
            <small>{{ query }}</small>
          </button>
        </li>
      </template>
    </SuggestPulldown>
    <p v-if="query.startsWith('@')">ラベルで検索中</p>
    <p v-else-if="query.includes('@')">Enter で未知のメールアドレスを追加</p>
  </section>
</template>

<style lang="scss" scoped>
section {
  > div {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-xs);

    > span {
      display: inline-flex;
      align-items: center;
      gap: var(--space-xs);
      max-width: 100%;
      padding: var(--space-xs) var(--space-sm);
      border: 1px solid var(--border);
      border-radius: var(--border-radius);
      background: var(--bg-2);
      overflow-wrap: anywhere;

      > button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-xxs);
        border: 0;
        background: transparent;

        &:hover {
          color: var(--danger);
        }

        svg {
          width: 0.8rem;
          height: 0.8rem;
        }
      }
    }
  }

  > p {
    margin: 0;
    color: var(--text-light);
    font-size: var(--text-size-xs);
  }
}
</style>
