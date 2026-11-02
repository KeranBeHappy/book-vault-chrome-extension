<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import {
  applyTitleOp,
  applyUrlReplace,
  validateUrl,
  type BookmarkEntry,
  type TitleOp,
} from '@/modules/bookmarks';
import { t, translateError } from '@/modules/i18n';
import type { RewriteItem } from '@/shared/messages';

/**
 * 批量标题 / URL 改写（A5）。
 *
 * 职责边界：本组件只做「规则 → 预览」，不写任何数据；确认后在 App.vue 里
 * 走统一的 useSafeAction 序列（算影响 → 生成快照 → 二次确认 → 执行），
 * 因此这里不生成快照、不发消息。
 */
const props = defineProps<{
  /** 已勾选的书签条目（调用方保证非空） */
  entries: BookmarkEntry[];
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  // 空标题条数单独回传，调用方据此在执行前追加警告（A5）；
  // 跳过项带明细回传，调用方要能在结果对话框逐条列出（R-14）
  (event: 'submit', payload: {
    items: RewriteItem[];
    skipped: Array<{ id: string; title: string; reason: string }>;
    emptyTitles: number;
  }): void;
}>();

type Target = 'title' | 'url';
type Mode = 'prefix' | 'suffix' | 'replace';

const target = ref<Target>('title');
const mode = ref<Mode>('prefix');
const prefix = ref('');
const suffix = ref('');
const search = ref('');
const replacement = ref('');
const caseSensitive = ref(false);

// URL 只允许查找替换（A5：禁止批量加前后缀，避免拼出非法链接）
watch(target, (next) => {
  if (next === 'url' && mode.value !== 'replace') mode.value = 'replace';
});

/** 界面状态 → 模块约定的标题改写操作 */
const titleOp = computed<TitleOp>(() => {
  if (mode.value === 'prefix') return { kind: 'prefix', text: prefix.value };
  if (mode.value === 'suffix') return { kind: 'suffix', text: suffix.value };
  return {
    kind: 'replace',
    from: search.value,
    to: replacement.value,
    caseSensitive: caseSensitive.value,
  };
});

/** 按当前规则计算单条结果；URL 一律按查找替换（A5） */
function computeAfter(value: string): string {
  if (target.value === 'title') return applyTitleOp(value, titleOp.value);
  return applyUrlReplace(value, {
    from: search.value,
    to: replacement.value,
    caseSensitive: caseSensitive.value,
  });
}

interface PreviewRow {
  id: string;
  title: string;
  before: string;
  after: string;
  /** 跳过原因（i18n key），有值表示不会写入 */
  skip?: string;
}

/** 受影响条目：值确实发生变化才算，未命中规则的不进列表 */
const preview = computed<PreviewRow[]>(() => {
  const rows: PreviewRow[] = [];
  for (const entry of props.entries) {
    const node = entry.node;
    const before = target.value === 'title' ? node.title : (node.url ?? '');
    if (!before) continue;
    const after = computeAfter(before);
    if (after === before) continue;

    const row: PreviewRow = { id: node.id, title: node.title, before, after };
    if (target.value === 'url') {
      const error = validateUrl(after);
      if (error) row.skip = error;
    }
    rows.push(row);
  }
  return rows;
});

const applicable = computed(() => preview.value.filter((row) => !row.skip));
const skippedRows = computed(() => preview.value.filter((row) => row.skip));

/** 会变成空标题的条数：后端不拦截，需在执行前给出警告（A5） */
const emptyTitles = computed(() =>
  target.value === 'title' ? applicable.value.filter((row) => !row.after.trim()).length : 0,
);

const canSubmit = computed(() => applicable.value.length > 0 && !(mode.value === 'replace' && !search.value));

function submit(): void {
  if (!canSubmit.value) return;
  const items: RewriteItem[] = applicable.value.map((row) =>
    target.value === 'title' ? { id: row.id, title: row.after } : { id: row.id, url: row.after },
  );
  emit('submit', {
    items,
    skipped: skippedRows.value.map((row) => ({
      id: row.id,
      title: row.title,
      // skip 一定是 validateUrl 抛出的 i18n key（如 errUrlScheme）
      reason: row.skip ?? 'errUrlInvalid',
    })),
    emptyTitles: emptyTitles.value,
  });
}
</script>

