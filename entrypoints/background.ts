/**
 * Service Worker 入口。
 *
 * 文档出处：2.3（长任务模型）、2.1（入口）、4.1（不可逆操作）、4.6（写操作串行化）、
 * 4.7（存储迁移）、5.A9（外部变更监听）、5.E4（每日备份）、8.1、9 节第 1 条。
 *
 * 铁律：顶层只做「事件注册」，禁止持有可变状态。任何进度/结果都落 storage，
 * SW 被回收后由 alarms / onStartup / 任意消息唤醒继续。
 */

import { defineBackground } from 'wxt/utils/define-background';

import {
  buildIndex,
  createBookmark,
  createFolder,
  getNode,
  getTree,
  isFolder,
  moveNode,
  updateNode,
  validateUrl,
} from '@/modules/bookmarks';
import {
  appendOpLog,
  cleanEmptyFoldersByIds,
  clearRecycleBin,
  createSnapshot,
  deleteSnapshot,
  deleteToRecycle,
  latestUndoable,
  prepareRestore,
  prepareUndo,
  readSnapshotContent,
  restoreFromContent,
  restoreRecycleItem,
  restoreSnapshot,
  undoLastOp,
} from '@/modules/backup';
import { applyClassification } from '@/modules/classifier';
import {
  assertBackupStructure,
  buildEncryptedBackupFile,
  buildPlainBackupFile,
  changePassword,
  clearVault,
  countBackupBookmarks,
  decryptPayload,
  encryptPayload,
  getVault,
  setupVault,
  type PlainBackupPayload,
} from '@/modules/encrypt';
import {
  buildExportPayload,
  exportHtml,
  exportFileName,
  importBookmarks,
  parseHtml,
  parseJson,
  previewImport,
  type ParsedImport,
} from '@/modules/io';
import {
  cancelJob,
  getProgress,
  getResults,
  runSlices,
  startJob,
} from '@/modules/jobs';
import {
  applyPatch,
  ensureDb,
  needsMigration,
  patchDb,
  patchSettings,
  readDb,
  readSuppressRemoval,
  replaceSection,
  runMigrations,
} from '@/modules/storage';
import { captureItems } from '@/modules/tabs-capture';
import {
  deleteFile,
  getFile,
  listRemote,
  putFile,
  rotateRemote,
  testConnection,
  uniqueBackupFileName,
} from '@/modules/webdav';
import {
  ALARMS,
  CAPTURE_WINDOW,
  CONTEXT_MENU_IDS,
  HTTP_LIMITS,
  PAGES,
  WEBDAV_PENDING_DELETE_LIMIT,
} from '@/shared/constants';
import { withWriteLock } from '@/shared/lock';
import type { BvRequest, BvResponse } from '@/shared/messages';
import type {
  BackupFile,
  BookmarkNode,
  OpAction,
  RuntimeState,
  SnapshotContent,
  SnapshotMeta,
} from '@/shared/types';
import { formatIsoWithOffset, formatLocalDate, formatLocalStamp, sleep } from '@/shared/util';

/* ------------------------------------------------------------------ */
/* 通用小工具                                                          */
/* ------------------------------------------------------------------ */

/** 把异常统一成 i18n key 或原始信息（页面负责本地化） */
function toErrorKey(err: unknown): string {
  if (err instanceof Error) return err.message || 'errUnknown';
  return 'errUnknown';
}

/** 校验快照存在（4.1：不可逆操作必须有本次快照） */
async function requireSnapshot(snapshotId: string | undefined): Promise<string> {
  if (!snapshotId) throw new Error('errSnapshotRequired');
  const db = await readDb();
  if (!db.localSnapshots.some((meta) => meta.id === snapshotId)) {
    throw new Error('errSnapshotMissing');
  }
  return snapshotId;
}

