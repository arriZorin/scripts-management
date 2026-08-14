<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    class="h-6 w-6 shrink-0 stroke-current"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      :d="path"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ kind: 'info' | 'success' | 'warning' | 'error' }>()

const paths: Record<typeof props.kind, string> = {
  info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  warning: 'M8.485 3.495c.673-1.167 2.357-1.167 3.03 0l6.358 11.018c.673 1.167-.17 2.625-1.516 2.625H3.643c-1.346 0-2.189-1.458-1.516-2.625L8.485 3.495zM12 8v4m0 4h.01',
  error: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
}

const path = computed(() => paths[props.kind])
</script>