<template>
  <div class="bv-rewrite__mask" @click.self="emit('close')">
    <section class="bv-rewrite" role="dialog" aria-modal="true">
      <h2 class="bv-rewrite__title">{{ t('rewriteTitle') }}</h2>
      <p class="bv-rewrite__hint">{{ t('rewriteHint', { count: entries.length }) }}</p>

      <div class="bv-rewrite__field">
        <span class="bv-rewrite__label">{{ t('rewriteTarget') }}</span>
        <div class="bv-rewrite__segmented">
          <button
            type="button"
            class="bv-rewrite__seg"
            :class="{ 'is-active': target === 'title' }"
            @click="target = 'title'"
          >
            {{ t('rewriteTargetTitle') }}
          </button>
          <button
            type="button"
            class="bv-rewrite__seg"
            :class="{ 'is-active': target === 'url' }"
            @click="target = 'url'"
          >
            {{ t('rewriteTargetUrl') }}
          </button>
        </div>
      </div>

      <div class="bv-rewrite__field">
        <span class="bv-rewrite__label">{{ t('rewriteMode') }}</span>
        <div class="bv-rewrite__segmented">
          <button
            type="button"
            class="bv-rewrite__seg"
            :class="{ 'is-active': mode === 'prefix' }"
            :disabled="target === 'url'"
            @click="mode = 'prefix'"
          >
            {{ t('rewritePrefix') }}
          </button>
          <button
            type="button"
            class="bv-rewrite__seg"
            :class="{ 'is-active': mode === 'suffix' }"
            :disabled="target === 'url'"
            @click="mode = 'suffix'"
          >
            {{ t('rewriteSuffix') }}
          </button>
          <button
            type="button"
            class="bv-rewrite__seg"
            :class="{ 'is-active': mode === 'replace' }"
            @click="mode = 'replace'"
          >
            {{ t('rewriteReplace') }}
          </button>
        </div>
      </div>

      <label v-if="mode === 'prefix'" class="bv-rewrite__field">
        <span class="bv-rewrite__label">{{ t('rewritePrefixText') }}</span>
        <input v-model="prefix" class="bv-input" type="text" />
      </label>

      <label v-else-if="mode === 'suffix'" class="bv-rewrite__field">
        <span class="bv-rewrite__label">{{ t('rewriteSuffixText') }}</span>
        <input v-model="suffix" class="bv-input" type="text" />
      </label>

      <template v-else>
        <label class="bv-rewrite__field">
          <span class="bv-rewrite__label">{{ t('rewriteSearch') }}</span>
          <input v-model="search" class="bv-input" type="text" />
        </label>
        <label class="bv-rewrite__field">
          <span class="bv-rewrite__label">{{ t('rewriteReplacement') }}</span>
          <input v-model="replacement" class="bv-input" type="text" />
        </label>
        <label class="bv-rewrite__check">
          <input v-model="caseSensitive" type="checkbox" />
          <span>{{ t('rewriteCaseSensitive') }}</span>
        </label>
      </template>

      <p class="bv-rewrite__hint">{{ t('rewriteUrlOnlyReplace') }}</p>

      <div class="bv-rewrite__stats">
        <span class="bv-rewrite__stat">{{ t('rewriteAffected', { count: applicable.length }) }}</span>
        <span v-if="skippedRows.length > 0" class="bv-rewrite__stat is-warn">
          {{ t('rewriteSkippedCount', { count: skippedRows.length }) }}
        </span>
        <span v-if="emptyTitles > 0" class="bv-rewrite__stat is-warn">
          {{ t('rewriteEmptyTitleWarn', { count: emptyTitles }) }}
        </span>
      </div>

      <div v-if="preview.length > 0" class="bv-rewrite__preview">
        <div v-for="row in preview.slice(0, 30)" :key="row.id" class="bv-rewrite__row">
          <div class="bv-rewrite__row-main">
            <span class="bv-rewrite__row-title" :title="row.title">{{ row.title || row.before }}</span>
            <span class="bv-rewrite__row-diff">
              <span class="is-before">{{ row.before }}</span>
              <span class="is-arrow">→</span>
              <span class="is-after">{{ row.after }}</span>
            </span>
          </div>
          <span v-if="row.skip" class="bv-rewrite__row-skip">{{ translateError(row.skip) }}</span>
        </div>
        <p v-if="preview.length > 30" class="bv-rewrite__hint">
          {{ t('rewritePreviewMore', { count: preview.length - 30 }) }}
        </p>
      </div>
      <p v-else class="bv-rewrite__hint">{{ t('rewriteNoAffected') }}</p>

      <div class="bv-rewrite__actions">
        <button class="bv-btn" type="button" @click="emit('close')">
          {{ t('actionCancel') }}
        </button>
        <button class="bv-btn bv-btn--primary" type="button" :disabled="!canSubmit" @click="submit">
          {{ t('actionApply') }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.bv-rewrite__mask {
  position: fixed;
  inset: 0;
  z-index: var(--bv-z-dialog);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bv-overlay);
}

