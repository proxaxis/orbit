<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { usePeopleStore } from '@/stores/people.js';
import MenuBar from '@/components/MenuBar.vue';
import IconUserPlus from '@/components/icons/IconUserPlus.vue';
import IconXMark from '@/components/icons/IconXMark.vue';

const router = useRouter();
const peopleStore = usePeopleStore();
const savedMessage = ref('');
const errorMessage = ref('');
const isSaving = ref(false);
const people = reactive(peopleStore.pendingRegistrationEmails.map((email) => ({ email, displayName: '', phoneticName: '', birthday: '', label: '' })));

async function savePeople() {
  isSaving.value = true;
  errorMessage.value = '';
  try {
    for (const person of people) {
      if (!person.displayName.trim()) throw new Error(`${person.email} の名前を入力してください。`);
      await peopleStore.createPerson(person);
    }
    peopleStore.clearPendingRegistrationEmails();
    savedMessage.value = 'People に登録しました。';
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  } finally {
    isSaving.value = false;
  }
}

function finish() {
  peopleStore.clearPendingRegistrationEmails();
  router.replace({ name: 'EventDetail' });
}
</script>

<template>
  <section class="people-editor">
    <MenuBar>
      <template #main>
        <h1 class="title"><IconUserPlus />People に登録</h1>
      </template>
      <template #sub
        ><button type="button" title="閉じる" @click="finish">
          <IconXMark /></button
      ></template>
    </MenuBar>
    <form v-if="people.length" @submit.prevent="savePeople">
      <fieldset v-for="person in people" :key="person.email">
        <legend>{{ person.email }}</legend>
        <label>名前<input v-model="person.displayName" required /></label>
        <label>読み仮名<input v-model="person.phoneticName" placeholder="例: ホソダ ハナコ" /></label>
        <label>生年月日<input v-model="person.birthday" type="date" /></label>
        <label>ラベル<input v-model="person.label" placeholder="例: 仕事" /></label>
      </fieldset>
      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
      <p v-if="savedMessage" class="saved">{{ savedMessage }}</p>
      <div class="actions">
        <button type="button" @click="finish">スキップ</button><button data-app-button="primary" type="submit" :disabled="isSaving">{{ isSaving ? '登録中...' : '登録' }}</button>
      </div>
    </form>
    <p v-else class="empty">登録するユーザーはいません。</p>
  </section>
</template>

<style lang="scss" scoped>
.people-editor {
  width: 100%;
  padding: var(--space-md);
}

form {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  max-width: 42rem;
  margin: 0 auto;
}

fieldset {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  min-width: 0;
  padding: 0 var(--space-sm) var(--space-sm) var(--space-sm);

  legend {
    padding: 0 var(--space-xs);
    font-weight: bold;
  }
}

label {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: var(--text-size-xs);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}

.actions button {
  min-height: 2.25rem;
  padding: var(--space-xs) var(--space-sm);
}

.error {
  color: var(--danger);
}

.saved {
  color: var(--primary);
}

.empty {
  text-align: center;
  color: var(--text-light);
}
</style>
