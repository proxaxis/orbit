<script setup>
import { useRouter } from 'vue-router';
import MenuBar from '@/components/MenuBar.vue';
import EventForm from '@/components/EventForm.vue';
import { useEventStore } from '@/stores/event.js';
import { useUserStore } from '@/stores/user.js';
import { usePeopleStore } from '@/stores/people.js';
import IconXMark from '@/components/icons/IconXMark.vue';

const router = useRouter();
const eventStore = useEventStore();
const userStore = useUserStore();
const peopleStore = usePeopleStore();

/**
 * イベントを作成する
 * @param {object} param
 * @param {object} param.body イベント作成のリクエストボディ
 * @param {string} param.calendarId イベントを作成するカレンダー
 */
async function submit({ body, calendarId, peopleToCreate = [] }) {
  userStore.setLoading(true, 'Creating event...');
  try {
    const event = await eventStore.createEvent(body, calendarId);
    if (!event) throw new Error('Failed to create event. No event returned.');
    userStore.rememberEventTitle(body.summary);
    if (peopleToCreate.length) {
      peopleStore.setPendingRegistrationEmails(peopleToCreate);
      router.push({ name: 'PeopleEditor' });
    } else router.push({ name: 'EventDetail' });
  } catch (err) {
    userStore.setError(true, err);
  } finally {
    userStore.setLoading(false);
  }
}
</script>

<template>
  <section class="event-view">
    <MenuBar>
      <template #main>
        <h1 class="title">イベント作成</h1>
      </template>
      <template #sub>
        <div class="menu-bar-actions">
          <button title="閉じる" @click="router.push({ name: 'Home' })">
            <IconXMark />
          </button>
        </div>
      </template>
      新しいイベント（予定）を作成します
    </MenuBar>
    <EventForm @submit="submit" @cancel="router.back()" />
  </section>
</template>
