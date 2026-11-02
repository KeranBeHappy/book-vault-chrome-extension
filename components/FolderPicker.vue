<script setup lang="ts">
import { computed } from 'vue';

import type { ManagedRoot } from '@/modules/bookmarks';
import { t } from '@/modules/i18n';
import type { BookmarkNode } from '@/shared/types';

interface FolderRow {
  node: BookmarkNode;
  path: string[];
  rootId: string;
  depth: number;
}

const props = defineProps<{
  roots: ManagedRoot[];
  folders: FolderRow[];
  modelValue: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();

/** 扁平化成缩进选项，天然表达层级（比自绘树简单且可键盘操作） */
const options = computed(() => {
  const rows: Array<{ id: string; label: string }> = [];
  const childrenOf = new Map<string, FolderRow[]>();
  for (const folder of props.folders) {
    const parentId = folder.node.parentId ?? '';
    const list = childrenOf.get(parentId);
    if (list) list.push(folder);
    else childrenOf.set(parentId, [folder]);
  }

  const visit = (parentId: string, depth: number): void => {
    for (const folder of childrenOf.get(parentId) ?? []) {
      rows.push({
        id: folder.node.id,
        label: `${'　'.repeat(depth)}${folder.node.title || t('unnamedFolder')}`,
      });
      visit(folder.node.id, depth + 1);
    }
  };

  for (const root of props.roots) {
    rows.push({ id: root.id, label: root.title });
    visit(root.id, 1);
  }
  return rows;
});

function onChange(event: Event): void {
  emit('update:modelValue', (event.target as HTMLSelectElement).value);
}
</script>

<template>
  <select class="bv-select" :value="modelValue" :disabled="disabled" @change="onChange">
    <option v-for="option in options" :key="option.id" :value="option.id">
      {{ option.label }}
    </option>
  </select>
</template>
