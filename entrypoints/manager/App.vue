<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import AppConfirm from '@/components/AppConfirm.vue';
import AppToast from '@/components/AppToast.vue';
import BackupHistory from '@/components/BackupHistory.vue';
import BookmarkDialog from '@/components/BookmarkDialog.vue';
import BookmarkList from '@/components/BookmarkList.vue';
import DetailPanel from '@/components/DetailPanel.vue';
import DuplicatePanel from '@/components/DuplicatePanel.vue';
import FolderPicker from '@/components/FolderPicker.vue';
import FolderTree from '@/components/FolderTree.vue';
import RuleEditor from '@/components/RuleEditor.vue';
import SettingsPanel from '@/components/SettingsPanel.vue';
import StatsPanel from '@/components/StatsPanel.vue';
import TagPanel from '@/components/TagPanel.vue';
import { useSafeAction } from '@/composables/useSafeAction';
import { useStorageSync } from '@/composables/useStorageSync';
import { useTheme } from '@/composables/useTheme';
import {
  countBookmarks,
  domainOf,
  findEmptyFolders,
  isHttpUrl,
  validateUrl,
  type BookmarkEntry,
} from '@/modules/bookmarks';
import { computeImpact } from '@/modules/classifier';
import { groupDuplicates } from '@/modules/dedupe';
import { setLanguage, t, translateError } from '@/modules/i18n';
import { buildCsv } from '@/modules/scanner';
import { tagCounts } from '@/modules/tags';
import { downloadText } from '@/modules/io';
import { sendToBackground, type RestoreOutcome } from '@/shared/messages';
import { HTTP_LIMITS } from '@/shared/constants';
import type {
  BookmarkNode,
  CsvRow,
  LinkStatus,
  ManagerView,
  RemoteBackupEntry,
  StatsSummary,
  UiState,
} from '@/shared/types';
import { formatLocalStamp } from '@/shared/util';
import { useBookmarksStore } from '@/stores/bookmarks';
import { useDbStore } from '@/stores/db';
import { useFeedbackStore } from '@/stores/feedback';
import { useUiStore } from '@/stores/ui';

const dbStore = useDbStore();
const books = useBookmarksStore();
const ui = useUiStore();
const feedback = useFeedbackStore();
const safe = useSafeAction();

/** 主题跟随设置；语言切换即时生效 */
useTheme(() => dbStore.settings?.theme ?? 'system');
useStorageSync();

const VIEWS: ManagerView[] = ['manager', 'stats', 'rules', 'tags', 'backup', 'settings'];

const booting = ref(true);
const searchInput = ref('');
const debouncedKeyword = ref('');
const cloudSnapshots = ref<RemoteBackupEntry[]>([]);
const cloudLoading = ref(false);
const showDedupe = ref(false);
const busy = ref(false);

let searchTimer: ReturnType<typeof setTimeout> | null = null;
let reloadTimer: ReturnType<typeof setTimeout> | null = null;

/* ------------------------------------------------------------------ */
/* 启动与同步                                                          */
/* ------------------------------------------------------------------ */

onMounted(async () => {
  await Promise.all([dbStore.load(), books.reload()]);
  if (dbStore.db) {
    ui.hydrate(dbStore.db.uiState);
    searchInput.value = dbStore.db.uiState.filter?.keyword ?? '';
    debouncedKeyword.value = searchInput.value;
    books.buildSearchIndex(dbStore.bookmarkMeta);
  }
  booting.value = false;

  chrome.bookmarks.onCreated.addListener(scheduleReload);
  chrome.bookmarks.onRemoved.addListener(scheduleReload);
  chrome.bookmarks.onChanged.addListener(scheduleReload);
  chrome.bookmarks.onMoved.addListener(scheduleReload);
});

onUnmounted(() => {
  chrome.bookmarks.onCreated.removeListener(scheduleReload);
  chrome.bookmarks.onRemoved.removeListener(scheduleReload);
  chrome.bookmarks.onChanged.removeListener(scheduleReload);
  chrome.bookmarks.onMoved.removeListener(scheduleReload);
  if (searchTimer) clearTimeout(searchTimer);
  if (reloadTimer) clearTimeout(reloadTimer);
});

/** 外部变更后 300ms 内合并重载（A9：2 秒内同步） */
function scheduleReload(): void {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    void books.reload().then(() => books.buildSearchIndex(dbStore.bookmarkMeta));
  }, 300);
}

// 标签变化要重建搜索索引（A6 匹配标签与备注）
watch(
  () => dbStore.bookmarkMeta,
  (meta) => books.buildSearchIndex(meta),
  { deep: true },
);

// 语言设置变化即时生效（H2）
watch(
  () => dbStore.settings?.language,
  (language) => {
    if (language) setLanguage(language);
  },
);

// 搜索输入防抖 150ms（A6）
watch(searchInput, (value) => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    debouncedKeyword.value = value;
    ui.setKeyword(value);
  }, 150);
});

/* ------------------------------------------------------------------ */
/* 列表筛选与排序                                                      */
/* ------------------------------------------------------------------ */

const linkStatus = computed(() => dbStore.linkStatus);
const metaMap = computed(() => dbStore.bookmarkMeta);

