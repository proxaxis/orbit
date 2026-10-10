<script setup>
/**
 * カレンダーツールバーの年月表示。
 * テキストをクリックすると入力ボックスと検索ボタンに変化し、YYYYMM 形式で
 * 年月を指定してその月（週表示ではその月の最初の週）へジャンプできる。
 * 入力中は YYYY と MM の間に自動でスペースを挿入する。
 */
import { nextTick, ref } from "vue";
import { useUserStore } from "@/stores/user.js";
import { toDayjs } from "@/services/dayjs.js";
import IconMagnifyingGlass from "@/components/icons/IconMagnifyingGlass.vue";

const props = defineProps({
  /** 表示中の年月テキスト */
  label: { type: String, required: true },
});

const userStore = useUserStore();

/** @type {Ref<boolean>} 年月指定モードかどうか */
const isEditing = ref(false);
/** @type {Ref<string>} 入力値（YYYY MM 形式に自動整形される） */
const jumpInput = ref("");
/** @type {Ref<HTMLInputElement|null>} */
const rfJumpInput = ref(null);

/** 年月指定モードを開始し、入力ボックスへフォーカスする */
async function startEditing() {
  isEditing.value = true;
  jumpInput.value = "";
  await nextTick();
  rfJumpInput.value?.focus();
}

/** 年月指定モードを終了してテキスト表示へ戻る */
function stopEditing() {
  isEditing.value = false;
  jumpInput.value = "";
}

/**
 * 入力値を数字のみに整形し、YYYY と MM の間にスペースを挿入する（最大6桁）
 * @param {Event} evt 入力イベント
 */
function handleInput(evt) {
  const digits = evt.target.value.replace(/\D/g, "").slice(0, 6);
  const formatted =
    digits.length > 4 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : digits;
  jumpInput.value = formatted;
  evt.target.value = formatted;
}

/** 入力された年月へジャンプする。月表示はその月、週表示は1日を含む週（その月の最初の週）へ */
function submitJump() {
  const digits = jumpInput.value.replace(/\D/g, "");
  const year = parseInt(digits.slice(0, 4), 10);
  const month = parseInt(digits.slice(4, 6), 10);
  if (
    digits.length < 5 ||
    !(year >= 1000 && year <= 9999) ||
    !(month >= 1 && month <= 12)
  ) {
    userStore.showToast("YYYYMM 形式で年月を入力してください（例: 202612）");
    return;
  }
  const target = toDayjs(`${year}-${String(month).padStart(2, "0")}-01`);
  // 週表示は weekStart が nowUsingDate から導かれるため、1日を置けばその月の最初の週になる
  userStore.setNowUsingDate(target);
  userStore.setNowSelectedDate(target);
  stopEditing();
}
</script>

<template>
  <h1
    v-if="!isEditing"
    class="year-month-title"
    title="クリックして年月を指定"
    @click="startEditing"
  >
    {{ props.label }}
  </h1>
  <form v-else class="year-month-jump" @submit.prevent="submitJump">
    <input
      ref="rfJumpInput"
      :value="jumpInput"
      inputmode="numeric"
      autocomplete="off"
      placeholder="YYYYMM"
      aria-label="年月を入力（YYYYMM）"
      @input="handleInput"
      @keydown.esc.prevent="stopEditing"
      @blur="stopEditing"
    />
    <button
      type="submit"
      title="その年月へ移動"
      aria-label="その年月へ移動"
      @mousedown.prevent
    >
      <IconMagnifyingGlass size="1.25rem" />
    </button>
  </form>
</template>

<style lang="scss" scoped>
.year-month-title {
  cursor: pointer;
  border-radius: var(--border-radius);

  &:hover {
    background-color: var(--bg-2);
  }
}

.year-month-jump {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xxs);

  input {
    width: 5.5em;
    padding: var(--space-xxs) var(--space-xs);
    font-size: 1em;
    text-align: center;
  }

  button {
    display: flex;
    align-items: center;
    padding: var(--space-xxs);
    border-radius: var(--border-radius);

    &:hover {
      background-color: var(--bg-2);
    }
  }
}
</style>