/** 追加 opLog（单步撤销依据） */
async function logOp(
  action: OpAction,
  affectedIds: string[],
  beforeSnapshotId: string,
): Promise<void> {
  await withWriteLock(async () => {
    const db = await readDb();
    appendOpLog(db, { action, affectedIds, beforeSnapshotId });
    await applyPatch({ opLog: db.opLog });
  });
}

/** 页面顶层视图/管理页地址 */
function managerUrl(): string {
  return chrome.runtime.getURL(PAGES.manager);
}

/** 打开（或聚焦）管理页（第 7 节） */
async function openManager(): Promise<void> {
  const url = managerUrl();
  const tabs = await chrome.tabs.query({ url: `${url}*` });
  const existing = tabs[0];
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true });
    if (existing.windowId !== undefined) {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
    return;
  }
  await chrome.tabs.create({ url });
}

/** 打开收藏小窗（2.1：contextMenus 无法在 SW 弹 UI） */
async function openCapture(params: { mode: 'page' | 'window'; url?: string; title?: string }): Promise<void> {
  const query = new URLSearchParams({ mode: params.mode });
  if (params.url) query.set('url', params.url);
  if (params.title) query.set('title', params.title);
  await chrome.windows.create({
    url: chrome.runtime.getURL(`${PAGES.capture}?${query.toString()}`),
    type: 'popup',
    width: CAPTURE_WINDOW.width,
    height: CAPTURE_WINDOW.height,
  });
}

/* ------------------------------------------------------------------ */
/* 每日自动备份（E4）                                                  */
/* ------------------------------------------------------------------ */

/** 是否落在 [autoBackupHour, autoBackupHour+3) 窗口内（考虑跨零点） */
function inBackupWindow(hour: number, start: number): boolean {
  for (let offset = 0; offset < 3; offset += 1) {
    if ((start + offset) % 24 === hour) return true;
  }
  return false;
}

/** 计算下一次触发时间戳（本地时区整点；已过则顺延一天） */
function nextBackupTimestamp(hour: number): number {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, 0, 0, 0);
  if (next.getTime() <= now.getTime() + 60_000) next.setDate(next.getDate() + 1);
  return next.getTime();
}

/** 重建每日备份闹钟（E4：触发后重新创建下一次） */
async function scheduleDailyBackup(): Promise<void> {
  const db = await readDb();
  if (!db.settings.autoBackupDaily) {
    await chrome.alarms.clear(ALARMS.dailyBackup);
    return;
  }
  await chrome.alarms.create(ALARMS.dailyBackup, {
    when: nextBackupTimestamp(db.settings.autoBackupHour),
  });
}

/** 更新 runtime 段（整段替换，便于删键） */
async function updateRuntime(patch: Partial<RuntimeState>): Promise<void> {
  const db = await readDb();
  const next: RuntimeState = { ...db.runtime, ...patch };
  for (const key of Object.keys(next) as Array<keyof RuntimeState>) {
    if (next[key] === undefined) delete next[key];
  }
  await replaceSection('runtime', next);
}

/**
 * 每日自动备份：窗口内 + 同日去重（D-11）。
 * 窗口外被唤醒（错过闹钟补触发）一律跳过，不补备。
 */
async function runDailyBackup(): Promise<void> {
  try {
    const db = await readDb();
    if (db.flags.importInProgress) {
      console.info('[backup] 原生导入进行中，跳过当日自动备份');
      return;
    }
    if (!db.settings.autoBackupDaily) return;

    const today = formatLocalDate();
    if (db.runtime.lastDailyBackupDate === today) return;

    const hour = new Date().getHours();
    if (!inBackupWindow(hour, db.settings.autoBackupHour)) {
      console.info(`[backup] 当前 ${hour} 点不在自动备份窗口内，跳过（不补备）`);
      return;
    }

    await createSnapshot('autoDaily', `auto ${today}`);
    await updateRuntime({ lastDailyBackupDate: today });

    if (!db.settings.webdav.enabled) return;

    if (db.settings.encryption.enabled && !db.secretVault) {
      // vault 缺失：本次跳过云端上传，提示用户补输入密码（E4）
      await updateRuntime({ pendingCloudBackup: true, pendingVaultPrompt: true });
      return;
    }

    try {
      await uploadBackup();
      await updateRuntime({ pendingCloudBackup: false, pendingVaultPrompt: false, lastBackupError: undefined });
    } catch (err) {
      console.error('[backup] 自动云端备份失败', err);
      await updateRuntime({ lastBackupError: toErrorKey(err) });
    }
  } catch (err) {
    console.error('[backup] 每日备份异常', err);
  } finally {
    await scheduleDailyBackup();
  }
}