.bv-rewrite {
  display: flex;
  flex-direction: column;
  gap: var(--bv-space-2);
  width: min(680px, calc(100vw - 48px));
  max-height: calc(100vh - 96px);
  padding: var(--bv-space-4);
  overflow: auto;
  background: var(--bv-surface);
  border: 1px solid var(--bv-border);
  border-radius: var(--bv-radius-md);
  box-shadow: var(--bv-shadow-2);
}

.bv-rewrite__title {
  margin: 0;
  color: var(--bv-text);
  font-size: var(--bv-font-size-md);
  font-weight: 600;
}

.bv-rewrite__hint {
  margin: 0;
  color: var(--bv-text-secondary);
  font-size: var(--bv-font-size-xs);
}

.bv-rewrite__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bv-rewrite__label {
  color: var(--bv-text-secondary);
  font-size: var(--bv-font-size-xs);
}

.bv-rewrite__segmented {
  display: flex;
  gap: var(--bv-space-1);
}

.bv-rewrite__seg {
  padding: 4px var(--bv-space-2);
  color: var(--bv-text-secondary);
  font-size: var(--bv-font-size-xs);
  background: var(--bv-surface);
  border: 1px solid var(--bv-border);
  border-radius: var(--bv-radius-sm);
}

.bv-rewrite__seg.is-active {
  color: var(--bv-primary);
  background: var(--bv-primary-soft);
  border-color: var(--bv-primary);
}

.bv-rewrite__seg:disabled {
  opacity: 0.45;
}

.bv-rewrite__check {
  display: flex;
  gap: var(--bv-space-1);
  align-items: center;
  color: var(--bv-text-secondary);
  font-size: var(--bv-font-size-xs);
}

.bv-rewrite__stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bv-space-2);
  padding: var(--bv-space-2);
  background: var(--bv-surface-hover);
  border-radius: var(--bv-radius-sm);
}

.bv-rewrite__stat {
  color: var(--bv-text);
  font-size: var(--bv-font-size-xs);
}

.bv-rewrite__stat.is-warn {
  color: var(--bv-suspect);
}

.bv-rewrite__preview {
  display: flex;
  flex-direction: column;
  gap: 1px;
  max-height: 260px;
  overflow: auto;
  border: 1px solid var(--bv-border);
  border-radius: var(--bv-radius-sm);
}

.bv-rewrite__row {
  display: flex;
  gap: var(--bv-space-2);
  align-items: center;
  justify-content: space-between;
  padding: 4px var(--bv-space-2);
  border-bottom: 1px solid var(--bv-border);
}

.bv-rewrite__row-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.bv-rewrite__row-title {
  overflow: hidden;
  color: var(--bv-text);
  font-size: var(--bv-font-size-xs);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bv-rewrite__row-diff {
  display: flex;
  gap: 4px;
  min-width: 0;
  font-size: var(--bv-font-size-xs);
}

.bv-rewrite__row-diff .is-before {
  overflow: hidden;
  color: var(--bv-text-tertiary);
  text-overflow: ellipsis;
  text-decoration: line-through;
}

.bv-rewrite__row-diff .is-arrow {
  color: var(--bv-text-tertiary);
}

.bv-rewrite__row-diff .is-after {
  overflow: hidden;
  color: var(--bv-primary);
  text-overflow: ellipsis;
}

.bv-rewrite__row-skip {
  flex: none;
  color: var(--bv-danger);
  font-size: var(--bv-font-size-xs);
}

.bv-rewrite__actions {
  display: flex;
  gap: var(--bv-space-2);
  justify-content: flex-end;
  margin-top: var(--bv-space-2);
}


</style>
