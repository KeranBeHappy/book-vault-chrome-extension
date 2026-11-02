<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import type { BookmarkEntry } from '@/modules/bookmarks';
import { t } from '@/modules/i18n';
import type { BookmarkMeta, BookmarkNode, LinkStatus } from '@/shared/types';

const props = defineProps<{
  items: BookmarkEntry[];
  selected: Set<string>;
  statusMap: Record<string, LinkStatus>;
  metaMap: Record<string, BookmarkMeta>;
  folderPaths: Record<string, string>;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (event: 'toggle', id: string): void;
  (event: 'toggleAll', ids: string[]): void;
  (event: 'open', node: BookmarkNode): void;
  (event: 'detail', id: string): void;
  (event: 'move', ids: string[]): void;
  (event: 'delete', ids: string[]): void;
  (event: 'edit', node: BookmarkNode): void;
}>();

/** 行高与缓冲区（文档：仅渲染视口内 ±20 行） */
const ROW_HEIGHT = 40;
const BUFFER = 20;

const container = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const viewportHeight = ref(600);
let observer: ResizeObserver | null = null;

const totalHeight = computed(() => props.items.length * ROW_HEIGHT);
const startIndex = computed(() =>
  Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT) - BUFFER),
);
const endIndex = computed(() =>
  Math.min(
    props.items.length,
    Math.ceil((scrollTop.value + viewportHeight.value) / ROW_HEIGHT) + BUFFER,
  ),
);
const visible = computed(() =>
  props.items.slice(startIndex.value, endIndex.value).map((entry, offset) => ({
    entry,
    index: startIndex.value + offset,
  })),
);

const allChecked = computed(
  () => props.items.length > 0 && props.items.every((entry) => props.selected.has(entry.node.id)),
);

function onScroll(): void {
  scrollTop.value = container.value?.scrollTop ?? 0;
}

onMounted(() => {
  if (!container.value) return;
  viewportHeight.value = container.value.clientHeight;
  observer = new ResizeObserver(() => {
    viewportHeight.value = container.value?.clientHeight ?? viewportHeight.value;
  });
  observer.observe(container.value);
});

onBeforeUnmount(() => observer?.disconnect());