/* ------------------------------------------------------------------ */
/* 云端上传（E2）                                                      */
/* ------------------------------------------------------------------ */

/**
 * 上传备份并轮转。
 * 加密开启时优先用本机 vault；vault 缺失需要页面传入密码（E2 / K4）。
 */
async function uploadBackup(password?: string): Promise<{ fileName: string; deleted: number }> {
  const db = await readDb();
  const config = db.settings.webdav;
  if (!config.enabled) throw new Error('errWebdavDisabled');
  if (!config.server.trim() || !config.username.trim() || !config.password) {
    throw new Error('errWebdavConfig');
  }

  const payload = (await buildExportPayload()) as PlainBackupPayload;
  const exportedAt = Date.now();
  const count = countBackupBookmarks(payload.bookmarks);
  let file;
  if (db.settings.encryption.enabled) {
    const encrypted = await encryptPayload(payload, password);
    file = buildEncryptedBackupFile(encrypted, count, exportedAt, formatIsoWithOffset(exportedAt));
  } else {
    file = buildPlainBackupFile(payload, exportedAt, formatIsoWithOffset(exportedAt));
  }

  const entries = await listRemote(config);
  const fileName = uniqueBackupFileName(
    formatLocalStamp(exportedAt),
    entries.map((entry) => entry.fileName),
  );
  await putFile(config, fileName, JSON.stringify(file));

  // 上次轮转失败的补删（E2：最多补删 10 个/次）
  const pending = (db.runtime.pendingCloudDeletes ?? []).slice(0, WEBDAV_PENDING_DELETE_LIMIT);
  const stillFailed: string[] = [];
  for (const name of pending) {
    try {
      await deleteFile(config, name);
    } catch {
      stillFailed.push(name);
    }
  }

  // 上传后重新列目录再轮转（E2：以文件名时间戳为权威）
  const after = await listRemote(config).catch(() => entries);
  const rotation = await rotateRemote(config, after, db.settings.cloudSnapshotKeep);
  const failedNames = [...stillFailed, ...rotation.failed];

  await updateRuntime({
    lastCloudBackupAt: Date.now(),
    lastBackupError: undefined,
    pendingCloudBackup: false,
    ...(failedNames.length > 0 ? { pendingCloudDeletes: failedNames } : { pendingCloudDeletes: undefined }),
  });
  return { fileName, deleted: rotation.deleted.length };
}

/** 手动备份（E2）：先本地快照，再按需上传 */
async function manualBackup(
  cloud: boolean,
  password?: string,
): Promise<{ snapshot: SnapshotMeta; uploaded: boolean; fileName?: string; error?: string }> {
  const snapshot = await createSnapshot('manual');
  if (!cloud) return { snapshot, uploaded: false };

  const db = await readDb();
  if (!db.settings.webdav.enabled) {
    return { snapshot, uploaded: false, error: 'errWebdavDisabled' };
  }
  try {
    const result = await uploadBackup(password);
    return { snapshot, uploaded: true, fileName: result.fileName };
  } catch (err) {
    const error = toErrorKey(err);
    await updateRuntime({ lastBackupError: error });
    return { snapshot, uploaded: false, error };
  }
}

/* ------------------------------------------------------------------ */
/* 云端恢复（E3）                                                      */
/* ------------------------------------------------------------------ */

