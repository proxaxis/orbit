<script setup>
/**
 * 保存済みイベントテンプレートの一覧・選択画面。
 * カレンダーセルのコンテキストメニューから開き、テンプレートを選択してイベント作成へ進む。
 */
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import MenuBar from '@/components/MenuBar.vue';
import InlineEmoji from '@/components/InlineEmoji.vue';
import IconXMark from '@/components/icons/IconXMark.vue';
import IconTrash from '@/components/icons/IconTrash.vue';
import { useUserStore } from '@/stores/user.js';
import { useEventTemplates } from '@/composables/useEventTemplates.js';

const router = useRouter();
const userStore = useUserStore();
const { templates, ensureLoaded, removeTemplate: removeTemplateById } = useEventTemplates();

/**
 * テンプレートを選択してイベント作成画面へ遷移する
 * @param {OrbitEventTemplate} template 選択されたテンプレート
 */
function selectTemplate(template) {
  router.push({ name: 'EventCreator', query: { template: template.id } });
}

/**
 * テンプレートを削除する
 * @param {OrbitEventTemplate} template 削除するテンプレート
 */
async function removeTemplate(template) {
  if (!(await userStore.confirm({ title: 'テンプレートの削除', message: `テンプレート「${template.name}」を削除しますか？` }))) return;
  await removeTemplateById(template.id);
  userStore.showToast('テンプレートを削除しました');
}

onMounted(async () => {
  await ensureLoaded();
});
</script>

<template>
  <section class="event-template-picker-view">
    <MenuBar>
      <template #main>
        <h1 class="title">テンプレートから作成</h1>
      </template>
      <template #sub>
        <div class="menu-bar-actions">
          <button title="閉じる" @click="router.push({ name: 'Home' })">
            <IconXMark />
          </button>
        </div>
      </template>
      保存したテンプレートを選んでイベントを作成します
    </MenuBar>

    <ul v-if="templates.length" class="template-list">
      <li v-for="template in templates" :key="template.id">
        <button type="button" class="template-item" @click="selectTemplate(template)">
          <InlineEmoji :emoji="template.event.icon || '📋'" />
          <div class="template-item-text">
            <span class="template-item-name">{{ template.name }}</span>
            <span class="template-item-description">{{ template.description || template.event.summary }}</span>
          </div>
        </button>
        <button type="button" class="template-item-delete" title="テンプレートを削除" :aria-label="`テンプレート「${template.name}」を削除`" @click="removeTemplate(template)">
          <IconTrash />
        </button>
      </li>
    </ul>
    <p v-else class="template-empty">保存されたテンプレートがありません。イベントフォームの「テンプレートとして保存」から追加できます。</p>
  </section>
</template>

<style lang="scss" scoped>
.event-template-picker-view {
  display: flex;
  flex-direction: column;
  height: 100%;

  button {
    background-color: var(--bg-1);

    &:hover {
      background-color: var(--bg-2);
    }
  }
}

.template-list {
  display: flex;
  flex-direction: column;
  margin: var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  background: var(--bg-1);
  overflow: hidden;

  li {
    display: flex;
    align-items: stretch;

    &:not(:last-child) {
      border-bottom: 1px solid var(--border);
    }
  }

  .template-item {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex: 1;
    min-width: 0;
    padding: var(--space-sm) var(--space-md);
    text-align: left;
    border-radius: 0;

    .template-item-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .template-item-name {
      font-size: var(--text-size-md);
      font-weight: bold;
    }

    .template-item-description {
      font-size: var(--text-size-xs);
      color: var(--text-light);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  }

  .template-item-delete {
    padding: var(--space-sm) var(--space-md);
    border-radius: 0;
    color: var(--danger);
  }
}

.template-empty {
  margin: var(--space-md);
  font-size: var(--text-size-sm);
  color: var(--text-light);
}
</style>
