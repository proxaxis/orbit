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
    <SuggestPulldown
      v-model="query"
      input-id="attendee-query"
      :suggestions="suggestions"
      :is-searching="isSearching"
      :show-empty="!isSearching && !suggestions.length && query.trim().length > 0 && !query.includes('@')"
      :show-extra="!isSearching && !suggestions.length && query.includes('@') && !query.startsWith('@')"
      :item-key="(person) => person.resourceName"
      placeholder="名前またはメールアドレス"
      :aria-label="'ユーザーを招待する'"
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
          <button type="button" @mousedown.prevent="emit('add-unknown-email')">このメールアドレスを招待</button>
        </li>
      </template>
    </SuggestPulldown>
    <p v-if="query.startsWith('@')">ラベルで検索中</p>
    <p v-else-if="query.includes('@')">Enter で未知のメールアドレスを追加</p>
    <fieldset aria-label="招待済み参加者" v-if="attendees.length > 0">
      <legend>招待リスト</legend>
      <button v-for="attendee in attendees" :key="attendee.email" type="button" :aria-label="`${attendee.email}を削除`" @click="emit('remove-attendee', attendee.email)">
        <span>{{ attendee.displayName || attendee.email }}</span>
        <IconXMark />
      </button>
    </fieldset>
  </section>
</template>

<style lang="scss" scoped>
section {
  > label {
    font-size: var(--text-size-xs);
  }

  :deep(input) {
    background-color: var(--bg-3);
  }

  fieldset {
    padding: 0 var(--space-sm) var(--space-sm) var(--space-sm);
    border: 1px solid var(--border);
    border-radius: var(--border-radius);
    min-width: 0;
    display: flex;
    gap: var(--space-xs);
    flex-direction: column;

    legend {
      font-size: var(--text-size-xs);
      padding: 0 var(--space-xs);
    }

    button {
      justify-content: space-between;

      &:hover {
        background-color: var(--bg-3);
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