/** 下载并解析云端备份（加密时按 vault 或密码解密） */
async function loadCloudBackup(
  fileName: string,
  password?: string,
): Promise<{ file: unknown; payload: PlainBackupPayload }> {
  const db = await readDb();
  const config = db.settings.webdav;
  if (!config.enabled) throw new Error('errWebdavDisabled');
  const text = await getFile(config, fileName);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('errBackupStructure');
  }
  assertBackupStructure(parsed);
  const payload = await decryptPayload(parsed, password);
  return { file: parsed, payload };
}

/* ------------------------------------------------------------------ */
/* 消息路由                                                            */
/* ------------------------------------------------------------------ */

/** 判断节点是否受管（排除根节点与「移动设备书签」子树） */
async function assertWritableNode(id: string): Promise<BookmarkNode> {
  const node = await getNode(id);
  if (!node) throw new Error('errNodeMissing');
  const tree = await getTree();
  const index = buildIndex(tree);
  if (index.mobileIds.has(id)) throw new Error('errMobileRoot');
  if (index.roots.some((root) => root.id === id)) throw new Error('errRootProtected');
  return node;
}

/** 处理一条请求；抛错由外层包成失败响应 */
async function handleRequest(req: BvRequest): Promise<unknown> {
  switch (req.type) {
    /* ---------------- LocalDB ---------------- */
    case 'db:get':
      return readDb();
    case 'db:patch':
      return patchDb(req.patch);
    case 'settings:patch':
      return patchSettings(req.patch);

    /* ---------------- 快照 ---------------- */
    case 'snapshot:create':
      return createSnapshot(req.source, req.note);
    case 'snapshot:delete':
      await deleteSnapshot(req.id);
      return null;
    case 'snapshot:read':
      return readSnapshotContent(req.id);
    case 'snapshot:prepareRestore':
      return prepareRestore(req.id);
    case 'snapshot:restore': {
      await requireSnapshot(req.restorePreId);
      const outcome = await restoreSnapshot(req.id, req.restorePreId);
      if (!outcome.failed) await logOp('restore', [], outcome.restorePreId);
      return outcome;
    }

    /* ---------------- 回收站 / 撤销 ---------------- */
    case 'recycle:restore':
      return restoreRecycleItem(req.id);
    case 'recycle:clear': {
      const snapshotId = await requireSnapshot(req.snapshotId);
      const result = await clearRecycleBin();
      await logOp('delete', [], snapshotId);
      return result;
    }
    case 'oplog:prepareUndo':
      return prepareUndo();
    case 'oplog:undo': {
      await requireSnapshot(req.restorePreId);
      const latest = await latestUndoable();
      if (!latest || latest.id !== req.opLogId) throw new Error('errNothingToUndo');
      return undoLastOp(req.restorePreId);
    }

    /* ---------------- 书签 / 文件夹 ---------------- */
    case 'bm:create': {
      const urlError = validateUrl(req.url);
      if (urlError) throw new Error(urlError);
      if (!req.title.trim()) throw new Error('errTitleEmpty');
      const parent = await getNode(req.parentId);
      if (!parent || !isFolder(parent)) throw new Error('errFolderMissing');
      const node = await createBookmark({
        parentId: req.parentId,
        title: req.title.trim(),
        url: req.url.trim(),
      });
      await patchDb({ flags: { statsDirty: true } });
      return node;
    }
    case 'bm:update': {
      const node = await assertWritableNode(req.id);
      const changes: { title?: string; url?: string } = {};
      if (req.title !== undefined) changes.title = req.title;
      if (req.url !== undefined) {
        const urlError = validateUrl(req.url);
        if (urlError) throw new Error(urlError);
        if (node.url === undefined) throw new Error('errFolderNoUrl');
        changes.url = req.url.trim();
      }
      if (Object.keys(changes).length === 0) return null;
      await updateNode(req.id, changes);
      await patchDb({ flags: { statsDirty: true } });
      return null;
    }
    case 'bm:move': {
      const snapshotId = await requireSnapshot(req.snapshotId);
      const parent = await getNode(req.parentId);
      if (!parent || !isFolder(parent)) throw new Error('errFolderMissing');
      let moved = 0;
      let skipped = 0;
      for (const id of req.ids) {
        try {
          await assertWritableNode(id);
          await moveNode(id, req.parentId);
          moved += 1;
          await sleep(10);
        } catch (err) {
          console.warn('[bm:move] 跳过', id, err);
          skipped += 1;
        }
      }
      await logOp('move', req.ids, snapshotId);
      await patchDb({ flags: { statsDirty: true } });
      return { moved, skipped };
    }
    case 'bm:delete': {
      const snapshotId = await requireSnapshot(req.snapshotId);
      const result = await deleteToRecycle(req.ids);
      await logOp('delete', req.ids, snapshotId);
      return result;
    }
    case 'bm:rewrite': {
      const snapshotId = await requireSnapshot(req.snapshotId);
      const skipped: Array<{ id: string; title: string; reason: string }> = [];
      let updated = 0;
      for (const item of req.items) {
        const node = await getNode(item.id);
        if (!node || node.url === undefined) {
          skipped.push({ id: item.id, title: node?.title ?? '', reason: 'errNodeMissing' });
          continue;
        }
        const changes: { title?: string; url?: string } = {};
        if (item.title !== undefined && item.title !== node.title) changes.title = item.title;
        if (item.url !== undefined && item.url !== node.url) {
          const urlError = validateUrl(item.url);
          if (urlError) {
            skipped.push({ id: item.id, title: node.title, reason: urlError });
            continue;
          }
          changes.url = item.url.trim();
        }
        if (Object.keys(changes).length === 0) continue;
        try {
          await updateNode(item.id, changes);
          updated += 1;
          await sleep(10);
        } catch (err) {
          skipped.push({
            id: item.id,
            title: node.title,
            reason: toErrorKey(err),
          });
        }
      }
      await logOp('rewrite', req.items.map((item) => item.id), snapshotId);
      await patchDb({ flags: { statsDirty: true } });
      return { updated, skipped };
    }
    case 'folder:create': {
      if (!req.title.trim()) throw new Error('errTitleEmpty');
      const parent = await getNode(req.parentId);
      if (!parent || !isFolder(parent)) throw new Error('errFolderMissing');
      const node = await createFolder({ parentId: req.parentId, title: req.title.trim() });
      await patchDb({ flags: { statsDirty: true } });
      return node;
    }
    case 'folder:rename': {
      if (!req.title.trim()) throw new Error('errTitleEmpty');
      const node = await assertWritableNode(req.id);
      if (node.url !== undefined) throw new Error('errNotFolder');
      await updateNode(req.id, { title: req.title.trim() });
      await patchDb({ flags: { statsDirty: true } });
      return null;
    }
    case 'folder:delete': {
      const snapshotId = await requireSnapshot(req.snapshotId);
      const node = await assertWritableNode(req.id);
      if (node.url !== undefined) throw new Error('errNotFolder');
      const result = await deleteToRecycle([req.id]);
      await logOp('delete', [req.id], snapshotId);
      return result;
    }
    case 'folder:cleanEmpty': {
      const snapshotId = await requireSnapshot(req.snapshotId);
      const removed = await cleanEmptyFoldersByIds(req.ids);
      await logOp('delete', req.ids, snapshotId);
      return { removed };
    }

    /* ---------------- 后台任务 ---------------- */
    case 'job:start':
      return startJob(req.kind, req.ids);
    case 'job:cancel':
      return cancelJob(req.jobId);
    case 'job:progress':
      return getProgress(req.jobId);
    case 'job:results':
      return getResults(req.jobId);
    case 'title:apply': {
      const snapshotId = await requireSnapshot(req.snapshotId);
      const results = await getResults(req.jobId);
      let updated = 0;
      let failed = 0;
      const affected: string[] = [];
      for (const [id, title] of Object.entries(results)) {
        const node = await getNode(id);
        if (!node || node.url === undefined) {
          failed += 1;
          continue;
        }
        const nextTitle = title.trim();
        if (!nextTitle || nextTitle === node.title) continue;
        try {
          await updateNode(id, { title: nextTitle });
          updated += 1;
          affected.push(id);
          await sleep(10);
        } catch (err) {
          console.warn('[title:apply] 回填失败', id, err);
          failed += 1;
        }
      }
      await logOp('refreshTitle', affected, snapshotId);
      await patchDb({ flags: { statsDirty: true } });
      return { updated, failed };
    }
    case 'classify:apply': {
      const snapshotId = await requireSnapshot(req.snapshotId);
      const result = await applyClassification(req.items);
      await logOp('classify', req.items.map((item) => item.bookmarkId), snapshotId);
      return result;
    }

    /* ---------------- WebDAV ---------------- */
    case 'webdav:test':
      return testConnection(req.config);
    case 'webdav:list':
      return listRemote((await readDb()).settings.webdav);
    case 'webdav:upload': {
      const result = await uploadBackup(req.password);
      return result;
    }
    case 'webdav:delete':
      await deleteFile((await readDb()).settings.webdav, req.fileName);
      return null;
    case 'webdav:prepareRestore': {
      const { file, payload } = await loadCloudBackup(req.fileName, req.password);
      assertBackupStructure(file);
      const backup = file as BackupFile;
      const pre = await prepareRestoreForContent(payload);
      return {
        fileName: req.fileName,
        exportedAt: backup.exportedAt,
        count: countBackupBookmarks(payload.bookmarks),
        encrypted: backup.encrypted,
        restorePreId: pre,
      };
    }
    case 'webdav:restore': {
      await requireSnapshot(req.restorePreId);
      const { payload } = await loadCloudBackup(req.fileName, req.password);
      const outcome = await restoreFromContent(
        { ...payload, orphanMeta: {} } as SnapshotContent,
        req.restorePreId,
      );
      if (!outcome.failed) await logOp('restore', [], outcome.restorePreId);
      return outcome;
    }
    case 'backup:now':
      return manualBackup(req.cloud, req.password);

    /* ---------------- 导入导出 ---------------- */
    case 'io:parse': {
      if (req.kind === 'html') {
        const parsed = parseHtml(req.text);
        const preview = await previewImport(parsed);
        return { ...preview, kind: 'html' as const };
      }
      const file = parseJsonFile(req.text);
      assertBackupStructure(file);
      const payload = await decryptPayload(file, req.password);
      const parsed = parseJson(payload);
      const preview = await previewImport(parsed);
      return {
        ...preview,
        kind: 'json' as const,
        rules: parsed.rules.length,
        metaCount: Object.keys(parsed.metaByOldId).length,
        encrypted: Boolean(file.encrypted),
      };
    }
    case 'io:import': {
      const snapshotId = await requireSnapshot(req.snapshotId);
      const parsed = await parseImportPayload(req.kind, req.text, req.options.password);
      const result = await importBookmarks(parsed, req.options, req.kind);
      await logOp('import', [], snapshotId);
      return result;
    }
    case 'io:exportHtml': {
      const payload = await buildExportPayload();
      return { fileName: exportFileName('html'), content: exportHtml(payload.bookmarks) };
    }
    case 'io:exportJson': {
      const payload = (await buildExportPayload()) as PlainBackupPayload;
      const exportedAt = Date.now();
      const count = countBackupBookmarks(payload.bookmarks);
      const db = await readDb();
      const file = db.settings.encryption.enabled
        ? buildEncryptedBackupFile(
            await encryptPayload(payload, req.password),
            count,
            exportedAt,
            formatIsoWithOffset(exportedAt),
          )
        : buildPlainBackupFile(payload, exportedAt, formatIsoWithOffset(exportedAt));
      return { fileName: exportFileName('json'), content: JSON.stringify(file) };
    }

    /* ---------------- 加密 ---------------- */
    case 'encrypt:setup': {
      if (!req.password) throw new Error('errPasswordEmpty');
      await setupVault(req.password);
      await patchSettings({ encryption: { enabled: true } });
      return null;
    }
    case 'encrypt:changePassword': {
      await changePassword(req.oldPassword, req.newPassword);
      return null;
    }
    case 'encrypt:clearVault': {
      await clearVault();
      return null;
    }

    /* ---------------- 标签收藏 ---------------- */
    case 'capture:apply': {
      const snapshotId = await requireSnapshot(req.snapshotId);
      const result = await captureItems(req.items, req.parentId, req.note);
      await logOp('capture', [], snapshotId);
      return result;
    }

    /* ---------------- UI ---------------- */
    case 'ui:openManager':
      await openManager();
      return null;
    case 'ui:openCapture':
      await openCapture({ mode: req.mode, url: req.url, title: req.title });
      return null;

    default: {
      const exhaustive: never = req;
      throw new Error(`errUnknownRequest:${JSON.stringify(exhaustive)}`);
    }
  }
}

