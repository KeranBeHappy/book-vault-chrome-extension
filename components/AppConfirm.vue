<script setup lang="ts">
import { ref, watch } from 'vue';

import { t } from '@/modules/i18n';
import { useFeedbackStore } from '@/stores/feedback';

const feedback = useFeedbackStore();
const acked = ref(false);

// 每次打开新确认框都重置勾选状态
watch(
  () => feedback.confirm,
  () => {
    acked.value = false;
  },
);
</script>

<template>
  <div v-if="feedback.confirm" class="bv-mask" @click.self="feedback.answer(false)">
    <section class="bv-confirm" role="dialog" aria-modal="true">
      <h2 class="bv-confirm__title">{{ feedback.confirm.title }}</h2>
      <p class="bv-confirm__message">{{ feedback.confirm.message }}</p>

      <ul v-if="feedback.confirm.details?.length" class="bv-confirm__details">
        <li v-for="(line, index) in feedback.confirm.details" :key="index">{{ line }}</li>
      </ul>

      <label v-if="feedback.confirm.requireAck" class="bv-confirm__ack">
        <input v-model="acked" type="checkbox" />
        <span>{{ feedback.confirm.requireAck }}</span>
      </label>

      <footer class="bv-confirm__actions">
        <button class="bv-btn" type="button" @click="feedback.answer(false)">
          {{ t('actionCancel') }}
        </button>
        <button
          class="bv-btn"
          :class="feedback.confirm.danger ? 'bv-btn--danger' : 'bv-btn--primary'"
          type="button"
          :disabled="Boolean(feedback.confirm.requireAck) && !acked"
          @click="feedback.answer(true)"
        >
          {{ feedback.confirm.confirmText ?? t('actionConfirm') }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.bv-mask {
  position: fixed;
  inset: 0;
  z-index: var(--bv-z-dialog);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bv-overlay);
}

.bv-confirm {
  width: 460px;
  max-width: calc(100vw - 32px);
  padding: var(--bv-space-5);
  background: var(--bv-surface);
  border: 1px solid var(--bv-border);
  border-radius: var(--bv-radius-md);
  box-shadow: var(--bv-shadow-3);
}

.bv-confirm__title {
  margin-bottom: var(--bv-space-2);
  font-size: var(--bv-font-size-lg);
  font-weight: 600;
}

.bv-confirm__message {
  color: var(--bv-text);
  font-size: var(--bv-font-size-sm);
  line-height: 1.7;
}

.bv-confirm__details {
  padding-left: var(--bv-space-4);
  margin: var(--bv-space-3) 0 0;
  color: var(--bv-text-secondary);
  font-size: var(--bv-font-size-sm);
  line-height: 1.8;
}

.bv-confirm__ack {
  display: flex;
  gap: var(--bv-space-2);
  align-items: flex-start;
  margin-top: var(--bv-space-3);
  color: var(--bv-danger);
  font-size: var(--bv-font-size-sm);
  line-height: 1.6;
}

.bv-confirm__actions {
  display: flex;
  gap: var(--bv-space-2);
  justify-content: flex-end;
  margin-top: var(--bv-space-4);
}
</style>
