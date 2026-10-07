<script setup>
import { computed } from 'vue';
import twemoji from '@twemoji/api';

const props = defineProps({
  emoji: {
    type: String,
    required: true,
  },
});

const emo = computed(() => twemoji.parse(props.emoji, { size: '72x72', folder: 'svg', ext: '.svg' }));
</script>

<template>
  <span class="inline-emoji" v-html="emo" />
</template>

<style lang="scss" scoped>
:deep(img.emoji) {
  height: 1em;
  width: 1em;
  margin: 0 0.05em 0 0.1em;
  vertical-align: -0.1em;
  display: inline-block;
}
</style>
