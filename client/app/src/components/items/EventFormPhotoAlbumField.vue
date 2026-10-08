<script setup>
/**
 * EventForm の写真アルバム設定欄。
 * 既存アルバムへのリンク表示、または保存時にアルバムを作成するチェックボックスを担う。
 */
import IconImage from '@/components/icons/IconImage.vue';
import IconArrowUpRightFromSquare from '@/components/icons/IconArrowUpRightFromSquare.vue';

defineProps({
  /** @type {import('vue').PropType<OrbitEventPhotoAlbum|null>} イベントに紐づく既存の共有アルバム */
  existingAlbum: { type: Object, default: null },
  /** 招待済み参加者の人数（ヒント文の出し分け用） */
  attendeesCount: { type: Number, default: 0 },
});

/** @type {ModelRef<boolean>} 保存時に写真アルバムを作成するか */
const createPhotoAlbum = defineModel({ type: Boolean, default: false });
</script>

<template>
  <section>
    <span><IconImage size="0.8rem" /> 写真アルバム</span>
    <template v-if="existingAlbum">
      <p class="photo-album-hint">この予定にはアルバムが作成されています.</p>
      <a v-if="existingAlbum.productUrl" :href="existingAlbum.productUrl" target="_blank" rel="noopener noreferrer" class="photo-album-link"><IconArrowUpRightFromSquare /> アルバムを開く</a>
    </template>
    <template v-else>
      <label class="photo-album-check"><input v-model="createPhotoAlbum" type="checkbox" />保存時に写真アルバムを作成する</label>
      <p class="photo-album-hint">この予定の写真をまとめるアルバムを Google フォトに作成します.{{ attendeesCount ? ' 参加者と共有するには、作成後に Google フォトで共有設定を行ってください.' : '' }}</p>
    </template>
  </section>
</template>

<style lang="scss" scoped>
section {
  gap: var(--space-xs);

  > span {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
  }
}

.photo-album-check {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.photo-album-hint {
  margin: 0;
  color: var(--text-light);
  font-size: var(--text-size-xs);
}

.photo-album-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xxs);
  width: fit-content;
  font-size: var(--text-size-xs);

  svg {
    width: 0.8rem;
    height: 0.8rem;
  }
}
</style>