/** JSON 解析（结构校验交给 assertBackupStructure） */
function parseJsonFile(text: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('errBackupStructure');
  }
  return parsed as BackupFile;
}

/** 解析待导入内容（含加密 JSON 解密） */
async function parseImportPayload(
  kind: 'json' | 'html',
  text: string,
  password?: string,
): Promise<ParsedImport> {
  if (kind === 'html') return parseHtml(text);
  const file = parseJsonFile(text);
  assertBackupStructure(file);
  const payload = await decryptPayload(file, password);
  return parseJson(payload);
}

/** 云端恢复前生成 restorePre（内容来自云端，故直接建快照） */
async function prepareRestoreForContent(_payload: PlainBackupPayload): Promise<string> {
  void _payload;
  const meta = await createSnapshot('restorePre');
  return meta.id;
}

/* ------------------------------------------------------------------ */
/* 浏览器事件                                                          */
/* ------------------------------------------------------------------ */

/** 注册右键菜单（重复注册会报错，先清空） */
async function registerContextMenu(): Promise<void> {
  try {
    await chrome.contextMenus.removeAll();
    // icons 在部分 @types/chrome 版本里未声明，但运行时 Chrome 支持（2.2 要求带图标）
    const props = {
      id: CONTEXT_MENU_IDS.addBookmark,
      title: chrome.i18n.getMessage('menuAddBookmark') || 'BookVault',
      contexts: ['page'],
      icons: { 16: 'icons/icon16.png', 32: 'icons/icon32.png' },
    } as unknown as chrome.contextMenus.CreateProperties;
    chrome.contextMenus.create(props);
  } catch (err) {
    console.warn('[bg] 注册右键菜单失败', err);
  }
}

