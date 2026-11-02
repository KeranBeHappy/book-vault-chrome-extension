<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';

import { findSimilarTitles, groupDuplicates, titleSimilarity } from '@/modules/dedupe';
import type { BookmarkEntry } from '@/modules/bookmarks';
import { t } from '@/modules/i18n';

const props = defineProps<{
  entries: BookmarkEntry[];
  folderPaths: Record<string, string>;
  threshold: number;
}>();

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'merge', payload: { keepIds: string[]; removeIds: string[] }): void;
}>();

const activeTab = ref<'url' | 'title'>('url');
const kept = reactive<Record<string, string[]>>({});

const entryMap = computed(() => new Map(props.entries.map((entry) => [entry.node.id, entry])));

/** URL 归一化重复组（4.2） */
const urlGroups = computed(() =>
  groupDuplicates(props.entries.map((entry) => ({ id: entry.node.id, url: entry.node.url }))),
);

/** 标题相似对（F2：仅同 host 内两两比较，> 50 的组跳过） */
const similar = computed(() =>
  findSimilarTitles(
    props.entries.map((entry) => ({
      id: entry.node.id,
      title: entry.node.title,
      url: entry.node.url,
    })),
    props.threshold,
  ),
);

// 每组默认保留第一条
watch(
  urlGroups,
  (groups) => {
    for (const group of groups) {
      if (!kept[group.normalizedUrl]) kept[group.normalizedUrl] = [group.bookmarkIds[0] ?? ''];
    }
  },
  { immediate: true },
);

function isKept(groupKey: string, id: string): boolean {
  return (kept[groupKey] ?? []).includes(id);
}

function toggleKeep(groupKey: string, id: string): void {
  const current = new Set(kept[groupKey] ?? []);
  if (current.has(id)) current.delete(id);
  else current.add(id);
  kept[groupKey] = [...current];
}

/** 合并：保留勾选项，其余删除（F3：被删项标签备注不迁移） */
function mergeAll(): void {
  const keepIds: string[] = [];
  const removeIds: string[] = [];
  for (const group of urlGroups.value) {
    const keep = kept[group.normalizedUrl] ?? [];
    if (keep.length === 0) continue; // 未选定保留项则不处理该组
    for (const id of group.bookmarkIds) {
      if (keep.includes(id)) keepIds.push(id);
      else removeIds.push(id);
    }
  }
  if (removeIds.length === 0) return;
  emit('merge', { keepIds, removeIds });
}

function entryOf(id: string): BookmarkEntry | undefined {
  return entryMap.value.get(id);
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** 供模板展示的相似对（附带标题，避免模板里重复查表） */
const similarRows = computed(() =>
  similar.value.pairs.map((pair) => {
    const left = entryMap.value.get(pair.a);
    const right = entryMap.value.get(pair.b);
    return {
      key: `${pair.a}-${pair.b}`,
      leftTitle: left?.node.title ?? '',
      leftUrl: left?.node.url ?? '',
      rightTitle: right?.node.title ?? '',
      rightUrl: right?.node.url ?? '',
      score: pair.score,
      check: titleSimilarity(left?.node.title ?? '', right?.node.title ?? ''),
    };
  }),
);
</script>

<template>
  <div class="bv-mask" @click.self="emit('close')">
    <section class="bv-dup" role="dialog" aria-modal="true">
      <header class="bv-dup__head">
        <h2 class="bv-section-title">{{ t('dedupeTitle') }}</h2>
        <button class="bv-btn bv-btn--ghost bv-btn--sm" type="button" @click="emit('close')">
          ✕
        </button>
      </header>

      <div class="bv-dup__tabs">
        <button
          type="button"
          class="bv-btn bv-btn--sm"
          :class="{ 'bv-btn--primary': activeTab === 'url' }"
          @click="activeTab = 'url'"
        >
          {{ t('dedupeTabUrl', { count: urlGroups.length }) }}
        </button>
        <button
          type="button"
          class="bv-btn bv-btn--sm"
          :class="{ 'bv-btn--primary': activeTab === 'title' }"
          @click="activeTab = 'title'"
        >
          {{ t('dedupeTabTitle', { count: similarRows.length }) }}
        </button>
      </div>

      <div class="bv-dup__body bv-scroll">
        <template v-if="activeTab === 'url'">
          <p v-if="urlGroups.length === 0" class="bv-empty">{{ t('dedupeEmpty') }}</p>
          <div v-for="group in urlGroups" :key="group.normalizedUrl" class="bv-dup__group">
            <header class="bv-dup__group-head">
              <span class="bv-dup__group-url" :title="group.normalizedUrl">
                {{ group.normalizedUrl }}
              </span>
              <span class="bv-chip">{{ t('dedupeCount', { count: group.bookmarkIds.length }) }}</span>
            </header>
            <ul class="bv-dup__items">
              <li
                v-for="id in group.bookmarkIds"
                :key="id"
                class="bv-dup__item"
                :class="{ 'is-kept': isKept(group.normalizedUrl, id) }"
              >
                <label class="bv-row">
                  <input
                    type="checkbox"
                    :checked="isKept(group.normalizedUrl, id)"
                    @change="toggleKeep(group.normalizedUrl, id)"
                  />
                  <span class="bv-dup__item-title">{{ entryOf(id)?.node.title }}</span>
                </label>
                <span class="bv-dup__item-meta">
                  {{ folderPaths[entryOf(id)?.node.parentId ?? ''] ?? '' }}
                </span>
              </li>
            </ul>
          </div>
        </template>

        <template v-else>
          <p v-if="similarRows.length === 0" class="bv-empty">{{ t('dedupeTitleEmpty') }}</p>
          <p v-else class="bv-hint">{{ t('dedupeTitleHint') }}</p>
          <ul class="bv-dup__similar">
            <li v-for="row in similarRows" :key="row.key" class="bv-dup__similar-row">
              <span class="bv-dup__similar-title" :title="row.leftUrl">{{ row.leftTitle }}</span>
              <span class="bv-dup__similar-title" :title="row.rightUrl">{{ row.rightTitle }}</span>
              <span class="bv-chip bv-chip--suspect">{{ percent(row.score) }}</span>
            </li>
          </ul>
          <p v-if="similar.skipped > 0" class="bv-hint">
            {{ t('dedupeSkipped', { count: similar.skipped }) }}
          </p>
        </template>
      </div>

      <footer class="bv-dup__foot">
        <span class="bv-hint">{{ t('dedupeFooterHint') }}</span>
        <span class="bv-spacer" />
        <button class="bv-btn" type="button" @click="emit('close')">
          {{ t('actionClose') }}
        </button>
        <button
          v-if="activeTab === 'url'"
          class="bv-btn bv-btn--primary"
          type="button"
          :disabled="urlGroups.length === 0"
          @click="mergeAll"
        >
          {{ t('actionMerge') }}
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

.bv-dup {
  display: flex;
  flex-direction: column;
  width: 860px;
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 64px);
  background: var(--bv-surface);
  border: 1px solid var(--bv-border);
  border-radius: var(--bv-radius-md);
  box-shadow: var(--bv-shadow-3);
}

