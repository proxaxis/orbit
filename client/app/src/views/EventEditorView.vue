<script setup>
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import MenuBar from '@/components/MenuBar.vue';
import EventForm from '@/components/EventForm.vue';
import { useEventStore } from '@/stores/event.js';
import { useUserStore } from '@/stores/user.js';
import IconXMark from '@/components/icons/IconXMark.vue';
import { usePeopleStore } from '@/stores/people.js';
import { usePhotosStore } from '@/stores/photos.js';

const router = useRouter();
const eventStore = useEventStore();
const userStore = useUserStore();
const peopleStore = usePeopleStore();
const photosStore = usePhotosStore();

/** @type {Ref<HandyCalendarEvent|null>} */
const event = ref(null);

onMounted(async () => {
  try {
    if (!userStore.nowSelectedEvent) throw new Error('You do not have an event selected. You must select an event to edit it.');
    userStore.setLoading(true, 'Loading the event...');
    const result = await eventStore.getEventById(userStore.nowSelectedEvent.eid, userStore.nowSelectedEvent.cid);
    if (!result) throw new Error('The event could not be found. Go back to the calendar and select a different event.');
    event.value = result;
  } catch (err) {
    userStore.setError(true, err);
  } finally {
    userStore.setLoading(false);
  }
});

/** @param {{ body: Record<string, any>, peopleToCreate?: string[], attendees?: GoogleCalendarAttendee[], createPhotoAlbum?: boolean }} payload */
async function update(payload) {
  const { body, peopleToCreate = [], attendees = [], createPhotoAlbum = false } = payload;
  try {
    if (!userStore.nowSelectedEvent) throw new Error('You do not have an event selected. You must select an event to update it.');
    userStore.setLoading(true, 'Updating the event...');
    await eventStore.updateEvent(userStore.nowSelectedEvent.eid, userStore.nowSelectedEvent.cid, body);
    userStore.rememberEventTitle(body.summary);
    if (createPhotoAlbum && event.value) {
      // イベントの更新自体は成功しているため、アルバム作成の失敗はエラー表示だけに留める
      try {
        await photosStore.ensureEventAlbum(photosStore.applySubmitBody(event.value, { ...body, attendees }));
      } catch (albumError) {
        userStore.setError(true, albumError);
      }
    }
    if (peopleToCreate.length) {
      peopleStore.setPendingRegistrationEmails(peopleToCreate);
      router.replace({ name: 'PeopleEditor' });
    } else router.replace({ name: 'EventDetail' });
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
        <h1 class="title">イベントの編集</h1>
      </template>
      <template #sub>
        <div class="menu-bar-actions">
          <button title="保存せずに戻る" @click="router.push({ name: 'Home' })">
            <IconXMark />
          </button>
        </div>
      </template>
    </MenuBar>
    <EventForm submit-label="更新する" @submit="update" @cancel="router.back()" />
  </section>
</template>

<style lang="scss" scoped>
button {
  background-color: var(--bg-1);

  &:hover {
    background-color: var(--bg-2);
  }
}
</style>
