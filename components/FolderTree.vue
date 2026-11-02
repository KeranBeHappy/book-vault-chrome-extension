<script setup lang="ts">
import { computed, ref } from 'vue';

import { t } from '@/modules/i18n';
import type { FolderRow, ManagedRoot } from '@/modules/bookmarks';
import type { BookmarkNode } from '@/shared/types';

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
  (event: 'move', payload: { id: string; parentId: string }): void;
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

/* ---------------- 拖拽移动（A3） ---------------- */

const dragId = ref<string | null>(null);
const dropId = ref<string | null>(null);

/** 文件夹 id → 父 id，用于判断「拖进自己的子孙」这种非法目标 */
const parentOf = computed(() => {
  const map = new Map<string, string>();
  for (const folder of props.folders) {
    const parentId = folder.node.parentId;
    if (parentId) map.set(folder.node.id, parentId);
  }
  return map;
});

/** 目标是否是拖动项自身或其祖先链上的节点（bookmarks.move 会拒绝，提前挡掉） */
function isSelfOrDescendant(targetId: string, sourceId: string): boolean {
  if (targetId === sourceId) return true;
  let current: string | undefined = targetId;
  while (current) {
    if (current === sourceId) return true;
    current = parentOf.value.get(current);
  }
  return false;
}

/** 拖回原父级视为无变化：不弹确认，也避免把节点重排到末尾 */
function isNoopDrop(row: Row, sourceId: string): boolean {
  return parentOf.value.get(sourceId) === row.id;
}

function canDrop(row: Row): boolean {
  if (!dragId.value) return false;
  const sourceId = dragId.value;
  return !isSelfOrDescendant(row.id, sourceId) && !isNoopDrop(row, sourceId);
}

function onDragStart(event: DragEvent, row: Row): void {
  // 受管根不可拖：它们的父级是浏览器固定根，不允许改写层级
  if (!row.node) {
    event.preventDefault();
    return;
  }
  dragId.value = row.id;
  event.dataTransfer?.setData('text/plain', row.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

function onDragOver(event: DragEvent, row: Row): void {
  if (!canDrop(row)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  dropId.value = row.id;
}

function onDragLeave(row: Row): void {
  if (dropId.value === row.id) dropId.value = null;
}

function onDrop(event: DragEvent, row: Row): void {
  event.preventDefault();
  const sourceId = dragId.value ?? event.dataTransfer?.getData('text/plain') ?? '';
  const allowed =
    Boolean(sourceId) && !isSelfOrDescendant(row.id, sourceId) && !isNoopDrop(row, sourceId);
  dragId.value = null;
  dropId.value = null;
  if (!allowed) return;
  emit('move', { id: sourceId, parentId: row.id });
}

function onDragEnd(): void {
  dragId.value = null;
  dropId.value = null;
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
          :class="{
            'is-active': selectedId === row.id,
            'is-root': row.isRoot,
            'is-drop': dropId === row.id,
            'is-dragging': dragId === row.id,
          }"
          :style="{ paddingLeft: `${8 + row.depth * 14}px` }"
          role="button"
          tabindex="0"
          :draggable="Boolean(row.node)"
          @click="emit('select', row.id)"
          @keydown.enter.prevent="emit('select', row.id)"
          @dblclick="emit('toggle', row.id)"
          @dragstart="onDragStart($event, row)"
          @dragover="onDragOver($event, row)"
          @dragleave="onDragLeave(row)"
          @drop="onDrop($event, row)"
          @dragend="onDragEnd"
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

/* 拖拽落点提示：虚线边框比整块高亮更轻，符合千苍主题的克制基调 */
.bv-tree__row.is-drop {
  outline: 1px dashed var(--bv-primary);
  outline-offset: -1px;
  background: var(--bv-primary-soft);
}

.bv-tree__row.is-dragging {
  opacity: 0.5;
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