/** 启动时恢复可恢复状态（4.7 迁移 + 2.3 续跑 + E4 闹钟） */
async function bootstrap(): Promise<void> {
  try {
    await ensureDb();

    if (await needsMigration()) {
      // 4.7：迁移前必须先生成快照并保留
      await createSnapshot('preOperation', 'schema migration');
      try {
        await runMigrations();
      } catch (err) {
        console.error('[bg] 迁移失败，保持旧版本', err);
      }
    }

    await registerContextMenu();
    await scheduleDailyBackup();
    await runSlices();
    await runDailyBackup();
  } catch (err) {
    console.error('[bg] 启动初始化失败', err);
  }
}

export default defineBackground(() => {
  /* ---- 安装/更新 ---- */
  chrome.runtime.onInstalled.addListener(() => {
    void (async () => {
      await bootstrap();
    })();
  });

  /* ---- 浏览器启动：续跑任务 + 补建闹钟 ---- */
  chrome.runtime.onStartup.addListener(() => {
    void (async () => {
      await bootstrap();
    })();
  });

  /* ---- 闹钟 ---- */
  chrome.alarms.onAlarm.addListener((alarm) => {
    void (async () => {
      try {
        if (alarm.name === ALARMS.jobTick) {
          await runSlices();
          return;
        }
        if (alarm.name === ALARMS.dailyBackup) {
          await runDailyBackup();
        }
      } catch (err) {
        console.error('[bg] 闹钟处理失败', alarm.name, err);
      }
    })();
  });

  /* ---- 书签外部变更（A9）---- */
  chrome.bookmarks.onCreated.addListener(() => {
    void patchDb({ flags: { statsDirty: true } }).catch(() => undefined);
  });

  chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
    void (async () => {
      try {
        const suppressed = await readSuppressRemoval(HTTP_LIMITS.suppressTtlMs);
        if (suppressed.includes(id)) return;

        // 原生删除：级联清除该子树在 meta / linkStatus 中的记录，不进回收站（D-15）
        const db = await readDb();
        const bookmarkMeta = { ...db.bookmarkMeta };
        const linkStatus = { ...db.linkStatus };
        const node = removeInfo?.node;
        const collect = (current: chrome.bookmarks.BookmarkTreeNode | undefined): void => {
          if (!current) return;
          delete bookmarkMeta[current.id];
          delete linkStatus[current.id];
          for (const child of current.children ?? []) collect(child);
        };
        collect(node);
        delete bookmarkMeta[id];
        delete linkStatus[id];
        await withWriteLock(() =>
          applyPatch({ bookmarkMeta, linkStatus, flags: { statsDirty: true } }),
        );
      } catch (err) {
        console.warn('[bg] onRemoved 处理失败', err);
      }
    })();
  });

  chrome.bookmarks.onChanged.addListener((id) => {
    void (async () => {
      try {
        const db = await readDb();
        const linkStatus = { ...db.linkStatus };
        delete linkStatus[id];
        await withWriteLock(() => applyPatch({ linkStatus, flags: { statsDirty: true } }));
      } catch (err) {
        console.warn('[bg] onChanged 处理失败', err);
      }
    })();
  });

  chrome.bookmarks.onMoved.addListener(() => {
    void patchDb({ flags: { statsDirty: true } }).catch(() => undefined);
  });

  chrome.bookmarks.onImportBegan.addListener(() => {
    void patchDb({ flags: { importInProgress: true } }).catch(() => undefined);
  });

  chrome.bookmarks.onImportEnded.addListener(() => {
    void (async () => {
      try {
        await patchDb({ flags: { importInProgress: false } });
        await updateRuntime({ nativeImportEndedAt: Date.now() });
      } catch (err) {
        console.warn('[bg] onImportEnded 处理失败', err);
      }
    })();
  });

  /* ---- 快捷键：打开管理页 ---- */
  chrome.commands.onCommand.addListener((command) => {
    void (async () => {
      if (command !== 'open-manager') return;
      try {
        await openManager();
      } catch (err) {
        console.error('[bg] 打开管理页失败', err);
      }
    })();
  });

  /* ---- 右键菜单：加入本扩展书签（打开 capture 小窗）---- */
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    void (async () => {
      if (info.menuItemId !== CONTEXT_MENU_IDS.addBookmark) return;
      try {
        const url = info.pageUrl ?? tab?.url ?? '';
        await openCapture({ mode: 'page', url, title: tab?.title ?? '' });
      } catch (err) {
        console.error('[bg] 打开收藏小窗失败', err);
      }
    })();
  });

  /* ---- 消息路由 ---- */
  chrome.runtime.onMessage.addListener((message: BvRequest, _sender, sendResponse) => {
    void (async () => {
      try {
        const data = await handleRequest(message);
        sendResponse({ ok: true, data } satisfies BvResponse);
      } catch (err) {
        console.error('[bg] 请求失败', message?.type, err);
        sendResponse({ ok: false, error: toErrorKey(err) } satisfies BvResponse);
      }
    })();
    // 异步响应必须返回 true 保持消息通道
    return true;
  });

  // 任意唤醒都尝试续跑（2.3 第 2 条），失败不影响其他逻辑
  void bootstrap();
});