/** 文件夹计数（树徽标用） */
const folderCounts = computed<Record<string, number>>(() => {
  const counts: Record<string, number> = {};
  const index = books.index;
  if (!index) return counts;
  for (const entry of books.entries) {
    counts[entry.rootId] = (counts[entry.rootId] ?? 0) + 1;
    let current = entry.node.parentId;
    while (current) {
      counts[current] = (counts[current] ?? 0) + 1;
      if (current === entry.rootId) break;
      current = index.parentOf.get(current);
    }
  }
  return counts;
});

/** 是否位于当前选中文件夹（含子孙） */
function inSelectedFolder(entry: BookmarkEntry): boolean {
  const target = ui.selectedFolderId;
  if (!target) return true;
  if (entry.rootId === target) return true;
  let current = entry.node.parentId;
  while (current) {
    if (current === target) return true;
    current = books.index?.parentOf.get(current);
  }
  return false;
}

const filtered = computed<BookmarkEntry[]>(() => {
  let list = books.entries.filter(inSelectedFolder);

  const keyword = debouncedKeyword.value.trim().toLowerCase();
  if (keyword) {
    list = list.filter((entry) => (books.haystacks[entry.node.id] ?? '').includes(keyword));
  }

  if (ui.statusFilter) {
    list = list.filter(
      (entry) => (linkStatus.value[entry.node.id]?.status ?? 'untested') === ui.statusFilter,
    );
  }

  if (ui.tagFilter.length > 0) {
    list = list.filter((entry) => {
      const tags = (metaMap.value[entry.node.id]?.tags ?? []).map((tag) => tag.toLowerCase());
      return ui.tagFilter.every((tag) => tags.includes(tag.toLowerCase()));
    });
  }

  const dir = ui.sortDir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    if (ui.sortKey === 'title') return a.node.title.localeCompare(b.node.title) * dir;
    if (ui.sortKey === 'domain') return domainOf(a.node.url).localeCompare(domainOf(b.node.url)) * dir;
    return ((a.node.dateAdded ?? 0) - (b.node.dateAdded ?? 0)) * dir;
  });
});

const selectedIds = computed(() => ui.selectedSet);

const currentMeta = computed(() =>
  ui.detailId ? metaMap.value[ui.detailId] : undefined,
);
const currentEntry = computed(
  () => books.entries.find((entry) => entry.node.id === ui.detailId) ?? null,
);

/* ------------------------------------------------------------------ */
/* 统计概览（A7）                                                      */
/* ------------------------------------------------------------------ */

