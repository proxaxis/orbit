<script setup>
/**
 * 自然言語によるイベント登録画面。
 * 入力文を正規化 → 日時は正規表現で抽出・意味部分は WebLLM で解析 → イベントフォームへ流し込む。
 * 入力ボックスは半透明のフローティングカードとしてカレンダーグリッド上に重なって表示されるため、
 * カレンダーを見ながら日時を考えて入力できる。
 */
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useUserStore } from '@/stores/user.js';
import { parseScheduleText, setQuickAddDraft, quickAddEngineState } from '@/composables/useQuickAdd.js';
import MenuBar from '@/components/MenuBar.vue';
import IconXMark from '@/components/icons/IconXMark.vue';
import IconWandMagicSparkles from '@/components/icons/IconWandMagicSparkles.vue';

const router = useRouter();
const userStore = useUserStore();

const props = defineProps({
  selectPane: { type: Function, default: () => {} },
  collapseMobileSubPane: { type: Function, default: () => {} },
});

/** @type {Ref<string>} 自然言語登録の入力 */
const quickAddText = ref('');
/** @type {Ref<boolean>} 自然言語登録の実行中かどうか */
const isQuickAdding = ref(false);

// フローティング表示のため、このルートではモバイルでも中央ペイン（カレンダーグリッド）を背面に表示する。
// カードは body へ Teleport するため sub ペインの収納 CSS の影響を受けない。
// 空になったモバイル下部ペインは HomeLayout 側で非表示にする。
onMounted(() => {
  props.selectPane('main');
});

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
  <!-- sub ペイン内に置くと収納時の CSS（.menu-bar ~ * の非表示）や高さ計測の対象になってしまうため body へ逃がす -->
  <Teleport to="body">
    <div class="event-quick-add-view">
      <div class="quick-add-card">
        <MenuBar :useMobilePadding="userStore.isMobile">
          <template #center>
            <h2 class="title">自然言語で登録</h2>
          </template>
          <template #sub>
            <button type="button" class="icon-x-mark-wrapper" title="閉じる" aria-label="閉じる" @click="router.push({ name: 'Home' })">
              <IconXMark />
            </button>
          </template>
          日時と予定を文章で入力することができます
        </MenuBar>

        <form class="quick-add-form" @submit.prevent="runQuickAdd">
          <input v-model="quickAddText" placeholder="明日の15時に歯医者" aria-label="自然言語での予定登録" autofocus />
          <button type="submit" data-app-button="primary" :disabled="isQuickAdding || !quickAddText.trim()" title="登録" aria-label="登録"><IconWandMagicSparkles /> 登録</button>
        </form>

        <p v-if="isQuickAdding" class="quick-add-status">解析中...</p>
        <p v-else-if="quickAddEngineState.status === 'loading'" class="quick-add-status">AIモデル読込中: {{ quickAddEngineState.message }}</p>
        <p v-else-if="quickAddEngineState.status === 'unsupported'" class="quick-add-status">このブラウザは AI 解析（WebGPU）に対応していないため、簡易解析で登録します</p>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
// カレンダーグリッドの上にフローティングさせる。
// カード外はポインタイベントを通すため、背面のグリッドをそのまま見ながら入力できる
.event-quick-add-view {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
  pointer-events: none;
}

.quick-add-card {
  pointer-events: auto;
  width: min(560px, calc(100vw - var(--space-md) * 2));
  padding: var(--space-xs) var(--space-sm) var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  background-color: color-mix(in srgb, var(--bg-1) 78%, transparent);
  -webkit-backdrop-filter: blur(10px);
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 32px rgb(0 0 0 / 0.28);
}

/* タッチ端末（モバイル）のGPUではスクロール連動のブラーが重いため、
   backdrop-filter を解除して代わりに不透明度を上げる */
@media (hover: none), (pointer: coarse) {
  .quick-add-card {
    background-color: color-mix(in srgb, var(--bg-1) 94%, transparent);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}

.quick-add-form {
  display: flex;
  gap: var(--space-xs);
  padding: var(--space-xs) 0;

  input {
    flex: 1;
    min-width: 0;
    background-color: color-mix(in srgb, var(--bg-1) 55%, transparent);
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
  background-color: transparent;
  &:hover {
    background-color: var(--bg-2);
  }
}
</style>
