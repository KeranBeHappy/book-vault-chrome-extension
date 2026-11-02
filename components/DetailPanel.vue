<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import type { BookmarkEntry } from '@/modules/bookmarks';
import { t } from '@/modules/i18n';
import { clampNote, isNoteTruncated, normalizeTags } from '@/modules/tags';
import { CONTENT_LIMITS } from '@/shared/constants';
import type { BookmarkMeta } from '@/shared/types';

const props = defineProps<{
  entry: BookmarkEntry | null;
  meta: BookmarkMeta | undefined;
  folderPath: string;
  saving?: boolean;
}>();

const emit = defineEmits<{
  (event: 'save', meta: BookmarkMeta): void;
  (event: 'close'): void;
  (event: 'open', url: string): void;
}>();

const tags = ref<string[]>([]);
const note = ref('');
const tagInput = ref('');
const truncated = ref(false);

// 切换书签时重置编辑态
watch(
  () => [props.entry?.node.id, props.meta] as const,
  () => {
    tags.value = [...(props.meta?.tags ?? [])];
    note.value = props.meta?.note ?? '';
    tagInput.value = '';
    truncated.value = false;
  },
  { immediate: true },
);

const noteCount = computed(() => note.value.length);

/** 提交标签输入（回车或逗号触发，I2） */
function commitTagInput(): void {
  const raw = tagInput.value;
  if (!raw) return;
  tags.value = normalizeTags([...tags.value, ...raw.split(/[,，]/)]);
  tagInput.value = '';
}

function onTagKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
    event.preventDefault();
    commitTagInput();
  }
}

function removeTag(tag: string): void {
  tags.value = tags.value.filter((item) => item !== tag);
}

function save(): void {
  truncated.value = isNoteTruncated(note.value);
  const meta: BookmarkMeta = {
    tags: normalizeTags(tags.value),
    note: clampNote(note.value),
  };
  emit('save', meta);
}
</script>

<template>
  <aside class="bv-detail">
    <header class="bv-detail__head">
      <span class="bv-detail__label">{{ t('detailTitle') }}</span>
      <button class="bv-btn bv-btn--ghost bv-btn--sm" type="button" @click="emit('close')">
        ✕
      </button>
    </header>

    <div v-if="!entry" class="bv-empty">{{ t('detailEmpty') }}</div>

    <div v-else class="bv-detail__body bv-scroll">
      <h3 class="bv-detail__title" :title="entry.node.title">{{ entry.node.title }}</h3>
      <a
        class="bv-detail__url"
        :href="entry.node.url"
        :title="entry.node.url"
        @click.prevent="emit('open', entry.node.url ?? '')"
      >
        {{ entry.node.url }}
      </a>
      <p class="bv-hint">{{ t('colFolder') }}：{{ folderPath }}</p>

      <div class="bv-divider" />

      <label class="bv-detail__field">
        <span class="bv-detail__label">{{ t('fieldTags') }}</span>
        <div class="bv-detail__tags">
          <span v-for="tag in tags" :key="tag" class="bv-chip bv-chip--primary">
            {{ tag }}
            <button type="button" class="bv-detail__tag-remove" @click="removeTag(tag)">×</button>
          </span>
        </div>
        <input
          v-model="tagInput"
          class="bv-input"
          type="text"
          :placeholder="t('tagPlaceholder')"
          :maxlength="CONTENT_LIMITS.tagMaxChars"
          @keydown="onTagKeydown"
          @blur="commitTagInput"
        />
        <span class="bv-hint">{{ t('tagHint', { max: CONTENT_LIMITS.tagsPerBookmark }) }}</span>
      </label>

      <label class="bv-detail__field">
        <span class="bv-detail__label">{{ t('fieldNote') }}</span>
        <textarea
          v-model="note"
          class="bv-textarea"
          :maxlength="CONTENT_LIMITS.noteMaxChars"
          :placeholder="t('notePlaceholder')"
        />
        <span class="bv-hint">
          {{ noteCount }} / {{ CONTENT_LIMITS.noteMaxChars }}
          <template v-if="truncated"> · {{ t('noteTruncated') }}</template>
        </span>
      </label>

      <button
        class="bv-btn bv-btn--primary"
        type="button"
        :disabled="saving"
        @click="save"
      >
        {{ t('actionSave') }}
      </button>
    </div>
  </aside>
</template>

<style scoped>
.bv-detail {
  display: flex;
  flex-direction: column;
  width: 320px;
  min-height: 0;
  background: var(--bv-surface);
  border-left: 1px solid var(--bv-border);
}

.bv-detail__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--bv-space-2) var(--bv-space-3);
  border-bottom: 1px solid var(--bv-border);
}

.bv-detail__label {
  color: var(--bv-text-secondary);
  font-size: var(--bv-font-size-xs);
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.bv-detail__body {
  display: flex;
  flex-direction: column;
  gap: var(--bv-space-3);
  padding: var(--bv-space-3);
  overflow: auto;
}

.bv-detail__title {
  font-size: var(--bv-font-size-md);
  font-weight: 600;
  line-height: 1.5;
  word-break: break-word;
}

.bv-detail__url {
  overflow: hidden;
  color: var(--bv-primary);
  font-size: var(--bv-font-size-xs);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bv-detail__field {
  display: flex;
  flex-direction: column;
  gap: var(--bv-space-1);
}

.bv-detail__tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bv-space-1);
}

.bv-detail__tag-remove {
  padding: 0;
  margin-left: 2px;
  color: inherit;
  font-size: 10px;
  line-height: 1;
}
</style>
