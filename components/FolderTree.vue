<script setup lang="ts">
import { computed } from 'vue';

import { t } from '@/modules/i18n';
import type { ManagedRoot } from '@/modules/bookmarks';
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
  selectedId: string | null;
  expandedIds: string[];
  countOf: Record<string, number>;
  totalCount: number;
}>();

const emit = defineEmits<{
  (event: 'select', id: string | null): void;
  (event: 'toggle', id: string): void;
  (event: 'create', parentId: string): void;
  (event: 'rename', node: BookmarkNode): void;
  (event: 'remove', node: BookmarkNode): void;
}>();

interface Row {
  id: string;
  title: string;
  depth: number;
  isRoot: boolean;
  node: BookmarkNode | null;
  hasChildren: boolean;
  count: number;
}

const expanded = computed(() => new Set(props.expandedIds));

/**
 * 把树展开成可见行（按展开状态懒展开）。
 * 用扁平列表代替递归组件：1 万节点时递归渲染更慢，且更容易踩到 Vue 递归深度。
 */
const rows = computed<Row[]>(() => {
  const childrenOf = new Map<string, FolderRow[]>();
  for (const folder of props.folders) {
    const parentId = folder.node.parentId ?? '';
    const list = childrenOf.get(parentId);
    if (list) list.push(folder);
    else childrenOf.set(parentId, [folder]);
  }

  const result: Row[] = [];
  const visit = (parentId: string, depth: number): void => {
    for (const folder of childrenOf.get(parentId) ?? []) {
      const children = childrenOf.get(folder.node.id) ?? [];
      result.push({
        id: folder.node.id,
        title: folder.node.title || t('unnamedFolder'),
        depth,
        isRoot: false,
        node: folder.node,
        hasChildren: children.length > 0,
        count: props.countOf[folder.node.id] ?? 0,
      });
      if (expanded.value.has(folder.node.id)) visit(folder.node.id, depth + 1);
    }
  };

  for (const root of props.roots) {
    const children = childrenOf.get(root.id) ?? [];
    result.push({
      id: root.id,
      title: root.title,
      depth: 0,
      isRoot: true,
      node: null,
      hasChildren: children.length > 0,
      count: props.countOf[root.id] ?? 0,
    });
    if (expanded.value.has(root.id)) visit(root.id, 1);
  }
  return result;
});

/** 根行不允许重命名/删除（4.3：三个浏览器固定根节点本身不可删除） */
function onRename(row: Row): void {
  if (row.node) emit('rename', row.node);
}

function onRemove(row: Row): void {
  if (row.node) emit('remove', row.node);
}
</script>

<template>
  <nav class="bv-tree" :aria-label="t('folderTreeLabel')">
    <div class="bv-tree__head">
      <span class="bv-tree__title">{{ t('foldersTitle') }}</span>
      <button
        v-if="roots[0]"
        class="bv-btn bv-btn--ghost bv-btn--sm"
        type="button"
        :title="t('actionNewFolder')"
        @click="emit('create', roots[0].id)"
      >
        ＋
      </button>
    </div>

    <ul class="bv-tree__list">
      <li>
        <button
          type="button"
          class="bv-tree__row"
          :class="{ 'is-active': selectedId === null }"
          @click="emit('select', null)"
        >
          <span class="bv-tree__caret" />
          <span class="bv-tree__label">{{ t('allBookmarks') }}</span>
          <span class="bv-tree__count">{{ totalCount }}</span>
        </button>
      </li>

      <li v-for="row in rows" :key="row.id">
        <div
          class="bv-tree__row"
          :class="{ 'is-active': selectedId === row.id, 'is-root': row.isRoot }"
          :style="{ paddingLeft: `${8 + row.depth * 14}px` }"
          role="button"
          tabindex="0"
          @click="emit('select', row.id)"
          @keydown.enter.prevent="emit('select', row.id)"
          @dblclick="emit('toggle', row.id)"
        >
          <button
            v-if="row.hasChildren"
            type="button"
            class="bv-tree__caret"
            :aria-label="t('actionExpand')"
            @click.stop="emit('toggle', row.id)"
          >
            {{ expanded.has(row.id) ? '▾' : '▸' }}
          </button>
          <span v-else class="bv-tree__caret" />

          <span class="bv-tree__label" :title="row.title">{{ row.title }}</span>
          <span class="bv-tree__count">{{ row.count }}</span>

          <span v-if="row.node" class="bv-tree__actions">
            <button
              type="button"
              class="bv-tree__action"
              :title="t('actionNewFolder')"
              @click.stop="emit('create', row.id)"
            >
              ＋
            </button>
            <button
              type="button"
              class="bv-tree__action"
              :title="t('actionRename')"
              @click.stop="onRename(row)"
            >
              ✎
            </button>
            <button
              type="button"
              class="bv-tree__action bv-tree__action--danger"
              :title="t('actionDelete')"
              @click.stop="onRemove(row)"
            >
              ✕
            </button>
          </span>
        </div>
      </li>

      <li v-if="rows.length === 0" class="bv-tree__empty">{{ t('noFolders') }}</li>
    </ul>
  </nav>
</template>

<style scoped>
.bv-tree {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--bv-surface);
  border-right: 1px solid var(--bv-border);
}

.bv-tree__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--bv-space-3) var(--bv-space-3) var(--bv-space-2);
  border-bottom: 1px solid var(--bv-border);
}

.bv-tree__title {
  color: var(--bv-text-secondary);
  font-size: var(--bv-font-size-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.bv-tree__list {
  flex: 1;
  padding: var(--bv-space-1) 0 var(--bv-space-4);
  margin: 0;
  overflow: auto;
  list-style: none;
  scrollbar-width: thin;
}

.bv-tree__row {
  display: flex;
  gap: 2px;
  align-items: center;
  width: 100%;
  padding: 5px var(--bv-space-2);
  color: var(--bv-text);
  font-size: var(--bv-font-size-sm);
  text-align: left;
  border-radius: var(--bv-radius-sm);
}

.bv-tree__row:hover {
  background: var(--bv-surface-hover);
}

.bv-tree__row.is-active {
  color: var(--bv-primary);
  background: var(--bv-primary-soft);
}

.bv-tree__row.is-root .bv-tree__label {
  font-weight: 600;
}

.bv-tree__caret {
  width: 14px;
  padding: 0;
  overflow: hidden;
  color: var(--bv-text-secondary);
  font-size: 10px;
  text-align: center;
  background: none;
  border: none;
}

.bv-tree__label {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bv-tree__count {
  color: var(--bv-text-tertiary);
  font-size: var(--bv-font-size-xs);
}

.bv-tree__actions {
  display: none;
  gap: 2px;
}

.bv-tree__row:hover .bv-tree__actions {
  display: inline-flex;
}

.bv-tree__action {
  width: 18px;
  height: 18px;
  padding: 0;
  color: var(--bv-text-secondary);
  font-size: 11px;
  line-height: 1;
  border-radius: var(--bv-radius-sm);
}

.bv-tree__action:hover {
  color: var(--bv-primary);
  background: var(--bv-primary-soft-strong);
}

.bv-tree__action--danger:hover {
  color: var(--bv-danger);
  background: var(--bv-danger-soft);
}

.bv-tree__empty {
  padding: var(--bv-space-4);
  color: var(--bv-text-secondary);
  font-size: var(--bv-font-size-xs);
  text-align: center;
}
</style>
