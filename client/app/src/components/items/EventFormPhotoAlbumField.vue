<script setup>
/**
 * EventForm の写真アルバム設定欄。
 * 既存アルバムへのリンク表示、または保存時にアルバムを作成するチェックボックスを担う。
 */
import IconImage from '@/components/icons/IconImage.vue';
import IconArrowUpRightFromSquare from '@/components/icons/IconArrowUpRightFromSquare.vue';

const props = defineProps({
  /** @type {import('vue').PropType<OrbitEventPhotoAlbum|null>} イベントに紐づく既存の共有アルバム */
  existingAlbum: { type: Object, default: null },
  /** 招待済み参加者の人数（ヒント文の出し分け用） */
  attendeesCount: { type: Number, default: 0 },
});

/** @type {ModelRef<boolean>} 保存時に写真アルバムを作成するか */
const createPhotoAlbum = defineModel({ type: Boolean, default: false });

function goAlbumLink() {
  if (!props.existingAlbum?.productUrl) return;
  window.open(props.existingAlbum.productUrl, '_blank', 'noopener,noreferrer');
}
</script>

<template>
  <div class="photo-album-field" @click="goAlbumLink">
    <template v-if="props.existingAlbum">
      <p class="photo-album-hint">この予定にはアルバムが作成されています.</p>
      <a v-if="props.existingAlbum.productUrl" :href="props.existingAlbum.productUrl" target="_blank" rel="noopener noreferrer" class="photo-album-link"><IconArrowUpRightFromSquare size="0.8rem" /> アルバムを開く</a>
    </template>
    <template v-else>
      <label class="photo-album-check"><input v-model="createPhotoAlbum" type="checkbox" />保存時に写真アルバムを作成する</label>
      <p class="photo-album-hint">この予定の写真をまとめるアルバムを Google フォトに作成します.{{ attendeesCount ? ' 参加者と共有するには、作成後に Google フォトで共有設定を行ってください.' : '' }}</p>
    </template>
  </div>
</template>

<style lang="scss" scoped>
.photo-album-field {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--border-radius);
  padding-left: var(--space-sm);
  background-color: var(--bg-2);
  transition: background-color 0.2s ease-in-out;
  cursor: pointer;
  background-color: var(--bg-3);
  &:hover {
    background-color: var(--bg-4);
  }
}

.photo-album-check {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  cursor: pointer;
}

.photo-album-hint {
  margin: 0;
  font-size: var(--text-size-xs);
}

.photo-album-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xxs);
  width: fit-content;
  font-size: var(--text-size-xs);
}
</style>
