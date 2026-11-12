<script setup>
/**
 * UserConfigView の AI 解析モデル欄。
 * クイック登録の自然言語解析に使う WebLLM モデルのインストール状態・
 * インストール日の表示と、インストール/アンインストールを担う。
 * モデルはブラウザキャッシュに約 400MB 保存され、オフラインでも AI 解析が使える。
 */
import { computed, onMounted } from 'vue';
import dayjs from '@/services/dayjs.js';
import { useUserStore } from '@/stores/user.js';
import { checkLlmModelInstalled, installLlmModel, uninstallLlmModel, llmModelInstalled, llmModelInstalledAt, quickAddEngineState } from '@/composables/useQuickAdd.js';
import IconCloudArrowDown from '@/components/icons/IconCloudArrowDown.vue';
import IconTrash from '@/components/icons/IconTrash.vue';

const userStore = useUserStore();

/** @type {import('vue').ComputedRef<boolean>} WebGPU 非対応などでモデルが利用できない環境か */
const isUnsupported = computed(() => typeof navigator === 'undefined' || !navigator.gpu || quickAddEngineState.value.status === 'unsupported');

/** @type {import('vue').ComputedRef<boolean>} モデルのダウンロード・読み込み中か */
const isInstalling = computed(() => quickAddEngineState.value.status === 'loading');

/** @type {import('vue').ComputedRef<number>} 進捗表示用のパーセント（0〜100） */
const progressPercent = computed(() => Math.min(100, Math.round((quickAddEngineState.value.progress || 0) * 100)));

/** @type {import('vue').ComputedRef<string>} 表示用のインストール日 */
const installedDate = computed(() => (llmModelInstalledAt.value ? dayjs(llmModelInstalledAt.value).format('YYYY年M月D日') : ''));

onMounted(() => {
  checkLlmModelInstalled();
});

/** モデルをインストールする（ボタン操作自体がダウンロードへの同意） */
async function install() {
  try {
    await installLlmModel();
  } catch {
    // 失敗内容は quickAddEngineState の error として表示済み
  }
}

/** 確認の上、モデルをアンインストールする */
async function uninstall() {
  const confirmed = await userStore.confirm({
    title: 'AI 解析モデルを削除',
    message: '端末に保存された AI 解析モデル（約 400MB）を削除します.\n削除後もクイック登録は簡易解析で利用できますが、AI 解析を使うには再インストールが必要です.',
  });
  if (!confirmed) return;
  try {
    await uninstallLlmModel();
    userStore.showToast('AI 解析モデルを削除しました');
  } catch (err) {
    userStore.setError(true, err);
  }
}
</script>

<template>
  <section class="config-section">
    <p class="hint">クイック登録の AI 解析に使う言語モデル（約 400MB）です. 端末にインストールすると、オフラインでも AI 解析が利用できます.</p>
    <p v-if="isUnsupported" class="hint">このブラウザは AI 解析（WebGPU）に対応していません.</p>
    <template v-else>
      <p class="llm-status">
        状態:
        <strong v-if="isInstalling">インストール中</strong>
        <strong v-else-if="llmModelInstalled === null">確認中...</strong>
        <strong v-else-if="llmModelInstalled">インストール済み</strong>
        <strong v-else>未インストール</strong>
      </p>
      <p v-if="!isInstalling && llmModelInstalled && installedDate" class="hint">インストール日: {{ installedDate }}</p>
      <template v-if="isInstalling">
        <div class="llm-progress">
          <progress class="llm-progress-bar" :value="quickAddEngineState.progress" max="1" />
          <span class="llm-progress-text">{{ progressPercent }}%</span>
        </div>
        <p class="hint">{{ quickAddEngineState.message }}</p>
      </template>
      <p v-else-if="quickAddEngineState.status === 'error'" class="hint">インストールに失敗しました: {{ quickAddEngineState.message }}</p>
      <button v-if="llmModelInstalled" type="button" class="llm-button" :disabled="isInstalling" @click="uninstall"><IconTrash />アンインストール</button>
      <button v-else type="button" class="llm-button" :disabled="isInstalling || llmModelInstalled === null" @click="install"><IconCloudArrowDown />インストール</button>
    </template>
  </section>
</template>

<style lang="scss" scoped>
.hint {
  font-size: var(--text-size-xs);
}
.llm-status {
  margin: 0;
}
.llm-progress {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.llm-progress-bar {
  flex: 1;
  height: 0.5rem;
  accent-color: var(--primary);
}
.llm-progress-text {
  font-size: var(--text-size-xs);
  color: var(--text-light);
  min-width: 3em;
  text-align: right;
}
.llm-button {
  align-self: flex-start;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border: 1px solid var(--border);
  border-radius: var(--border-radius);

  &:hover {
    background-color: var(--bg-2);
  }
}
</style>