.bv-dup__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--bv-space-3) var(--bv-space-4);
  border-bottom: 1px solid var(--bv-border);
}

.bv-dup__tabs {
  display: flex;
  gap: var(--bv-space-2);
  padding: var(--bv-space-2) var(--bv-space-4);
  border-bottom: 1px solid var(--bv-border);
}

.bv-dup__body {
  flex: 1;
  min-height: 0;
  padding: var(--bv-space-3) var(--bv-space-4);
  overflow: auto;
}

.bv-dup__group {
  margin-bottom: var(--bv-space-3);
  border: 1px solid var(--bv-border);
  border-radius: var(--bv-radius-sm);
}

.bv-dup__group-head {
  display: flex;
  gap: var(--bv-space-2);
  align-items: center;
  justify-content: space-between;
  padding: 6px var(--bv-space-2);
  background: var(--bv-surface-sunken);
  border-bottom: 1px solid var(--bv-border);
}

.bv-dup__group-url {
  overflow: hidden;
  color: var(--bv-text-secondary);
  font-family: var(--bv-font-mono);
  font-size: var(--bv-font-size-xs);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bv-dup__items {
  padding: var(--bv-space-1) var(--bv-space-2);
  margin: 0;
  list-style: none;
}

.bv-dup__item {
  display: flex;
  gap: var(--bv-space-2);
  align-items: center;
  justify-content: space-between;
  padding: 4px var(--bv-space-1);
  border-radius: var(--bv-radius-sm);
}

.bv-dup__item.is-kept {
  background: var(--bv-primary-soft);
}

.bv-dup__item-title {
  overflow: hidden;
  font-size: var(--bv-font-size-sm);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bv-dup__item-meta {
  flex-shrink: 0;
  color: var(--bv-text-tertiary);
  font-size: var(--bv-font-size-xs);
}

.bv-dup__similar {
  padding: 0;
  margin: var(--bv-space-2) 0 0;
  list-style: none;
}

.bv-dup__similar-row {
  display: grid;
  grid-template-columns: 1fr 1fr 64px;
  gap: var(--bv-space-2);
  align-items: center;
  padding: 6px 0;
  border-bottom: 1px solid var(--bv-border);
}

.bv-dup__similar-title {
  overflow: hidden;
  font-size: var(--bv-font-size-sm);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bv-dup__foot {
  display: flex;
  gap: var(--bv-space-2);
  align-items: center;
  padding: var(--bv-space-3) var(--bv-space-4);
  border-top: 1px solid var(--bv-border);
}
</style>