/** 收藏图标：走 `_favicon` API（A1），非 http/https 用兜底图 */
function faviconUrl(node: BookmarkNode): string {
  const url = node.url ?? '';
  if (!/^https?:\/\//i.test(url)) return chrome.runtime.getURL('icons/bookmark-fallback.svg');
  return `${chrome.runtime.getURL('/_favicon/')}?pageUrl=${encodeURIComponent(url)}&size=32`;
}

function onFaviconError(event: Event): void {
  (event.target as HTMLImageElement).src = chrome.runtime.getURL('icons/bookmark-fallback.svg');
}

function statusClass(status: LinkStatus | undefined): string {
  switch (status?.status) {
    case 'ok':
      return 'bv-chip--ok';
    case 'dead':
      return 'bv-chip--danger';
    case 'suspect':
      return 'bv-chip--suspect';
    case 'unsupported':
      return 'bv-chip';
    default:
      return 'bv-chip';
  }
}

function statusText(status: LinkStatus | undefined): string {
  switch (status?.status) {
    case 'ok':
      return t('statusOk');
    case 'dead':
      return t('statusDead');
    case 'suspect':
      return t('statusSuspect');
    case 'unsupported':
      return t('statusUnsupported');
    default:
      return t('statusUntested');
  }
}

function folderLabel(entry: BookmarkEntry): string {
  return props.folderPaths[entry.node.parentId ?? ''] ?? '';
}

/* ---------------- 右键菜单（页面内自定义菜单，不用 contextMenus） ---------------- */
const menu = ref<{ x: number; y: number; node: BookmarkNode } | null>(null);

function openMenu(event: MouseEvent, node: BookmarkNode): void {
  event.preventDefault();
  menu.value = { x: event.clientX, y: event.clientY, node };
}

function closeMenu(): void {
  menu.value = null;
}

function menuAction(action: 'open' | 'edit' | 'move' | 'delete' | 'detail'): void {
  const current = menu.value;
  if (!current) return;
  closeMenu();
  const ids = props.selected.has(current.node.id)
    ? [...props.selected]
    : [current.node.id];
  switch (action) {
    case 'open':
      emit('open', current.node);
      break;
    case 'edit':
      emit('edit', current.node);
      break;
    case 'move':
      emit('move', ids);
      break;
    case 'delete':
      emit('delete', ids);
      break;
    case 'detail':
      emit('detail', current.node.id);
      break;
  }
}

/** 复制链接（B 类动作不走 contextMenus） */
async function copyLink(node: BookmarkNode): Promise<void> {
  closeMenu();
  if (!node.url) return;
  try {
    await navigator.clipboard.writeText(node.url);
  } catch (err) {
    console.warn('[list] 复制失败', err);
  }
}
</script>

<template>
  <div class="bv-list">
    <div class="bv-list__header">
      <label class="bv-list__check">
        <input
          type="checkbox"
          :checked="allChecked"
          :aria-label="t('actionSelectAll')"
          @change="emit('toggleAll', allChecked ? [] : items.map((item) => item.node.id))"
        />
      </label>
      <span class="bv-list__col bv-list__col--title">{{ t('colTitle') }}</span>
      <span class="bv-list__col bv-list__col--folder">{{ t('colFolder') }}</span>
      <span class="bv-list__col bv-list__col--status">{{ t('colStatus') }}</span>
    </div>

    <div ref="container" class="bv-list__body bv-scroll" @scroll="onScroll" @click="closeMenu">
      <div v-if="loading" class="bv-empty">{{ t('loading') }}</div>
      <div v-else-if="items.length === 0" class="bv-empty">{{ t('noBookmarks') }}</div>

      <div v-else class="bv-list__spacer" :style="{ height: `${totalHeight}px` }">
        <div
          v-for="row in visible"
          :key="row.entry.node.id"
          class="bv-list__row"
          :class="{ 'is-selected': selected.has(row.entry.node.id) }"
          :style="{ top: `${row.index * ROW_HEIGHT}px` }"
          @contextmenu="openMenu($event, row.entry.node)"
          @dblclick="emit('detail', row.entry.node.id)"
        >
          <label class="bv-list__check" @click.stop>
            <input
              type="checkbox"
              :checked="selected.has(row.entry.node.id)"
              @change="emit('toggle', row.entry.node.id)"
            />
          </label>

          <img
            class="bv-list__favicon"
            :src="faviconUrl(row.entry.node)"
            alt=""
            width="16"
            height="16"
            loading="lazy"
            @error="onFaviconError"
          />

          <div class="bv-list__main">
            <a
              class="bv-list__title"
              :href="row.entry.node.url"
              :title="row.entry.node.title"
              @click.prevent="emit('open', row.entry.node)"
            >
              {{ row.entry.node.title || row.entry.node.url }}
            </a>
            <span class="bv-list__url" :title="row.entry.node.url">{{ row.entry.node.url }}</span>
          </div>

          <span class="bv-list__folder" :title="folderLabel(row.entry)">
            {{ folderLabel(row.entry) }}
          </span>

          <span class="bv-list__status">
            <span class="bv-chip" :class="statusClass(statusMap[row.entry.node.id])">
              {{ statusText(statusMap[row.entry.node.id]) }}
            </span>
            <span
              v-for="tag in (metaMap[row.entry.node.id]?.tags ?? []).slice(0, 2)"
              :key="tag"
              class="bv-chip bv-chip--primary"
            >
              {{ tag }}
            </span>
          </span>
        </div>
      </div>
    </div>

    <!-- 自定义右键菜单 -->
    <div
      v-if="menu"
      class="bv-menu"
      :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
      @click.stop
    >
      <button type="button" class="bv-menu__item" @click="menuAction('open')">
        {{ t('actionOpen') }}
      </button>
      <button type="button" class="bv-menu__item" @click="copyLink(menu.node)">
        {{ t('actionCopyLink') }}
      </button>
      <button type="button" class="bv-menu__item" @click="menuAction('edit')">
        {{ t('actionEdit') }}
      </button>
      <button type="button" class="bv-menu__item" @click="menuAction('detail')">
        {{ t('actionTagsNote') }}
      </button>
      <button type="button" class="bv-menu__item" @click="menuAction('move')">
        {{ t('actionMoveTo') }}
      </button>
      <button
        type="button"
        class="bv-menu__item bv-menu__item--danger"
        @click="menuAction('delete')"
      >
        {{ t('actionDelete') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.bv-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  background: var(--bv-surface);
}

.bv-list__header {
  display: grid;
  grid-template-columns: 28px 16px minmax(0, 1fr) 180px 180px;
  gap: var(--bv-space-2);
  align-items: center;
  padding: 6px var(--bv-space-3);
  color: var(--bv-text-secondary);
  font-size: var(--bv-font-size-xs);
  border-bottom: 1px solid var(--bv-border);
}

.bv-list__body {
  position: relative;
  flex: 1;
  min-height: 0;
}

.bv-list__spacer {
  position: relative;
  width: 100%;
}

.bv-list__row {
  position: absolute;
  left: 0;
  right: 0;
  display: grid;
  grid-template-columns: 28px 16px minmax(0, 1fr) 180px 180px;
  gap: var(--bv-space-2);
  align-items: center;
  height: 40px;
  padding: 0 var(--bv-space-3);
  border-bottom: 1px solid var(--bv-border);
}

.bv-list__row:hover {
  background: var(--bv-surface-hover);
}

.bv-list__row.is-selected {
  background: var(--bv-primary-soft);
}

.bv-list__check {
  display: flex;
  align-items: center;
  justify-content: center;
}

.bv-list__favicon {
  width: 16px;
  height: 16px;
  border-radius: 2px;
  object-fit: contain;
}

.bv-list__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.35;
}

.bv-list__title {
  overflow: hidden;
  color: var(--bv-text);
  font-size: var(--bv-font-size-sm);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bv-list__title:hover {
  color: var(--bv-primary);
  text-decoration: underline;
}

.bv-list__url {
  overflow: hidden;
  color: var(--bv-text-tertiary);
  font-size: var(--bv-font-size-xs);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bv-list__folder {
  overflow: hidden;
  color: var(--bv-text-secondary);
  font-size: var(--bv-font-size-xs);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bv-list__status {
  display: flex;
  gap: var(--bv-space-1);
  align-items: center;
  overflow: hidden;
}

.bv-menu {
  position: fixed;
  z-index: var(--bv-z-dialog);
  min-width: 150px;
  padding: var(--bv-space-1);
  background: var(--bv-surface);
  border: 1px solid var(--bv-border);
  border-radius: var(--bv-radius-sm);
  box-shadow: var(--bv-shadow-2);
}

.bv-menu__item {
  display: block;
  width: 100%;
  padding: 6px var(--bv-space-2);
  color: var(--bv-text);
  font-size: var(--bv-font-size-sm);
  text-align: left;
  border-radius: var(--bv-radius-sm);
}

.bv-menu__item:hover {
  background: var(--bv-surface-hover);
}

.bv-menu__item--danger {
  color: var(--bv-danger);
}

.bv-menu__item--danger:hover {
  background: var(--bv-danger-soft);
}
</style>
