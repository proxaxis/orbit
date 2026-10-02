<script setup>
import { computed, onMounted, ref } from 'vue';
import dayjs from 'dayjs';
import { useRoute, useRouter } from 'vue-router';
import MenuBar from '@/components/MenuBar.vue';
import IconPen from '@/components/icons/IconPen.vue';
import IconTrash from '@/components/icons/IconTrash.vue';
import IconLocationDot from '@/components/icons/IconLocationDot.vue';
import { useEventStore } from '@/stores/event.js';

const route = useRoute();
const router = useRouter();
const eventStore = useEventStore();
const event = ref(null);
const calendar = ref(null);
const loading = ref(true);
const error = ref('');
const deleting = ref(false);

const dateText = computed(() => {
  if (!event.value) return '';
  if (event.value.start.date) return `${event.value.start.date} - ${dayjs(event.value.end.date).subtract(1, 'day').format('YYYY-MM-DD')}`;
  return `${dayjs(event.value.start.dateTime).format('YYYY-MM-DD HH:mm')} - ${dayjs(event.value.end.dateTime).format('YYYY-MM-DD HH:mm')}`;
});

onMounted(async () => {
  try {
    const result = await eventStore.findEvent(route.params.id);
    if (!result) throw new Error('予定が見つかりません。');
    event.value = result.event;
    calendar.value = result.calendar;
  } catch (err) {
    error.value = err.message || '予定を読み込めませんでした。';
  } finally {
    loading.value = false;
  }
});

const remove = async () => {
  if (!calendar.value || !window.confirm('この予定を削除しますか？')) return;
  deleting.value = true;
  try {
    await eventStore.removeEvent(route.params.id, calendar.value.id);
    router.replace({ name: 'Home' });
  } catch (err) {
    error.value = err.message || '予定を削除できませんでした。';
  } finally {
    deleting.value = false;
  }
};
</script>

<template>
  <section class="event-view">
    <MenuBar>
      <template #main>
        <h1 class="title">予定の詳細</h1>
      </template>
      <template #sub>
        <div class="actions">
          <button title="編集" @click="router.push({ name: 'EventEditor', params: { id: route.params.id } })">
            <IconPen />編集
          </button>
          <button title="削除" class="danger" :disabled="deleting" @click="remove">
            <IconTrash />削除
          </button>
        </div>
      </template>
    </MenuBar>
    <p v-if="loading">読み込み中...</p>
    <p v-else-if="error" class="error">{{ error }}</p>
    <article v-else class="event-detail">
      <div class="event-heading"><span class="emoji">{{ event.icon || '📅' }}</span>
        <div>
          <h2>{{ event.summary }}</h2>
          <p>{{ calendar?.summaryOverride || calendar?.summary }}</p>
        </div>
      </div>
      <dl>
        <div>
          <dt>日時</dt>
          <dd>{{ dateText }}<span v-if="event.start.timeZone"> ({{ event.start.timeZone }})</span></dd>
        </div>
        <div v-if="event.location">
          <dt>場所</dt>
          <dd>
            <IconLocationDot />{{ event.location }}
          </dd>
        </div>
        <div v-if="event.description">
          <dt>説明</dt>
          <dd class="description">{{ event.description }}</dd>
        </div>
      </dl>
    </article>
  </section>
</template>

<style lang="scss" scoped>
.event-view {
  width: 100%;
  // overflow-y: auto;
}

.actions {
  display: flex;
  gap: .7rem;
}

.actions button {
  gap: .3rem;
  font-size: .95rem;
}

.actions .danger {
  color: var(--danger);
}

.event-detail {
  background: var(--bg-1);
  border-radius: var(--border-radius);
}

.event-heading {
  display: flex;
  gap: 0.2rem;
  align-items: center;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--border);
}

.emoji {
  font-size: 2.5rem;
}

.event-heading h2 {
  margin-bottom: .25rem;
}

.event-heading p,
dt {
  color: var(--text-light);
  font-size: .9rem;
}

dl {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 1.5rem;
}

dl div {
  display: grid;
  grid-template-columns: 5rem 1fr;
  gap: 1rem;
}

dd {
  white-space: pre-wrap;
}

.description {
  line-height: 1.7;
}

.error {
  color: var(--danger);
}
</style>
