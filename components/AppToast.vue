<script setup lang="ts">
import { computed } from 'vue';

import { useFeedbackStore } from '@/stores/feedback';

/**
 * 全局提示（toast）：屏幕居中 + 轻遮罩聚焦。
 *
 * 设计取向：
 * - 居中并带一层极淡遮罩 + 模糊，让提示在长列表/表单里也能被立刻看到；
 * - 遮罩 `pointer-events: none`，不阻挡用户继续操作（只有卡片本身可点关闭）；
 * - 最多同时显示 3 条，避免连续操作把屏幕铺满。
 */
const feedback = useFeedbackStore();

/** 只渲染最近 3 条（超出部分靠自动过期移除） */
const visible = computed(() => feedback.toasts.slice(-3));

function dismiss(id: string): void {
  feedback.toasts = feedback.toasts.filter((item) => item.id !== id);
}
</script>

<template>
  <Transition name="bv-toast-layer">
    <div v-if="visible.length > 0" class="bv-toast-layer">
      <TransitionGroup name="bv-toast-item" tag="div" class="bv-toast-stack">
        <div
          v-for="toast in visible"
          :key="toast.id"
          class="bv-toast"
          :class="`bv-toast--${toast.kind}`"
          role="status"
          aria-live="polite"
          @click="dismiss(toast.id)"
        >
          <span class="bv-toast__icon" aria-hidden="true">
            <svg
              v-if="toast.kind === 'success'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
            <svg
              v-else-if="toast.kind === 'error'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            <svg
              v-else-if="toast.kind === 'warn'"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M12 4 2.6 20h18.8L12 4Z" />
              <path d="M12 10v4M12 17h.01" />
            </svg>
            <svg
              v-else
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="9" />
              <path d="M12 11v5M12 8h.01" />
            </svg>
          </span>

          <span class="bv-toast__text">{{ toast.text }}</span>
        </div>
      </TransitionGroup>
    </div>
  </Transition>
</template>

<style scoped>
.bv-toast-layer {
  position: fixed;
  inset: 0;
  z-index: var(--bv-z-toast);
  display: grid;
  place-items: center;
  padding: var(--bv-space-4);
  pointer-events: none;
  background: color-mix(in srgb, var(--bv-text) 10%, transparent);
  backdrop-filter: blur(2px);
}

.bv-toast-stack {
  display: flex;
  flex-direction: column;
  gap: var(--bv-space-2);
  align-items: center;
  width: min(460px, 100%);
  pointer-events: none;
}

.bv-toast {
  /* 每种类型只覆盖这一个变量，图标底色 / 描边 / 外发光都跟着变 */
  --bv-toast-color: var(--bv-accent);

  display: flex;
  gap: var(--bv-space-2);
  align-items: flex-start;
  width: 100%;
  padding: var(--bv-space-3) var(--bv-space-4);
  color: var(--bv-text);
  font-size: var(--bv-font-size-md);
  font-weight: 600;
  line-height: 1.5;
  cursor: pointer;
  background: var(--bv-surface);
  border: 1px solid color-mix(in srgb, var(--bv-toast-color) 42%, var(--bv-border));
  border-radius: var(--bv-radius-lg);
  box-shadow:
    var(--bv-shadow-3),
    0 0 0 4px color-mix(in srgb, var(--bv-toast-color) 14%, transparent);
  pointer-events: auto;
}

.bv-toast--success {
  --bv-toast-color: var(--bv-ok);
}

.bv-toast--error {
  --bv-toast-color: var(--bv-danger);
}

.bv-toast--warn {
  --bv-toast-color: var(--bv-suspect);
}

.bv-toast__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 24px;
  height: 24px;
  color: var(--bv-surface);
  background: var(--bv-toast-color);
  border-radius: 50%;
}

.bv-toast__icon svg {
  display: block;
  width: 14px;
  height: 14px;
}

.bv-toast__text {
  min-width: 0;
  padding-top: 2px;
  word-break: break-word;
}

/* ---- 动效：遮罩淡入，卡片轻微上浮 + 放大 ---- */

.bv-toast-layer-enter-active {
  transition: opacity 180ms ease;
}

.bv-toast-layer-leave-active {
  transition: opacity 140ms ease;
}

.bv-toast-layer-enter-from,
.bv-toast-layer-leave-to {
  opacity: 0;
}

.bv-toast-item-enter-active {
  transition:
    opacity 200ms ease,
    transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.bv-toast-item-leave-active {
  transition:
    opacity 130ms ease,
    transform 130ms ease;
}

.bv-toast-item-enter-from {
  opacity: 0;
  transform: translateY(10px) scale(0.94);
}

.bv-toast-item-leave-to {
  opacity: 0;
  transform: scale(0.96);
}

.bv-toast-item-move {
  transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1);
}
</style>
