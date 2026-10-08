<script setup>
/**
 * イベントフォームから呼び出すテンプレート保存ダイアログ。
 * テンプレート名（必須）と説明を入力して保存する。
 */
import { ref } from 'vue';
import IconXMark from '@/components/icons/IconXMark.vue';

const emit = defineEmits(['save', 'cancel']);

/** @type {Ref<string>} テンプレート名 */
const name = ref('');
/** @type {Ref<string>} テンプレートの説明 */
const description = ref('');

/** 入力内容を確定して保存イベントを発行する */
function submitTemplate() {
  const trimmedName = name.value.trim();
  if (!trimmedName) return;
  emit('save', { name: trimmedName, description: description.value.trim() });
}
</script>

<template>
  <div class="template-save-dialog-backdrop" @click.self="emit('cancel')">
    <section class="template-save-dialog" role="dialog" aria-label="テンプレートとして保存">
      <header>
        <h3>テンプレートとして保存</h3>
        <button type="button" title="閉じる" aria-label="閉じる" @click="emit('cancel')">
          <IconXMark />
        </button>
      </header>
      <label>
        <span>テンプレート名</span>
        <input v-model="name" autofocus required placeholder="テンプレートの名前を入力" @keydown.enter.prevent="submitTemplate" />
      </label>
      <label>
        <span>説明</span>
        <textarea v-model="description" rows="3" placeholder="テンプレートの説明（任意）"></textarea>
      </label>
      <footer>
        <button data-app-button="secondary" type="button" @click="emit('cancel')">キャンセル</button>
        <button data-app-button="primary" type="button" :disabled="!name.trim()" @click="submitTemplate">保存</button>
      </footer>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.template-save-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  padding: var(--space-md);
}

.template-save-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  width: 100%;
  max-width: 420px;
  padding: var(--space-md);
  border-radius: var(--border-radius);
  background: var(--bg-1);
  box-shadow: 0 2px 12px var(--shadow);

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;

    h3 {
      font-size: var(--text-size-md);
    }

    button {
      background: var(--bg-1);

      &:hover {
        background: var(--bg-2);
      }
    }
  }

  label {
    display: flex;
    flex-direction: column;

    > span {
      font-size: var(--text-size-xxs);
    }

    textarea {
      resize: vertical;
    }
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-sm);
  }
}
</style>
