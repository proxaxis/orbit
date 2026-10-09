<script setup>
/**
 * 自然言語によるイベント登録画面。
 * 入力文を正規化 → 日時は正規表現で抽出・意味部分は WebLLM で解析 → イベントフォームへ流し込む。
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user.js';
import { parseScheduleText, setQuickAddDraft, quickAddEngineState } from '@/composables/useQuickAdd.js';
import MenuBar from '@/components/MenuBar.vue';
import IconXMark from '@/components/icons/IconXMark.vue';
import IconWandMagicSparkles from '@/components/icons/IconWandMagicSparkles.vue';

const router = useRouter();
const userStore = useUserStore();

/** @type {Ref<string>} 自然言語登録の入力 */
const quickAddText = ref('');
/** @type {Ref<boolean>} 自然言語登録の実行中かどうか */
const isQuickAdding = ref(false);

/**
 * 自然言語テキストを解析し、結果をドラフトとしてイベント作成フォームへ流し込む。
 * 直接登録はせず、フォームで内容を確認・修正してから保存する。
 */
async function runQuickAdd() {
  const text = quickAddText.value.trim();
  if (!text || isQuickAdding.value) return;
  isQuickAdding.value = true;
  try {
    const { draft, usedFallback } = await parseScheduleText(text);
    if (usedFallback) userStore.showToast('AI 解析を利用できないため、簡易解析で入力しました');
    setQuickAddDraft(draft);
    router.push({ name: 'EventCreator' });
  } catch (err) {
    userStore.setError(true, err);
  } finally {
    isQuickAdding.value = false;
  }
}
</script>

<template>
  <div class="event-quick-add-view">
    <MenuBar :useMobilePadding="userStore.isMobile">
      <template #center>
        <h2 class="title">自然言語で登録</h2>
      </template>
      <template #sub>
        <button type="button" class="icon-x-mark-wrapper" title="閉じる" aria-label="閉じる" @click="router.push({ name: 'Home' })">
          <IconXMark />
        </button>
      </template>
      日時と予定を文章で入力してください（例: 明日の15時に歯医者）
    </MenuBar>

    <form class="quick-add-form" @submit.prevent="runQuickAdd">
      <input v-model="quickAddText" placeholder="例: 明日の15時に歯医者" aria-label="自然言語での予定登録" autofocus />
      <button type="submit" data-app-button="primary" :disabled="isQuickAdding || !quickAddText.trim()" title="登録" aria-label="登録"><IconWandMagicSparkles /> 登録</button>
    </form>

    <p v-if="isQuickAdding" class="quick-add-status">解析中...</p>
    <p v-else-if="quickAddEngineState.status === 'loading'" class="quick-add-status">AIモデル読込中: {{ quickAddEngineState.message }}</p>
    <p v-else-if="quickAddEngineState.status === 'unsupported'" class="quick-add-status">このブラウザは AI 解析（WebGPU）に対応していないため、簡易解析で登録します</p>
  </div>
</template>

<style lang="scss" scoped>
.event-quick-add-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.quick-add-form {
  display: flex;
  gap: var(--space-xs);
  padding: var(--space-xs) 0;

  input {
    flex: 1;
    min-width: 0;
  }

  button {
    display: flex;
    align-items: center;
    gap: var(--space-xxs);
    white-space: nowrap;
  }
}

.quick-add-status {
  padding: var(--space-sm);
  color: var(--text-light);
  text-align: center;
}

.icon-x-mark-wrapper {
  background-color: var(--bg-1);
  &:hover {
    background-color: var(--bg-2);
  }
}
</style>
