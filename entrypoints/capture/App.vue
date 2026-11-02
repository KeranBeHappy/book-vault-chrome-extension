<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import AppConfirm from '@/components/AppConfirm.vue';
import AppToast from '@/components/AppToast.vue';
import FolderPicker from '@/components/FolderPicker.vue';
import { applyTheme, resolveTheme } from '@/composables/useTheme';
import { useSafeAction } from '@/composables/useSafeAction';
import {
  buildIndex,
  collectFolders,
  getTree,
  type FolderRow,
  type ManagedRoot,
} from '@/modules/bookmarks';
import { normalizeUrl } from '@/modules/dedupe';
import { t, translateError } from '@/modules/i18n';
import { markDuplicates, readWindowTabs } from '@/modules/tabs-capture';
import { sendToBackground } from '@/shared/messages';
import type { CaptureCandidate, CaptureResult } from '@/shared/types';
import { useFeedbackStore } from '@/stores/feedback';

/**
 * 收藏小窗（J1 / J2）。
 *
 * 隐私边界：`tabs` 只在本次打开时读一次，候选只存在内存，不落盘（2.2）。
 * 写入必须走 SW 的 `capture:apply`，并先经 useSafeAction 生成快照 + 二次确认（4.1）。
 */
const feedback = useFeedbackStore();
const safe = useSafeAction();

const mode = ref<'page' | 'window'>('window');
const pageUrl = ref('');
const pageTitle = ref('');
const loading = ref(true);
const candidates = ref<CaptureCandidate[]>([]);
const duplicateUrls = ref<Set<string>>(new Set());
const excluded = ref(0);
const note = ref('');
const roots = ref<ManagedRoot[]>([]);
const folders = ref<FolderRow[]>([]);
const targetFolderId = ref('');
const report = ref<(CaptureResult & { excluded: number }) | null>(null);

/** 当前勾选的候选 */
const selected = computed(() => candidates.value.filter((item) => item.selected));

/** 目标文件夹的展示名（确认框里用） */
const targetLabel = computed(() => {
  const root = roots.value.find((item) => item.id === targetFolderId.value);
  if (root) return root.title;
  const folder = folders.value.find((item) => item.node.id === targetFolderId.value);
  return folder?.node.title || t('unnamedFolder');
});

/** 单条是否为「库里已存在」（界面打标并默认不勾选） */
function isDuplicate(item: CaptureCandidate): boolean {
  return duplicateUrls.value.has(item.normalized);
}

function toggleAll(checked: boolean): void {
  for (const item of candidates.value) {
    // 重复项即使全选也不勾上：写入时被 backend 跳过，勾了反而误导
    item.selected = checked && !isDuplicate(item);
  }
}

const allSelected = computed(
  () =>
    candidates.value.filter((item) => !isDuplicate(item)).every((item) => item.selected) &&
    candidates.value.some((item) => !isDuplicate(item)),
);

/** 读取候选标签 + 目标文件夹选项 */
async function bootstrap(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  mode.value = params.get('mode') === 'page' ? 'page' : 'window';
  pageUrl.value = params.get('url') ?? '';
  pageTitle.value = params.get('title') ?? '';

  try {
    // 主题按用户设置校正（main.ts 里只按系统偏好落了一次）
    const db = await sendToBackground({ type: 'db:get' });
    applyTheme(resolveTheme(db.settings.theme));

    const tree = await getTree();
    const index = buildIndex(tree);
    roots.value = index.roots;
    folders.value = collectFolders(tree, index);
    targetFolderId.value = index.roots[1]?.id ?? index.roots[0]?.id ?? '';

    if (mode.value === 'page' && pageUrl.value) {
      // 右键「收藏到签仓」：只处理当前页，不读整窗口标签
      const normalized = normalizeUrl(pageUrl.value);
      candidates.value = normalized
        ? [
            {
              title: pageTitle.value.trim() || pageUrl.value,
              url: pageUrl.value,
              normalized,
              selected: true,
            },
          ]
        : [];
      excluded.value = normalized ? 0 : 1;
    } else {
      const result = await readWindowTabs();
      candidates.value = result.candidates;
      excluded.value = result.excluded;
    }

    duplicateUrls.value = await markDuplicates(candidates.value);
    for (const item of candidates.value) {
      if (isDuplicate(item)) item.selected = false;
    }
  } catch (err) {
    console.error('[capture] 初始化失败', err);
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  } finally {
    loading.value = false;
  }
}

