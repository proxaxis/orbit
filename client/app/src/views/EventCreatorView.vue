<script setup>
import { useRouter } from 'vue-router';
import MenuBar from '@/components/MenuBar.vue';
import EventForm from '@/components/EventForm.vue';
import { useEventStore } from '@/stores/event.js';
import { useUserStore } from '@/stores/user.js';
import { usePeopleStore } from '@/stores/people.js';
import { usePhotosStore } from '@/stores/photos.js';
import IconXMark from '@/components/icons/IconXMark.vue';

const router = useRouter();
const eventStore = useEventStore();
const userStore = useUserStore();
const peopleStore = usePeopleStore();
const photosStore = usePhotosStore();

/**
 * イベントを作成する
 * @param {object} param
 * @param {object} param.body イベント作成のリクエストボディ
 * @param {string} param.calendarId イベントを作成するカレンダー
 * @param {string[]} [param.peopleToCreate] People 登録対象のメールアドレス
 * @param {GoogleCalendarAttendee[]} [param.attendees] フォームで指定された参加者
 * @param {boolean} [param.createPhotoAlbum] 写真共有アルバムを作成するか
 */
async function submit({ body, calendarId, peopleToCreate = [], attendees = [], createPhotoAlbum = false }) {
  userStore.setLoading(true, 'Creating event...');
  try {
    const event = await eventStore.createEvent(body, calendarId);
    if (!event) throw new Error('Failed to create event. No event returned.');
    userStore.rememberEventTitle(body.summary);
    if (createPhotoAlbum) {
      // イベントの作成自体は成功しているため、アルバム作成の失敗はエラー表示だけに留める
      try {
        await photosStore.ensureEventAlbum(photosStore.applySubmitBody(event, { ...body, attendees }));
      } catch (albumError) {
        userStore.setError(true, albumError);
      }
    }
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
      新しいイベントを作成します
    </MenuBar>
    <EventForm @submit="submit" @cancel="router.back()" />
  </section>
</template>

<style lang="css" scoped>
button {
  background-color: var(--bg-1);

  &:hover {
    background-color: var(--bg-2);
  }
}
</style>
