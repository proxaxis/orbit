<script setup>
const props = defineProps({
  size: {
    type: String,
    default: '1rem',
  },
});
</script>

<template>
  <svg class="icons icon-magnifying-glass" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" :width="props.size" :height="props.size">
    <!--!Font Awesome Free v7.1.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2026 Fonticons, Inc.!-->
    <path d="M520 260C520 317.4 501.4 370.4 470 413.4L628.3 571.8C643.9 587.4 643.9 612.8 628.3 628.4S587.3 644 571.7 628.4L413.4 470C370.4 501.5 317.4 520 260 520C116.4 520 0 403.6 0 260S116.4 0 260 0S520 116.4 520 260ZM260 440A180 180 0 1 0 260 80A180 180 0 1 0 260 440Z" />
  </svg>
</template>
