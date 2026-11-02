<script setup lang="ts">
import { computed, ref } from 'vue';

import { deleteTagIn, renameTagIn } from '@/modules/tags';
import { t, translateError } from '@/modules/i18n';
import type { BookmarkMeta } from '@/shared/types';
import { useDbStore } from '@/stores/db';
import { useFeedbackStore } from '@/stores/feedback';
import { useUiStore } from '@/stores/ui';

const props = defineProps<{
  tags: Array<{ tag: string; count: number }>;
  orphanMeta: Record<string, BookmarkMeta>;
  activeTags: string[];
}>();

const dbStore = useDbStore();
const feedback = useFeedbackStore();
const ui = useUiStore();

const renaming = ref<string | null>(null);
const renameValue = ref('');
const pending = ref(false);

const orphanEntries = computed(() => Object.entries(props.orphanMeta));

function filterBy(tag: string): void {
  const next = props.activeTags.includes(tag)
    ? props.activeTags.filter((item) => item !== tag)
    : [...props.activeTags, tag];
  ui.setTagFilter(next);
  ui.setView('manager');
}

function startRename(tag: string): void {
  renaming.value = tag;
  renameValue.value = tag;
}

/** 标签重命名：同步更新所有关联书签（含 orphanMeta） */
async function submitRename(): Promise<void> {
  const from = renaming.value;
  const to = renameValue.value.trim();
  if (!from || !to || from === to) {
    renaming.value = null;
    return;
  }
  pending.value = true;
  try {
    const db = dbStore.db;
    if (!db) return;
    const result = renameTagIn(db.bookmarkMeta, db.orphanMeta, from, to);
    await dbStore.patch({ bookmarkMeta: result.bookmarkMeta, orphanMeta: result.orphanMeta });
    feedback.success(t('tagRenameDone', { count: result.updated }));
    renaming.value = null;
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  } finally {
    pending.value = false;
  }
}

/** 标签删除：仅解除关联，不删书签 */
async function removeTag(tag: string): Promise<void> {
  const db = dbStore.db;
  if (!db) return;
  const ok = await feedback.ask({
    title: t('tagDeleteTitle'),
    message: t('tagDeleteMessage', { tag }),
    details: [t('tagDeleteDetail')],
    danger: true,
  });
  if (!ok) return;
  pending.value = true;
  try {
    const result = deleteTagIn(db.bookmarkMeta, db.orphanMeta, tag);
    await dbStore.patch({ bookmarkMeta: result.bookmarkMeta, orphanMeta: result.orphanMeta });
    feedback.success(t('tagDeleteDone', { count: result.updated }));
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  } finally {
    pending.value = false;
  }
}