const stats = computed<StatsSummary | null>(() => {
  if (!books.tree) return null;
  const entries = books.entries;
  const duplicates = groupDuplicates(entries.map((entry) => ({ id: entry.node.id, url: entry.node.url })));

  const statusKeys = Object.keys(linkStatus.value);
  const dead = statusKeys.length === 0
    ? null
    : statusKeys.filter((id) => linkStatus.value[id]?.status === 'dead').length;
  const suspect = statusKeys.length === 0
    ? null
    : statusKeys.filter((id) => linkStatus.value[id]?.status === 'suspect').length;

  // 一级分类：受管根下的直接子文件夹，按文件夹名分组（同名合并）
  const categoryMap = new Map<string, number>();
  for (const root of books.roots) {
    const node = books.index?.byId.get(root.id);
    for (const child of node?.children ?? []) {
      if (child.url !== undefined) continue;
      const name = child.title || t('unnamedFolder');
      categoryMap.set(name, (categoryMap.get(name) ?? 0) + countBookmarks(child));
    }
  }

  const tagSet = new Set<string>();
  for (const meta of Object.values(metaMap.value)) {
    for (const tag of meta.tags) tagSet.add(tag.toLowerCase());
  }

  return {
    total: entries.length,
    duplicateGroups: duplicates.length,
    dead,
    suspect,
    categories: [...categoryMap.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    emptyFolders: findEmptyFolders(books.tree).length,
    tagCount: tagSet.size,
  };
});

/* ------------------------------------------------------------------ */
/* 后台任务                                                            */
/* ------------------------------------------------------------------ */

const runningJobs = computed(() =>
  Object.values(dbStore.jobs).filter((job) => job.status === 'running'),
);

async function startJob(kind: 'linkCheck' | 'titleRefresh'): Promise<void> {
  const pool = ui.selection.length > 0
    ? books.entries.filter((entry) => ui.selection.includes(entry.node.id))
    : filtered.value;
  const ids = pool.filter((entry) => isHttpUrl(entry.node.url)).map((entry) => entry.node.id);
  if (ids.length === 0) {
    feedback.error(t('errNoHttpBookmarks'));
    return;
  }
  try {
    await sendToBackground({ type: 'job:start', kind, ids });
    feedback.success(t('jobStarted', { count: ids.length }));
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

async function cancelJob(jobId: string): Promise<void> {
  try {
    await sendToBackground({ type: 'job:cancel', jobId });
    feedback.success(t('jobCanceled'));
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

/** 已处理过的标题刷新任务（避免重复触发回填确认） */
const handledTitleJobs = new Set<string>();

// 标题刷新完成后进入「确认回填」流程（B2）
watch(
  () => dbStore.jobs,
  (jobs) => {
    for (const job of Object.values(jobs)) {
      if (job.kind !== 'titleRefresh' || job.status !== 'completed') continue;
      if (handledTitleJobs.has(job.id)) continue;
      handledTitleJobs.add(job.id);
      void applyTitleRefresh(job.id);
    }
  },
  { deep: true },
);

/** 回填标题：显示「将修改 N 条标题」，确认后写入并记入撤销日志 */
async function applyTitleRefresh(jobId: string): Promise<void> {
  try {
    const results = await sendToBackground({ type: 'job:results', jobId });
    const changed = Object.entries(results).filter(([id, title]) => {
      const entry = books.entries.find((item) => item.node.id === id);
      return entry && entry.node.title !== title.trim() && title.trim().length > 0;
    });
    if (changed.length === 0) {
      feedback.toast(t('titleRefreshNoChange'));
      return;
    }
    await safe.run({
      title: t('titleApplyTitle'),
      message: t('titleApplyMessage', { count: changed.length }),
      details: [t('titleApplyDetail')],
      confirmText: t('actionApply'),
      execute: async (snapshotId) => {
        const result = await sendToBackground({ type: 'title:apply', jobId, snapshotId });
        feedback.success(t('titleApplied', { updated: result.updated, failed: result.failed }));
        return result;
      },
    });
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

/* ------------------------------------------------------------------ */
/* 书签 / 文件夹操作                                                   */
/* ------------------------------------------------------------------ */

type DialogMode = 'createBookmark' | 'editBookmark' | 'prompt' | 'move' | null;
const dialog = ref<DialogMode>(null);
const dialogNode = ref<BookmarkNode | null>(null);
const promptState = ref<{ title: string; value: string; resolve: (value: string | null) => void } | null>(
  null,
);
const moveIds = ref<string[]>([]);
const moveTarget = ref('');
const dialogFolderId = ref('');

function defaultFolderId(): string {
  if (ui.selectedFolderId && books.folders.some((f) => f.node.id === ui.selectedFolderId)) {
    return ui.selectedFolderId;
  }
  if (ui.selectedFolderId && books.roots.some((root) => root.id === ui.selectedFolderId)) {
    return ui.selectedFolderId;
  }
  return books.roots[1]?.id ?? books.roots[0]?.id ?? '';
}

function openCreateBookmark(): void {
  dialogNode.value = null;
  dialogFolderId.value = defaultFolderId();
  dialog.value = 'createBookmark';
}

function openEditBookmark(node: BookmarkNode): void {
  dialogNode.value = node;
  dialog.value = 'editBookmark';
}

/** 通用文本输入框（新建/重命名文件夹） */
function askText(title: string, value = ''): Promise<string | null> {
  return new Promise((resolve) => {
    promptState.value = { title, value, resolve };
    dialog.value = 'prompt';
  });
}

function submitPrompt(): void {
  const state = promptState.value;
  promptState.value = null;
  dialog.value = null;
  state?.resolve(state.value.trim() || null);
}

function cancelPrompt(): void {
  const state = promptState.value;
  promptState.value = null;
  dialog.value = null;
  state?.resolve(null);
}

async function submitBookmark(payload: { title: string; url: string; parentId: string }): Promise<void> {
  const mode = dialog.value;
  dialog.value = null;
  try {
    if (mode === 'editBookmark' && dialogNode.value) {
      await sendToBackground({
        type: 'bm:update',
        id: dialogNode.value.id,
        title: payload.title,
        url: payload.url,
      });
      feedback.success(t('bookmarkSaved'));
    } else {
      await sendToBackground({
        type: 'bm:create',
        parentId: payload.parentId,
        title: payload.title,
        url: payload.url,
      });
      feedback.success(t('bookmarkCreated'));
    }
    await books.reload();
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

async function createFolder(parentId: string): Promise<void> {
  const name = await askText(t('folderCreateTitle'));
  if (!name) return;
  try {
    await sendToBackground({ type: 'folder:create', parentId, title: name });
    await books.reload();
    feedback.success(t('folderCreated'));
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

async function renameFolder(node: BookmarkNode): Promise<void> {
  const name = await askText(t('folderRenameTitle'), node.title);
  if (!name || name === node.title) return;
  try {
    await sendToBackground({ type: 'folder:rename', id: node.id, title: name });
    await books.reload();
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

/** 删除文件夹：确认框必须显示连带删除的书签数量（A3） */
async function deleteFolder(node: BookmarkNode): Promise<void> {
  const count = countBookmarks(node);
  await safe.run({
    title: t('folderDeleteTitle'),
    message: t('folderDeleteMessage', { name: node.title || t('unnamedFolder') }),
    details: [t('folderDeleteCount', { count }), t('recycleRecoverable')],
    danger: true,
    execute: async (snapshotId) => {
      const result = await sendToBackground({ type: 'folder:delete', id: node.id, snapshotId });
      await books.reload();
      feedback.success(t('folderDeleted', { count: result.deleted }));
      return result;
    },
  });
}

async function deleteBookmarks(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await safe.run({
    title: t('bookmarkDeleteTitle'),
    message: t('bookmarkDeleteMessage', { count: ids.length }),
    details: [t('recycleRecoverable')],
    danger: true,
    execute: async (snapshotId) => {
      const result = await sendToBackground({ type: 'bm:delete', ids, snapshotId });
      ui.clearSelection();
      await books.reload();
      feedback.success(t('bookmarkDeleted', { count: result.deleted }));
      return result;
    },
  });
}

function openMove(ids: string[]): void {
  if (ids.length === 0) return;
  moveIds.value = ids;
  moveTarget.value = defaultFolderId();
  dialog.value = 'move';
}

async function submitMove(): Promise<void> {
  const ids = moveIds.value;
  const parentId = moveTarget.value;
  dialog.value = null;
  if (!parentId || ids.length === 0) return;
  await safe.run({
    title: t('moveTitle'),
    message: t('moveMessage', { count: ids.length }),
    execute: async (snapshotId) => {
      const result = await sendToBackground({ type: 'bm:move', ids, parentId, snapshotId });
      ui.clearSelection();
      await books.reload();
      feedback.success(t('movedDone', { moved: result.moved, skipped: result.skipped }));
      return result;
    },
  });
}

/** 批量打开：上限 20，超出时二次确认（A4） */
async function openMany(urls: string[]): Promise<void> {
  const list = urls.filter((url) => isHttpUrl(url));
  if (list.length === 0) return;
  if (list.length > HTTP_LIMITS.maxOpenTabs) {
    const ok = await feedback.ask({
      title: t('openManyTitle'),
      message: t('openManyMessage', { count: list.length, limit: HTTP_LIMITS.maxOpenTabs }),
      confirmText: t('actionOpen'),
    });
    if (!ok) return;
  }
  for (const url of list) {
    await chrome.tabs.create({ url, active: false });
  }
}

async function copySelection(): Promise<void> {
  const urls = books.entries
    .filter((entry) => ui.selectedSet.has(entry.node.id))
    .map((entry) => entry.node.url)
    .filter((url): url is string => Boolean(url));
  if (urls.length === 0) return;
  try {
    await navigator.clipboard.writeText(urls.join('\n'));
    feedback.success(t('copiedCount', { count: urls.length }));
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

async function openNode(node: BookmarkNode): Promise<void> {
  if (!node.url) return;
  await chrome.tabs.create({ url: node.url });
}

async function saveMeta(meta: { tags: string[]; note: string }): Promise<void> {
  const id = ui.detailId;
  if (!id) return;
  try {
    await dbStore.saveMeta(id, meta);
    feedback.success(t('metaSaved'));
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

/* ------------------------------------------------------------------ */
/* 空文件夹清理（A8）/ 重复合并（F）/ 分类写回（C3）                    */
/* ------------------------------------------------------------------ */

async function scanEmptyFolders(): Promise<void> {
  if (!books.tree) return;
  const empties = findEmptyFolders(books.tree);
  if (empties.length === 0) {
    feedback.toast(t('emptyFolderNone'));
    return;
  }
  await safe.run({
    title: t('emptyFolderTitle'),
    message: t('emptyFolderMessage', { count: empties.length }),
    details: empties.slice(0, 10).map((node) => node.title || t('unnamedFolder')),
    danger: true,
    execute: async (snapshotId) => {
      const result = await sendToBackground({
        type: 'folder:cleanEmpty',
        ids: empties.map((node) => node.id),
        snapshotId,
      });
      await books.reload();
      feedback.success(t('emptyFolderCleaned', { count: result.removed }));
      return result;
    },
  });
}

async function mergeDuplicates(payload: { keepIds: string[]; removeIds: string[] }): Promise<void> {
  showDedupe.value = false;
  await safe.run({
    title: t('dedupeMergeTitle'),
    message: t('dedupeMergeMessage', { count: payload.removeIds.length }),
    details: [t('dedupeMergeHint')],
    danger: true,
    confirmText: t('actionMerge'),
    execute: async (snapshotId) => {
      const result = await sendToBackground({
        type: 'bm:delete',
        ids: payload.removeIds,
        snapshotId,
      });
      await books.reload();
      feedback.success(t('dedupeMerged', { count: result.deleted }));
      return result;
    },
  });
}

async function applyClassification(items: Array<{ bookmarkId: string; category: string }>): Promise<void> {
  if (!books.tree) return;
  const impact = computeImpact(books.tree, items);
  await safe.run({
    title: t('classifyApplyTitle'),
    message: t('classifyApplyMessage', { count: items.length }),
    details: [
      t('classifyRemovedFolders', { count: impact.removedFolders }),
      t('classifyDiscardHint'),
      t('snapshotRecoverable'),
    ],
    danger: true,
    confirmText: t('actionApply'),
    execute: async (snapshotId) => {
      const result = await sendToBackground({ type: 'classify:apply', items, snapshotId });
      await books.reload();
      feedback.success(
        t('classifyApplied', { moved: result.moved, invalid: result.invalid }),
      );
      return result;
    },
  });
}

/* ------------------------------------------------------------------ */
/* CSV 导出（B8）                                                      */
/* ------------------------------------------------------------------ */

async function exportCsv(): Promise<void> {
  if (filtered.value.length === 0) {
    feedback.error(t('csvNoData'));
    return;
  }
  const statusLabels: Record<string, string> = {
    ok: t('statusOk'),
    dead: t('statusDead'),
    suspect: t('statusSuspect'),
    untested: t('statusUntested'),
    unsupported: t('statusUnsupported'),
    yes: t('yes'),
    no: t('no'),
  };
  const rows: CsvRow[] = filtered.value.map((entry) => {
    const status: LinkStatus | undefined = linkStatus.value[entry.node.id];
    const meta = metaMap.value[entry.node.id];
    return {
      title: entry.node.title,
      url: entry.node.url ?? '',
      domain: domainOf(entry.node.url),
      status: status?.status ?? 'untested',
      httpStatus: status?.httpStatus ?? null,
      checkedAt: status?.checkedAt ?? null,
      error: status?.error ?? '',
      proxySuspect: Boolean(status?.proxySuspect),
      tags: meta?.tags.join('|') ?? '',
      note: meta?.note ?? '',
    };
  });
  const header = [
    t('colTitle'),
    t('csvUrl'),
    t('csvDomain'),
    t('colStatus'),
    t('csvHttpStatus'),
    t('csvCheckedAt'),
    t('csvError'),
    t('csvProxySuspect'),
    t('fieldTags'),
    t('fieldNote'),
  ];
  const csv = buildCsv(header, rows, statusLabels);
  downloadText(`bookvault-report-${formatLocalStamp()}.csv`, csv, 'text/csv');
}

/* ------------------------------------------------------------------ */
/* 云端备份列表                                                        */
/* ------------------------------------------------------------------ */

async function refreshCloud(): Promise<void> {
  if (!dbStore.settings?.webdav.enabled) return;
  cloudLoading.value = true;
  try {
    cloudSnapshots.value = await sendToBackground({ type: 'webdav:list' });
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  } finally {
    cloudLoading.value = false;
  }
}

/* ------------------------------------------------------------------ */
/* 设置与加密                                                          */
/* ------------------------------------------------------------------ */

async function saveSettings(patch: Parameters<typeof dbStore.saveSettings>[0]): Promise<void> {
  try {
    await dbStore.saveSettings(patch);
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

async function setupEncryption(password: string): Promise<void> {
  try {
    await sendToBackendEncrypt(password);
    await dbStore.load();
    feedback.success(t('encryptEnabledDone'));
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

async function sendToBackendEncrypt(password: string) {
  return sendToBackendRaw({ type: 'encrypt:setup', password });
}

async function sendToBackendRaw(
  request: Parameters<typeof sendToBackground>[0] extends never ? never : { type: 'encrypt:setup'; password: string },
) {
  return sendToBackground(request);
}

async function changePassword(payload: { oldPassword: string; newPassword: string }): Promise<void> {
  try {
    await sendToBackground({
      type: 'encrypt:changePassword',
      oldPassword: payload.oldPassword,
      newPassword: payload.newPassword,
    });
    feedback.success(t('passwordChanged'));
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

async function clearVault(): Promise<void> {
  const ok = await feedback.ask({
    title: t('clearVaultTitle'),
    message: t('clearVaultMessage'),
    details: [t('clearVaultDetail')],
    danger: true,
  });
  if (!ok) return;
  try {
    await sendToBackground({ type: 'encrypt:clearVault' });
    await dbStore.load();
    feedback.success(t('vaultCleared'));
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

async function saveBlocklist(list: string[]): Promise<void> {
  try {
    await dbStore.patch({ proxyBlocklist: list });
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

/* ------------------------------------------------------------------ */
/* 收藏当前窗口标签 / 撤销                                             */
/* ------------------------------------------------------------------ */

async function captureWindow(): Promise<void> {
  try {
    await sendToBackground({ type: 'ui:openCapture', mode: 'window' });
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

const undoTarget = computed(() => dbStore.opLog[0] ?? null);

async function undoLast(): Promise<void> {
  if (!undoTarget.value) return;
  busy.value = true;
  try {
    const prepared = await sendToBackground({ type: 'oplog:prepareUndo' });
    const ok = await feedback.ask({
      title: t('undoTitle'),
      message: t('undoMessage', { action: t(`opAction_${prepared.op.action}`) }),
      details: [t('undoHint')],
      danger: true,
      confirmText: t('actionUndo'),
    });
    if (!ok) {
      await sendToBackground({ type: 'snapshot:delete', id: prepared.restorePreId }).catch(
        () => undefined,
      );
      return;
    }
    const outcome = await sendToBackendUndo(prepared.op.id, prepared.restorePreId);
    reportRestore(outcome);
    await books.reload();
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  } finally {
    busy.value = false;
  }
}

async function sendToBackendUndo(opLogId: string, restorePreId: string) {
  return sendToBackground({ type: 'oplog:undo', opLogId, restorePreId });
}

function reportRestore(outcome: RestoreOutcome): void {
  if (outcome.failed) {
    feedback.error(
      outcome.rollbackFailed
        ? t('restoreFailedNoRollback', { id: outcome.restorePreId })
        : t('restoreFailedRolledBack', { id: outcome.restorePreId }),
    );
    return;
  }
  feedback.success(
    t('restoreDone', {
      restored: outcome.restored,
      bound: outcome.boundMeta,
      orphan: outcome.orphanMeta,
    }),
  );
}

/* ------------------------------------------------------------------ */
/* 视图辅助                                                            */
/* ------------------------------------------------------------------ */

const tags = computed(() => tagCounts(metaMap.value));

function viewLabel(view: ManagerView): string {
  return t(`view_${view}`);
}

function toggleAll(ids: string[]): void {
  ui.setSelection(ids);
}

function jobPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

const activeTags = computed(() => ui.tagFilter);
</script>

<template>
  <div class="bv-app">
    <header class="bv-topbar">
      <div class="bv-topbar__brand">
        <span class="bv-topbar__logo">签</span>
        <h1 class="bv-topbar__title">{{ t('managerTitle') }}</h1>
      </div>

      <nav class="bv-topbar__tabs">
        <button
          v-for="view in VIEWS"
          :key="view"
          type="button"
          class="bv-topbar__tab"
          :class="{ 'is-active': ui.activeView === view }"
          @click="ui.setView(view)"
        >
          {{ viewLabel(view) }}
        </button>
      </nav>

      <span class="bv-spacer" />

      <div v-for="job in runningJobs" :key="job.id" class="bv-topbar__job">
        <span class="bv-hint">
          {{ job.kind === 'linkCheck' ? t('jobLinkCheck') : t('jobTitleRefresh') }}
          {{ job.done }}/{{ job.total }}
        </span>
        <span class="bv-topbar__progress">
          <span
            class="bv-topbar__progress-fill"
            :style="{ width: `${jobPercent(job.done, job.total)}%` }"
          />
        </span>
        <button class="bv-btn bv-btn--sm" type="button" @click="cancelJob(job.id)">
          {{ t('actionStop') }}
        </button>
      </div>
    </header>

    <main class="bv-main">
      <div v-if="booting" class="bv-empty">{{ t('loading') }}</div>

      <!-- 书签管理 -->
      <div v-else-if="ui.activeView === 'manager'" class="bv-manager">
        <FolderTree
          class="bv-manager__tree"
          :roots="books.roots"
          :folders="books.folders"
          :selected-id="ui.selectedFolderId"
          :expanded-ids="ui.expandedFolderIds"
          :count-of="folderCounts"
          :total-count="books.entries.length"
          @select="ui.selectFolder"
          @toggle="ui.toggleFolder"
          @create="createFolder"
          @rename="renameFolder"
          @remove="deleteFolder"
        />

        <section class="bv-manager__content">
          <div class="bv-toolbar">
            <input
              v-model="searchInput"
              class="bv-input bv-toolbar__search"
              type="search"
              :placeholder="t('searchPlaceholder')"
            />

            <select
              class="bv-select bv-toolbar__select"
              :value="ui.statusFilter"
              @change="ui.setStatus(($event.target as HTMLSelectElement).value as LinkStatus | '')"
            >
              <option value="">{{ t('filterAllStatus') }}</option>
              <option value="ok">{{ t('statusOk') }}</option>
              <option value="dead">{{ t('statusDead') }}</option>
              <option value="suspect">{{ t('statusSuspect') }}</option>
              <option value="untested">{{ t('statusUntested') }}</option>
              <option value="unsupported">{{ t('statusUnsupported') }}</option>
            </select>

            <select
              class="bv-select bv-toolbar__select"
              :value="ui.sortKey"
              @change="
                ui.setSort(
                  ($event.target as HTMLSelectElement).value as UiState['sort']['key'],
                  ui.sortDir,
                )
              "
            >
              <option value="title">{{ t('sortTitle') }}</option>
              <option value="domain">{{ t('sortDomain') }}</option>
              <option value="dateAdded">{{ t('sortDateAdded') }}</option>
            </select>

            <button
              class="bv-btn bv-btn--sm"
              type="button"
              :title="ui.sortDir === 'asc' ? t('sortAsc') : t('sortDesc')"
              @click="ui.setSort(ui.sortKey, ui.sortDir === 'asc' ? 'desc' : 'asc')"
            >
              {{ ui.sortDir === 'asc' ? '↑' : '↓' }}
            </button>

            <span class="bv-spacer" />

            <button class="bv-btn bv-btn--sm" type="button" @click="openCreateBookmark">
              {{ t('actionNewBookmark') }}
            </button>
            <button class="bv-btn bv-btn--sm" type="button" @click="createFolder(defaultFolderId())">
              {{ t('actionNewFolder') }}
            </button>
            <button class="bv-btn bv-btn--sm" type="button" @click="captureWindow">
              {{ t('actionCaptureWindow') }}
            </button>
          </div>

          <div class="bv-toolbar bv-toolbar--second">
            <button class="bv-btn bv-btn--sm" type="button" @click="startJob('linkCheck')">
              {{ t('actionCheckLinks') }}
            </button>
            <button class="bv-btn bv-btn--sm" type="button" @click="startJob('titleRefresh')">
              {{ t('actionRefreshTitles') }}
            </button>
            <button class="bv-btn bv-btn--sm" type="button" @click="ui.setView('rules')">
              {{ t('actionClassify') }}
            </button>
            <button class="bv-btn bv-btn--sm" type="button" @click="showDedupe = true">
              {{ t('actionDedupe') }}
            </button>
            <button class="bv-btn bv-btn--sm" type="button" @click="scanEmptyFolders">
              {{ t('actionScanEmpty') }}
            </button>
            <button class="bv-btn bv-btn--sm" type="button" @click="exportCsv">
              {{ t('actionExportCsv') }}
            </button>

            <span class="bv-spacer" />

            <template v-if="ui.selection.length > 0">
              <span class="bv-chip bv-chip--primary">
                {{ t('selectedCount', { count: ui.selection.length }) }}
              </span>
              <button class="bv-btn bv-btn--sm" type="button" @click="openMove(ui.selection)">
                {{ t('actionMoveTo') }}
              </button>
              <button
                class="bv-btn bv-btn--sm"
                type="button"
                @click="
                  openMany(
                    books.entries
                      .filter((entry) => ui.selectedSet.has(entry.node.id))
                      .map((entry) => entry.node.url ?? ''),
                  )
                "
              >
                {{ t('actionOpenSelected') }}
              </button>
              <button class="bv-btn bv-btn--sm" type="button" @click="copySelection">
                {{ t('actionCopyUrl') }}
              </button>
              <button
                class="bv-btn bv-btn--sm bv-btn--danger"
                type="button"
                @click="deleteBookmarks(ui.selection)"
              >
                {{ t('actionDelete') }}
              </button>
              <button class="bv-btn bv-btn--sm" type="button" @click="ui.clearSelection()">
                {{ t('actionClearSelection') }}
              </button>
            </template>
          </div>

          <div v-if="activeTags.length > 0" class="bv-toolbar bv-toolbar--tags">
            <span class="bv-hint">{{ t('filterTags') }}：</span>
            <button
              v-for="tag in activeTags"
              :key="tag"
              class="bv-chip bv-chip--primary"
              type="button"
              @click="ui.setTagFilter(activeTags.filter((item) => item !== tag))"
            >
              #{{ tag }} ✕
            </button>
          </div>

          <div v-if="undoTarget" class="bv-undo-bar">
            <span class="bv-hint">
              {{ t('undoLatest', { action: t(`opAction_${undoTarget.action}`), time: '' }) }}
            </span>
            <button class="bv-btn bv-btn--sm" type="button" :disabled="busy" @click="undoLast">
              {{ t('actionUndo') }}
            </button>
          </div>

          <BookmarkList
            class="bv-manager__list"
            :items="filtered"
            :selected="selectedIds"
            :status-map="linkStatus"
            :meta-map="metaMap"
            :folder-paths="books.folderPaths"
            :loading="books.loading"
            @toggle="ui.toggleSelection"
            @toggle-all="toggleAll"
            @open="openNode"
            @detail="ui.openDetail"
            @edit="openEditBookmark"
            @move="openMove"
            @delete="deleteBookmarks"
          />
        </section>

        <DetailPanel
          v-if="ui.detailId"
          :entry="currentEntry"
          :meta="currentMeta"
          :folder-path="books.folderPaths[currentEntry?.node.parentId ?? ''] ?? ''"
          @save="saveMeta"
          @close="ui.openDetail(null)"
          @open="openMany([$event])"
        />
      </div>

      <!-- 统计概览 -->
      <StatsPanel
        v-else-if="ui.activeView === 'stats'"
        :stats="stats"
        :loading="books.loading"
        @refresh="books.reload()"
      />

      <!-- 分类规则 -->
      <RuleEditor
        v-else-if="ui.activeView === 'rules'"
        :rules="dbStore.rules"
        :entries="books.entries"
        :tree="books.tree"
        @apply="applyClassification"
      />

      <!-- 标签管理 -->
      <TagPanel
        v-else-if="ui.activeView === 'tags'"
        :tags="tags"
        :orphan-meta="dbStore.orphanMeta"
        :active-tags="activeTags"
      />

      <!-- 备份与恢复 -->
      <BackupHistory
        v-else-if="ui.activeView === 'backup' && dbStore.db"
        :db="dbStore.db"
        :webdav-enabled="Boolean(dbStore.settings?.webdav.enabled)"
        :encryption-enabled="Boolean(dbStore.settings?.encryption.enabled)"
        :cloud-snapshots="cloudSnapshots"
        :cloud-loading="cloudLoading"
        @refresh-cloud="refreshCloud"
        @goto-settings="ui.setView('settings')"
      />

      <!-- 通用设置 -->
      <SettingsPanel
        v-else-if="ui.activeView === 'settings' && dbStore.settings"
        :settings="dbStore.settings"
        :blocklist="dbStore.proxyBlocklist"
        :has-vault="Boolean(dbStore.vault)"
        :remember-on-device="Boolean(dbStore.settings.encryption.rememberOnDevice)"
        @save="saveSettings"
        @setup-encryption="setupEncryption"
        @change-password="changePassword"
        @clear-vault="clearVault"
        @save-blocklist="saveBlocklist"
      />
    </main>

    <!-- 新建/编辑书签 -->
    <BookmarkDialog
      v-if="dialog === 'createBookmark' || dialog === 'editBookmark'"
      :mode="dialog === 'editBookmark' ? 'edit' : 'create'"
      :node="dialogNode"
      :roots="books.roots"
      :folders="books.folders"
      :default-folder-id="dialogFolderId || defaultFolderId()"
      @close="dialog = null"
      @submit="submitBookmark"
    />

    <!-- 文本输入（文件夹命名） -->
    <div v-if="dialog === 'prompt' && promptState" class="bv-mask" @click.self="cancelPrompt">
      <section class="bv-dialog" role="dialog" aria-modal="true">
        <h2 class="bv-section-title">{{ promptState.title }}</h2>
        <input
          v-model="promptState.value"
          class="bv-input"
          type="text"
          @keydown.enter.prevent="submitPrompt"
          @keydown.esc="cancelPrompt"
        />
        <div class="bv-row">
          <span class="bv-spacer" />
          <button class="bv-btn" type="button" @click="cancelPrompt">
            {{ t('actionCancel') }}
          </button>
          <button class="bv-btn bv-btn--primary" type="button" @click="submitPrompt">
            {{ t('actionConfirm') }}
          </button>
        </div>
      </section>
    </div>

    <!-- 移动目标文件夹 -->
    <div v-if="dialog === 'move'" class="bv-mask" @click.self="dialog = null">
      <section class="bv-dialog" role="dialog" aria-modal="true">
        <h2 class="bv-section-title">{{ t('moveTitle') }}</h2>
        <p class="bv-hint">{{ t('moveMessage', { count: moveIds.length }) }}</p>
        <FolderPicker v-model="moveTarget" :roots="books.roots" :folders="books.folders" />
        <div class="bv-row">
          <span class="bv-spacer" />
          <button class="bv-btn" type="button" @click="dialog = null">{{ t('actionCancel') }}</button>
          <button class="bv-btn bv-btn--primary" type="button" @click="submitMove">
            {{ t('actionConfirm') }}
          </button>
        </div>
      </section>
    </div>

    <!-- 重复书签 -->
    <DuplicatePanel
      v-if="showDedupe"
      :entries="books.entries"
      :folder-paths="books.folderPaths"
      :threshold="dbStore.settings?.titleSimilarityThreshold ?? 0.85"
      @close="showDedupe = false"
      @merge="mergeDuplicates"
    />

    <AppConfirm />
    <AppToast />
  </div>
</template>

<style scoped>
.bv-app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bv-bg);
  color: var(--bv-text);
  font: var(--bv-font-body);
}

.bv-topbar {
  display: flex;
  gap: var(--bv-space-3);
  align-items: center;
  height: 48px;
  padding: 0 var(--bv-space-4);
  background: var(--bv-surface);
  border-bottom: 1px solid var(--bv-border);
}

.bv-topbar__brand {
  display: flex;
  gap: var(--bv-space-2);
  align-items: center;
}

.bv-topbar__logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: #f7f8f7;
  font-size: var(--bv-font-size-sm);
  background: var(--bv-primary);
  border-radius: var(--bv-radius-sm);
}

.bv-topbar__title {
  font-size: var(--bv-font-size-lg);
  font-weight: 600;
  letter-spacing: 0.04em;
}

.bv-topbar__tabs {
  display: flex;
  gap: 2px;
  margin-left: var(--bv-space-4);
}

.bv-topbar__tab {
  padding: 5px var(--bv-space-3);
  color: var(--bv-text-secondary);
  font-size: var(--bv-font-size-sm);
  border-radius: var(--bv-radius-sm);
}

.bv-topbar__tab:hover {
  color: var(--bv-text);
  background: var(--bv-surface-hover);
}

.bv-topbar__tab.is-active {
  color: var(--bv-primary);
  background: var(--bv-primary-soft);
}

.bv-topbar__job {
  display: flex;
  gap: var(--bv-space-2);
  align-items: center;
}

.bv-topbar__progress {
  width: 120px;
  height: 6px;
  overflow: hidden;
  background: var(--bv-surface-sunken);
  border-radius: var(--bv-radius-sm);
}

.bv-topbar__progress-fill {
  display: block;
  height: 100%;
  background: var(--bv-accent);
}

.bv-main {
  flex: 1;
  min-height: 0;
}

.bv-manager {
  display: flex;
  height: 100%;
  min-height: 0;
}

.bv-manager__tree {
  width: 260px;
  flex-shrink: 0;
}

.bv-manager__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.bv-manager__list {
  flex: 1;
  min-height: 0;
}

.bv-toolbar {
  display: flex;
  gap: var(--bv-space-2);
  align-items: center;
  padding: var(--bv-space-2) var(--bv-space-3);
  background: var(--bv-surface);
  border-bottom: 1px solid var(--bv-border);
}

.bv-toolbar--second {
  flex-wrap: wrap;
  background: var(--bv-bg);
}

.bv-toolbar--tags {
  flex-wrap: wrap;
  padding: var(--bv-space-1) var(--bv-space-3);
}

.bv-toolbar__search {
  width: 240px;
}

.bv-toolbar__select {
  width: 140px;
}

.bv-undo-bar {
  display: flex;
  gap: var(--bv-space-2);
  align-items: center;
  padding: 4px var(--bv-space-3);
  background: var(--bv-primary-soft);
  border-bottom: 1px solid var(--bv-border);
}

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
</style>
