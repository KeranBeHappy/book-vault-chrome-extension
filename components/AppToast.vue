<script setup lang="ts">
import { useFeedbackStore } from '@/stores/feedback';

const feedback = useFeedbackStore();
</script>

<template>
  <div class="bv-toasts" role="status" aria-live="polite">
    <div
      v-for="toast in feedback.toasts"
      :key="toast.id"
      class="bv-toast"
      :class="`bv-toast--${toast.kind}`"
      @click="feedback.toasts = feedback.toasts.filter((item) => item.id !== toast.id)"
    >
      {{ toast.text }}
    </div>
  </div>
</template>

<style scoped>
.bv-toasts {
  position: fixed;
  right: var(--bv-space-4);
  bottom: var(--bv-space-4);
  z-index: var(--bv-z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--bv-space-2);
  max-width: 380px;
  pointer-events: none;
}

.bv-toast {
  padding: var(--bv-space-2) var(--bv-space-3);
  font-size: var(--bv-font-size-sm);
  line-height: 1.5;
  color: var(--bv-text);
  cursor: pointer;
  background: var(--bv-surface);
  border: 1px solid var(--bv-border);
  border-left: 3px solid var(--bv-accent);
  border-radius: var(--bv-radius-sm);
  box-shadow: var(--bv-shadow-2);
  pointer-events: auto;
}

.bv-toast--success {
  border-left-color: var(--bv-ok);
}

.bv-toast--error {
  border-left-color: var(--bv-danger);
}

.bv-toast--warn {
  border-left-color: var(--bv-suspect);
}
</style>