/** 清理挂起记录（I1：orphanMeta 只增不减，除用户清理或重新匹配） */
async function clearOrphans(): Promise<void> {
  if (orphanEntries.value.length === 0) return;
  const ok = await feedback.ask({
    title: t('orphanClearTitle'),
    message: t('orphanClearMessage', { count: orphanEntries.value.length }),
    details: [t('orphanClearDetail')],
    danger: true,
  });
  if (!ok) return;
  try {
    await dbStore.patch({ orphanMeta: {} });
    feedback.success(t('orphanCleared'));
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}
</script>

<template>
  <section class="bv-tags bv-scroll">
    <header class="bv-row">
      <h2 class="bv-section-title" style="margin: 0">{{ t('tagsTitle') }}</h2>
      <span class="bv-spacer" />
      <button v-if="activeTags.length > 0" class="bv-btn" type="button" @click="ui.setTagFilter([])">
        {{ t('actionClearFilter') }}
      </button>
    </header>

    <p class="bv-hint">{{ t('tagsHint') }}</p>

    <div v-if="tags.length === 0" class="bv-empty">{{ t('tagsEmpty') }}</div>

    <ul v-else class="bv-tags__cloud">
      <li v-for="item in tags" :key="item.tag" class="bv-tags__item">
        <template v-if="renaming === item.tag">
          <input
            v-model="renameValue"
            class="bv-input bv-tags__input"
            type="text"
            maxlength="32"
            @keydown.enter.prevent="submitRename"
            @keydown.esc="renaming = null"
          />
          <button class="bv-btn bv-btn--sm bv-btn--primary" type="button" :disabled="pending" @click="submitRename">
            {{ t('actionSave') }}
          </button>
          <button class="bv-btn bv-btn--sm" type="button" @click="renaming = null">
            {{ t('actionCancel') }}
          </button>
        </template>
        <template v-else>
          <button
            type="button"
            class="bv-tags__tag"
            :class="{ 'is-active': activeTags.includes(item.tag) }"
            @click="filterBy(item.tag)"
          >
            #{{ item.tag }}
            <span class="bv-tags__count">{{ item.count }}</span>
          </button>
          <button class="bv-btn bv-btn--ghost bv-btn--sm" type="button" @click="startRename(item.tag)">
            {{ t('actionRename') }}
          </button>
          <button class="bv-btn bv-btn--ghost bv-btn--sm" type="button" @click="removeTag(item.tag)">
            {{ t('actionDelete') }}
          </button>
        </template>
      </li>
    </ul>

    <div class="bv-divider" />

    <div class="bv-card">
      <div class="bv-row">
        <h3 class="bv-section-title" style="margin: 0">{{ t('orphanTitle') }}</h3>
        <span class="bv-chip">{{ orphanEntries.length }}</span>
        <span class="bv-spacer" />
        <button
          class="bv-btn bv-btn--danger bv-btn--sm"
          type="button"
          :disabled="orphanEntries.length === 0"
          @click="clearOrphans"
        >
          {{ t('actionClearOrphans') }}
        </button>
      </div>
      <p class="bv-hint">{{ t('orphanHint') }}</p>
      <ul v-if="orphanEntries.length > 0" class="bv-tags__orphans">
        <li v-for="[key, meta] in orphanEntries" :key="key" class="bv-tags__orphan">
          <span class="bv-chip">{{ meta.tags.join(' / ') || t('none') }}</span>
          <span class="bv-tags__orphan-note">{{ meta.note || t('none') }}</span>
          <span class="bv-tags__orphan-key">{{ key.slice(0, 12) }}…</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.bv-tags {
  display: flex;
  flex-direction: column;
  gap: var(--bv-space-3);
  padding: var(--bv-space-4);
  height: 100%;
  overflow: auto;
}

.bv-tags__cloud {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bv-space-2);
  padding: 0;
  margin: 0;
  list-style: none;
}

.bv-tags__item {
  display: flex;
  gap: var(--bv-space-1);
  align-items: center;
  padding: 2px 4px;
  background: var(--bv-surface);
  border: 1px solid var(--bv-border);
  border-radius: var(--bv-radius-sm);
}

.bv-tags__tag {
  display: inline-flex;
  gap: var(--bv-space-1);
  align-items: center;
  padding: 2px var(--bv-space-2);
  color: var(--bv-text);
  font-size: var(--bv-font-size-sm);
  border-radius: var(--bv-radius-sm);
}

.bv-tags__tag:hover {
  background: var(--bv-primary-soft);
}

.bv-tags__tag.is-active {
  color: var(--bv-primary);
  background: var(--bv-primary-soft);
}

.bv-tags__count {
  color: var(--bv-text-tertiary);
  font-size: var(--bv-font-size-xs);
}

.bv-tags__input {
  width: 140px;
  height: 24px;
}

.bv-tags__orphans {
  padding: 0;
  margin: var(--bv-space-2) 0 0;
  list-style: none;
}

.bv-tags__orphan {
  display: grid;
  grid-template-columns: 160px 1fr 90px;
  gap: var(--bv-space-2);
  align-items: center;
  padding: 4px 0;
  font-size: var(--bv-font-size-xs);
  border-bottom: 1px solid var(--bv-border);
}

.bv-tags__orphan-note {
  overflow: hidden;
  color: var(--bv-text-secondary);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bv-tags__orphan-key {
  color: var(--bv-text-tertiary);
  font-family: var(--bv-font-mono);
  text-align: right;
}
</style>
