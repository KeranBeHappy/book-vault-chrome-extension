<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { validateUrl, type FolderRow, type ManagedRoot } from '@/modules/bookmarks';
import { t, translateError } from '@/modules/i18n';
import type { BookmarkNode } from '@/shared/types';

import FolderPicker from './FolderPicker.vue';

const props = defineProps<{
  mode: 'create' | 'edit';
  node: BookmarkNode | null;
  roots: ManagedRoot[];
  folders: FolderRow[];
  defaultFolderId: string;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'submit', payload: { title: string; url: string; parentId: string }): void;
}>();

const title = ref('');
const url = ref('');
const parentId = ref(props.defaultFolderId);
const error = ref('');

watch(
  () => props.node,
  (node) => {
    title.value = node?.title ?? '';
    url.value = node?.url ?? '';
    error.value = '';
  },
  { immediate: true },
);

watch(
  () => props.defaultFolderId,
  (id) => {
    if (!parentId.value) parentId.value = id;
  },
  { immediate: true },
);

const isEdit = computed(() => props.mode === 'edit');

/** 校验：URL 必须是 http/https 且 host 非空（R-01 / R-02），标题不许为空 */
function submit(): void {
  const trimmedUrl = url.value.trim();
  const trimmedTitle = title.value.trim();

  if (!trimmedTitle) {
    error.value = t('errTitleEmpty');
    return;
  }
  const urlError = validateUrl(trimmedUrl);
  if (urlError) {
    error.value = translateError(urlError);
    return;
  }
  if (!isEdit.value && !parentId.value) {
    error.value = t('errFolderMissing');
    return;
  }
  error.value = '';
  emit('submit', { title: trimmedTitle, url: trimmedUrl, parentId: parentId.value });
}
</script>

<template>
  <div class="bv-mask" @click.self="emit('close')">
    <section class="bv-dialog" role="dialog" aria-modal="true">
      <h2 class="bv-section-title">
        {{ isEdit ? t('bookmarkEditTitle') : t('bookmarkCreateTitle') }}
      </h2>

      <label class="bv-col">
        <span class="bv-hint">{{ t('fieldBookmarkTitle') }}</span>
        <input v-model="title" class="bv-input" type="text" @keydown.enter.prevent="submit" />
      </label>

      <label class="bv-col">
        <span class="bv-hint">{{ t('fieldBookmarkUrl') }}</span>
        <input
          v-model="url"
          class="bv-input"
          type="text"
          placeholder="https://"
          @keydown.enter.prevent="submit"
        />
      </label>

      <label v-if="!isEdit" class="bv-col">
        <span class="bv-hint">{{ t('fieldTargetFolder') }}</span>
        <FolderPicker v-model="parentId" :roots="roots" :folders="folders" />
      </label>

      <p v-if="error" class="bv-dialog__error">{{ error }}</p>

      <div class="bv-row">
        <span class="bv-spacer" />
        <button class="bv-btn" type="button" @click="emit('close')">{{ t('actionCancel') }}</button>
        <button class="bv-btn bv-btn--primary" type="button" @click="submit">
          {{ t('actionSave') }}
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

.bv-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--bv-space-3);
  width: 420px;
  padding: var(--bv-space-5);
  background: var(--bv-surface);
  border: 1px solid var(--bv-border);
  border-radius: var(--bv-radius-md);
  box-shadow: var(--bv-shadow-3);
}

.bv-dialog__error {
  color: var(--bv-danger);
  font-size: var(--bv-font-size-sm);
}
</style>