/** 执行收藏：快照 → 二次确认 → 写入 */
async function submit(): Promise<void> {
  const items = selected.value;
  if (items.length === 0) return;

  await safe.run({
    title: t('captureConfirmTitle'),
    message: t('captureConfirmMessage', { count: items.length, folder: targetLabel.value }),
    details: [t('snapshotRecoverable')],
    confirmText: t('actionConfirm'),
    execute: async (snapshotId) => {
      const result = await sendToBackground({
        type: 'capture:apply',
        items: items.map((item) => ({ title: item.title, url: item.url })),
        parentId: targetFolderId.value,
        note: note.value.trim(),
        snapshotId,
      });
      // 三态结果：成功 / 跳过（重复+失败）/ 排除（不可收藏）
      report.value = { ...result, excluded: excluded.value };
      return result;
    },
  });
}

function closeWindow(): void {
  window.close();
}

onMounted(bootstrap);
</script>

<template>
  <main class="bv-capture">
    <header class="bv-capture__head">
      <h1 class="bv-capture__title">
        {{ mode === 'page' ? t('captureModePage') : t('captureModeWindow') }}
      </h1>
      <span class="bv-capture__hint" v-if="!loading">
        {{ t('captureSelected', { count: selected.length }) }}
      </span>
    </header>

    <p v-if="loading" class="bv-capture__empty">{{ t('captureLoading') }}</p>

    <template v-else-if="report">
      <section class="bv-capture__report">
        <h2 class="bv-capture__subtitle">{{ t('captureResultTitle') }}</h2>
        <p class="bv-capture__line">{{ t('captureResultCreated', { count: report.created }) }}</p>
        <p class="bv-capture__line">
          {{ t('captureResultDuplicates', { count: report.duplicates }) }}
        </p>
        <p class="bv-capture__line">{{ t('captureResultExcluded', { count: report.excluded }) }}</p>
        <p v-if="report.failed.length > 0" class="bv-capture__line is-error">
          {{ t('captureResultFailed', { count: report.failed.length }) }}
        </p>
        <ul v-if="report.failed.length > 0" class="bv-capture__failed">
          <li v-for="(item, index) in report.failed" :key="index">
            <span class="bv-capture__failed-title">{{ item.title }}</span>
            <span class="bv-capture__failed-reason">{{ translateError(item.reason) }}</span>
          </li>
        </ul>
      </section>
      <div class="bv-capture__actions">
        <button class="bv-btn bv-btn--primary" type="button" @click="closeWindow">
          {{ t('captureCloseWindow') }}
        </button>
      </div>
    </template>

    <template v-else>
      <div class="bv-capture__toolbar">
        <label class="bv-capture__check">
          <input
            type="checkbox"
            :checked="allSelected"
            :disabled="candidates.length === 0"
            @change="toggleAll(($event.target as HTMLInputElement).checked)"
          />
          <span>{{ t('actionSelectAll') }}</span>
        </label>
        <span class="bv-spacer" />
        <span v-if="excluded > 0" class="bv-capture__hint">
          {{ t('captureExcludedHint', { count: excluded }) }}
        </span>
      </div>

      <ul v-if="candidates.length > 0" class="bv-capture__list bv-scroll">
        <li v-for="item in candidates" :key="item.normalized" class="bv-capture__row">
          <input v-model="item.selected" type="checkbox" :disabled="isDuplicate(item)" />
          <div class="bv-capture__meta">
            <span class="bv-capture__row-title" :title="item.title">{{ item.title }}</span>
            <span class="bv-capture__row-url" :title="item.url">{{ item.url }}</span>
          </div>
          <span v-if="isDuplicate(item)" class="bv-capture__tag">{{ t('captureDuplicateTag') }}</span>
        </li>
      </ul>
      <p v-else class="bv-capture__empty">{{ t('captureEmpty') }}</p>

      <label class="bv-capture__field">
        <span class="bv-capture__label">{{ t('captureTargetLabel') }}</span>
        <FolderPicker
          v-model="targetFolderId"
          :roots="roots"
          :folders="folders"
          :disabled="roots.length === 0"
        />
      </label>

      <label class="bv-capture__field">
        <span class="bv-capture__label">{{ t('captureNoteLabel') }}</span>
        <textarea
          v-model="note"
          class="bv-capture__note"
          rows="2"
          maxlength="5000"
          :placeholder="t('captureNotePlaceholder')"
        />
      </label>

      <div class="bv-capture__actions">
        <button class="bv-btn" type="button" @click="closeWindow">{{ t('actionCancel') }}</button>
        <button
          class="bv-btn bv-btn--primary"
          type="button"
          :disabled="selected.length === 0 || !targetFolderId"
          @click="submit"
        >
          {{ t('actionConfirm') }}
        </button>
      </div>
    </template>

    <AppConfirm />
    <AppToast />
  </main>
