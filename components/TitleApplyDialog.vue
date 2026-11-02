<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { t } from '@/modules/i18n';
import type { TitleApplyItem } from '@/shared/types';

/**
 * 标题回填弹窗（B2）。
 *
 * 与旧流程的区别：不再「确认一次就全部替换」，而是把每条「原标题 → 新标题」全部列出来，
 * 支持单条替换 / 勾选替换 / 全部替换；替换过的条目会从列表里移除，剩余的可继续处理。
 */
const props = defineProps<{
  items: TitleApplyItem[];
  /** 抓取失败的条数（不在列表里，单独提示） */
  failed: number;
  busy?: boolean;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'apply', ids: string[]): void;
}>();

/** 默认全选，用户可取消勾选 */
const checked = ref<string[]>(props.items.map((item) => item.id));

// 父组件替换成功后会把对应条目从 items 移除，勾选集要跟着收缩
watch(
  () => props.items,
  (items) => {
    const alive = new Set(items.map((item) => item.id));
    checked.value = checked.value.filter((id) => alive.has(id));
  },
);

const allChecked = computed(
  () => props.items.length > 0 && checked.value.length === props.items.length,
);

const partiallyChecked = computed(
  () => checked.value.length > 0 && checked.value.length < props.items.length,
);

function toggle(id: string): void {
  checked.value = checked.value.includes(id)
    ? checked.value.filter((item) => item !== id)
    : [...checked.value, id];
}

function toggleAll(): void {
  checked.value = allChecked.value ? [] : props.items.map((item) => item.id);
}

function applyOne(id: string): void {
  emit('apply', [id]);
}
</script>

<template>
  <div class="bv-mask" @click.self="emit('close')">
    <section class="bv-title-apply" role="dialog" aria-modal="true">
      <h3 class="bv-section-title">{{ t('titleApplyTitle') }}</h3>
      <p class="bv-hint">{{ t('titleApplyPickHint') }}</p>
      <p v-if="failed > 0" class="bv-hint">{{ t('titleApplyFailedHint', { count: failed }) }}</p>

      <div class="bv-title-apply__head">
        <label class="bv-title-apply__check">
          <input
            type="checkbox"
            :checked="allChecked"
            :indeterminate.prop="partiallyChecked"
            :aria-label="t('actionSelectAll')"
            @change="toggleAll"
          />
        </label>
        <span>{{ t('titleApplyColBefore') }}</span>
        <span aria-hidden="true" />
        <span>{{ t('titleApplyColAfter') }}</span>
        <span />
      </div>

      <ul class="bv-title-apply__list">
        <li v-for="item in items" :key="item.id" class="bv-title-apply__row">
          <label class="bv-title-apply__check">
            <input
              type="checkbox"
              :checked="checked.includes(item.id)"
              @change="toggle(item.id)"
            />
          </label>
          <span class="bv-title-apply__before" :title="item.before">
            {{ item.before || item.url }}
          </span>
          <span class="bv-title-apply__arrow" aria-hidden="true">→</span>
          <span class="bv-title-apply__after" :title="item.after">{{ item.after }}</span>
          <button
            class="bv-btn bv-btn--sm"
            type="button"
            :disabled="busy"
            @click="applyOne(item.id)"
          >
            {{ t('titleApplySingle') }}
          </button>
        </li>
      </ul>

      <div class="bv-title-apply__foot">
        <span class="bv-hint">{{ t('titleApplyDetail') }}</span>
        <span class="bv-spacer" />
        <button class="bv-btn" type="button" :disabled="busy" @click="emit('close')">
          {{ t('actionCancel') }}
        </button>
        <button
          class="bv-btn"
          type="button"
          :disabled="busy || checked.length === 0"
          @click="emit('apply', checked)"
        >
          {{ t('titleApplySelected', { count: checked.length }) }}
        </button>
        <button
          class="bv-btn bv-btn--primary"
          type="button"
          :disabled="busy || items.length === 0"
          @click="emit('apply', items.map((item) => item.id))"
        >
          {{ t('titleApplyAllItems') }}
        </button>
      </div>
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

.bv-title-apply {
  display: flex;
  flex-direction: column;
  gap: var(--bv-space-2);
  width: 760px;
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 64px);
  padding: var(--bv-space-4);
  background: var(--bv-surface);
  border: 1px solid var(--bv-border);
  border-radius: var(--bv-radius-md);
  box-shadow: var(--bv-shadow-3);
}

/* 表头与行共用同一套列宽 */
.bv-title-apply__head,
.bv-title-apply__row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 20px minmax(0, 1fr) 88px;
  gap: var(--bv-space-2);
  align-items: center;
}

.bv-title-apply__head {
  padding-bottom: var(--bv-space-1);
  color: var(--bv-text-secondary);
  font-size: var(--bv-font-size-xs);
  border-bottom: 1px solid var(--bv-border);
}

.bv-title-apply__list {
  flex: 1;
  min-height: 0;
  padding: 0;
  margin: 0;
  overflow: auto;
  list-style: none;
}

.bv-title-apply__row {
  padding: 5px 0;
  font-size: var(--bv-font-size-sm);
  border-bottom: 1px solid var(--bv-border);
}

.bv-title-apply__check {
  display: flex;
  align-items: center;
  justify-content: center;
}

.bv-title-apply__before {
  overflow: hidden;
  color: var(--bv-text-tertiary);
  white-space: nowrap;
  text-decoration: line-through;
  text-overflow: ellipsis;
}

.bv-title-apply__arrow {
  color: var(--bv-text-tertiary);
  text-align: center;
}

.bv-title-apply__after {
  overflow: hidden;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bv-title-apply__foot {
  display: flex;
  gap: var(--bv-space-2);
  align-items: center;
  flex-wrap: wrap;
  padding-top: var(--bv-space-2);
  border-top: 1px solid var(--bv-border);
}
</style>