</template>

<style scoped>
.bv-capture {
  display: flex;
  flex-direction: column;
  gap: var(--bv-space-2);
  box-sizing: border-box;
  height: 100vh;
  padding: var(--bv-space-3);
  overflow: hidden;
  color: var(--bv-text);
  background: var(--bv-bg);
  font: var(--bv-font-body);
}

.bv-capture__head {
  display: flex;
  gap: var(--bv-space-2);
  align-items: baseline;
}

.bv-capture__title {
  margin: 0;
  font-size: var(--bv-font-size-md);
  font-weight: 600;
}

.bv-capture__subtitle {
  margin: 0 0 var(--bv-space-2);
  font-size: var(--bv-font-size-sm);
  font-weight: 600;
}

.bv-capture__hint,
.bv-capture__label {
  color: var(--bv-text-secondary);
  font-size: var(--bv-font-size-xs);
}

.bv-capture__toolbar {
  display: flex;
  gap: var(--bv-space-2);
  align-items: center;
}

.bv-capture__check {
  display: flex;
  gap: 6px;
  align-items: center;
  color: var(--bv-text-secondary);
  font-size: var(--bv-font-size-xs);
}

.bv-capture__list {
  flex: 1;
  padding: 0;
  margin: 0;
  overflow: auto;
  list-style: none;
  border: 1px solid var(--bv-border);
  border-radius: var(--bv-radius-sm);
}

.bv-capture__row {
  display: flex;
  gap: var(--bv-space-2);
  align-items: center;
  padding: 6px var(--bv-space-2);
  border-bottom: 1px solid var(--bv-border);
}

.bv-capture__meta {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.bv-capture__row-title {
  overflow: hidden;
  color: var(--bv-text);
  font-size: var(--bv-font-size-xs);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bv-capture__row-url {
  overflow: hidden;
  color: var(--bv-text-tertiary);
  font-size: var(--bv-font-size-xs);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bv-capture__tag {
  flex: none;
  padding: 1px 6px;
  color: var(--bv-suspect);
  font-size: var(--bv-font-size-xs);
  border: 1px solid var(--bv-suspect);
  border-radius: var(--bv-radius-sm);
}

.bv-capture__field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bv-capture__note {
  padding: 6px var(--bv-space-2);
  color: var(--bv-text);
  font: var(--bv-font-body);
  font-size: var(--bv-font-size-xs);
  background: var(--bv-surface);
  border: 1px solid var(--bv-border);
  border-radius: var(--bv-radius-sm);
  resize: vertical;
}

.bv-capture__empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  color: var(--bv-text-secondary);
  font-size: var(--bv-font-size-xs);
}

.bv-capture__report {
  flex: 1;
  overflow: auto;
}

.bv-capture__line {
  margin: 0 0 4px;
  color: var(--bv-text);
  font-size: var(--bv-font-size-sm);
}

.bv-capture__line.is-error {
  color: var(--bv-danger);
}

.bv-capture__failed {
  padding-left: var(--bv-space-3);
  margin: var(--bv-space-2) 0 0;
  color: var(--bv-text-secondary);
  font-size: var(--bv-font-size-xs);
}

.bv-capture__failed-title {
  margin-right: var(--bv-space-1);
}

.bv-capture__failed-reason {
  color: var(--bv-danger);
}

.bv-capture__actions {
  display: flex;
  gap: var(--bv-space-2);
  justify-content: flex-end;
}
</style>
