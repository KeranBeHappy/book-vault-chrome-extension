/**
 * 快照（分片 / contentHash / 轮转）、回收站、opLog、快照恢复。
 *
 * 文档出处：5.D（D1–D4）、4.1（不可逆操作保护）、4.7（迁移前快照）。
 *
 * 分层职责（D3）：
 * - 回收站：单条/单棵子树误删的还原；
 * - 快照：整库结构回滚；
 * - opLog：最近一次操作回退（撤销深度固定 1 层）。
 */

import { cleanTitle } from '@/modules/scanner';
import {
  buildIndex,
  countBookmarks,
  createBookmark,
  createFolder,
  findEmptyFolders,
  getNode,
  getSubTree,
  getTree,
  isFolder,
  removeFoldersDeepestFirst,
  removeNode,
} from '@/modules/bookmarks';
import { applyPatch, readDb, removeItems, setItems } from '@/modules/storage';
import { rebindMeta } from '@/modules/tags';
import {
  OP_LOG_KEEP,
  SNAPSHOT_CHUNK_BYTES,
  STORAGE_KEYS,
} from '@/shared/constants';
import { withWriteLock } from '@/shared/lock';
import type { RestoreOutcome } from '@/shared/messages';
import type {
  BookmarkMeta,
  BookmarkNode,
  BookmarkTree,
  LocalDB,
  OpAction,
  OpRecord,
  RecycleItem,
  SnapshotContent,
  SnapshotMeta,
  SnapshotSource,
} from '@/shared/types';
import {
  base64ToBytes,
  bytesToBase64,
  decodeUtf8,
  encodeUtf8,
  sha256Hex,
  sleep,
  uid,
} from '@/shared/util';

/** 分片键 */
function chunkKey(snapshotId: string, index: number): string {
  return `${STORAGE_KEYS.snapshotChunkPrefix}${snapshotId}:${index}`;
}

/** 只保留受管根子树（D1：快照内容不含「移动设备书签」） */
function managedSubtree(tree: BookmarkTree): BookmarkTree {
  const index = buildIndex(tree);
  const root = tree[0];
  const children = (root?.children ?? []).filter((node) => index.roots.some((r) => r.id === node.id));
  return children;
}

/** 组装快照内容（D1：书签树 + 代理清单 + meta + orphanMeta） */
async function collectSnapshotContent(db: LocalDB): Promise<SnapshotContent> {
  const tree = await getTree();
  return {
    bookmarks: managedSubtree(tree),
    proxyBlocklist: db.proxyBlocklist,
    bookmarkMeta: db.bookmarkMeta,
    orphanMeta: db.orphanMeta,
  };
}

/** 生成快照（不持锁，调用方负责串行化） */
async function createSnapshotInternal(
  db: LocalDB,
  source: SnapshotSource,
  note?: string,
): Promise<{ meta: SnapshotMeta; db: LocalDB }> {
  const content = await collectSnapshotContent(db);
  const bytes = encodeUtf8(JSON.stringify(content));
  const contentHash = await sha256Hex(bytes);

  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += SNAPSHOT_CHUNK_BYTES) {
    chunks.push(bytesToBase64(bytes.subarray(offset, offset + SNAPSHOT_CHUNK_BYTES)));
  }
  // 空内容也要有一片，保证 chunkCount ≥ 1
  if (chunks.length === 0) chunks.push('');

  const id = uid('snap-');
  const items: Record<string, unknown> = {};
  chunks.forEach((chunk, index) => {
    items[chunkKey(id, index)] = chunk;
  });

  const bookmarkCount = countBookmarks({
    id: 'virtual-root',
    title: '',
    syncing: false,
    children: content.bookmarks,
  } as chrome.bookmarks.BookmarkTreeNode);

  const meta: SnapshotMeta = {
    id,
    createdAt: Date.now(),
    source,
    count: bookmarkCount,
    bytes: bytes.length,
    chunkCount: chunks.length,
    contentHash,
    encrypted: false,
    ...(note ? { note } : {}),
  };

  try {
    await setItems(items);
  } catch (err) {
    console.error('[backup] 快照分片写入失败', err);
    throw new Error('errSnapshotWrite');
  }

  const keep = db.settings.localSnapshotKeep;
  const all = [meta, ...db.localSnapshots].sort((a, b) => b.createdAt - a.createdAt);
  const kept = all.slice(0, Math.max(1, keep));
  const dropped = all.slice(Math.max(1, keep));

  db.localSnapshots = kept;
  await applyPatch({ localSnapshots: kept });

  if (dropped.length > 0) await deleteSnapshotChunks(dropped);
  return { meta, db };
}

/** 删除快照的全部分片键 */
async function deleteSnapshotChunks(list: SnapshotMeta[]): Promise<void> {
  const keys: string[] = [];
  for (const meta of list) {
    for (let index = 0; index < meta.chunkCount; index += 1) keys.push(chunkKey(meta.id, index));
  }
  await removeItems(keys);
}

/**
 * 生成快照（4.1 / D1）。
 * 存储写入异常时抛错——调用方必须中止后续操作，不允许「无快照继续」。
 */
export async function createSnapshot(source: SnapshotSource, note?: string): Promise<SnapshotMeta> {
  return withWriteLock(async () => {
    const db = await readDb();
    const { meta } = await createSnapshotInternal(db, source, note);
    return meta;
  });
}

/** 删除指定快照（取消操作时清理本次快照，避免轮转被空快照挤占） */
export async function deleteSnapshot(id: string): Promise<void> {
  await withWriteLock(async () => {
    const db = await readDb();
    const target = db.localSnapshots.find((meta) => meta.id === id);
    if (!target) return;
    await deleteSnapshotChunks([target]);
    db.localSnapshots = db.localSnapshots.filter((meta) => meta.id !== id);
    await applyPatch({ localSnapshots: db.localSnapshots });
  });
}

/** 读取并校验快照内容（D4 第 1 步：结构解析 + contentHash 比对） */
export async function readSnapshotContent(id: string): Promise<SnapshotContent> {
  const db = await readDb();
  const meta = db.localSnapshots.find((item) => item.id === id);
  if (!meta) throw new Error('errSnapshotMissing');

  const keys = Array.from({ length: meta.chunkCount }, (_, index) => chunkKey(id, index));
  const stored = await chrome.storage.local.get(keys);
  const parts: Uint8Array[] = [];
  for (const key of keys) {
    const base64 = stored[key];
    if (typeof base64 !== 'string') throw new Error('errSnapshotCorrupted');
    parts.push(base64ToBytes(base64));
  }

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }

  const hash = await sha256Hex(merged);
  if (hash !== meta.contentHash) {
    console.error('[backup] 快照 hash 不符', { id, expect: meta.contentHash, actual: hash });
    throw new Error('errSnapshotCorrupted');
  }

  try {
    return JSON.parse(decodeUtf8(merged)) as SnapshotContent;
  } catch (err) {
    console.error('[backup] 快照解析失败', err);
    throw new Error('errSnapshotCorrupted');
  }
}

/** 列出快照元信息（按时间倒序） */
export async function listSnapshots(): Promise<SnapshotMeta[]> {
  const db = await readDb();
  return [...db.localSnapshots].sort((a, b) => b.createdAt - a.createdAt);
}

/* ------------------------------------------------------------------ */
/* 书签重建 / 恢复                                                      */
/* ------------------------------------------------------------------ */

/** 递归重建节点，记录 旧 id → 新 id 映射 */
async function recreateNode(
  node: BookmarkNode,
  parentId: string,
  idMap: Map<string, string>,
): Promise<void> {
  if (node.url !== undefined) {
    const created = await createBookmark({ parentId, title: node.title, url: node.url });
    idMap.set(node.id, created.id);
    // 4.8.1：批量写之间留 ≥10ms 间隔，避免 API 限流
    await sleep(10);
    return;
  }
  const folder = await createFolder({ parentId, title: node.title });
  idMap.set(node.id, folder.id);
  for (const child of node.children ?? []) await recreateNode(child, folder.id, idMap);
  await sleep(10);
}

/** 清空受管两根的直接子节点（D4 第 4 步） */
async function clearManagedRoots(): Promise<string[]> {
  const tree = await getTree();
  const index = buildIndex(tree);
  const removedParents: string[] = [];
  for (const root of index.roots) {
    const node = index.byId.get(root.id);
    if (!node) continue;
    for (const child of [...(node.children ?? [])]) {
      try {
        await removeNode(child);
      } catch (err) {
        console.error('[backup] 清空根节点失败', child.id, err);
        throw new Error('errRestoreFailed');
      }
    }
    removedParents.push(root.id);
  }
  return removedParents;
}

/** 把快照内容写回浏览器（返回 旧id→新id 映射） */
async function rebuildFromContent(
  content: SnapshotContent,
  parents: string[],
): Promise<Map<string, string>> {
  const idMap = new Map<string, string>();
  const primaryParent = parents[0];
  if (!primaryParent) throw new Error('errRestoreFailed');

  // 快照里保存的就是受管根的子树；按 root 顺序尽量落到同名根，落不下的一律进第一个根
  const tree = await getTree();
  const index = buildIndex(tree);
  const rootIds = index.roots.map((root) => root.id);
  const contentRoots = content.bookmarks;

  for (let i = 0; i < contentRoots.length; i += 1) {
    const sourceRoot = contentRoots[i];
    if (!sourceRoot) continue;
    const targetId = rootIds[i] ?? primaryParent;
    for (const child of sourceRoot.children ?? []) {
      await recreateNode(child, targetId, idMap);
    }
  }
  return idMap;
}

/**
 * 快照恢复（D4）。调用前页面必须已完成二次确认。
 * 顺序：校验（readSnapshotContent 内）→ restorePre 快照 → 清空两根 → 重建 → 失败自动回滚。
 *
 * @param id 要恢复的快照
 * @param restorePreId 恢复前已生成的快照 id（校验其存在）
 */
export async function restoreSnapshot(id: string, restorePreId?: string): Promise<RestoreOutcome> {
  const content = await readSnapshotContent(id);
  return restoreFromContent(content, restorePreId);
}

/**
 * 用「已解密的内容」执行覆盖恢复。
 * 云端加密备份走这里（内容来自 WebDAV 下载 + 解密，不落本地快照）。
 */
export async function restoreFromContent(
  content: SnapshotContent,
  restorePreId?: string,
): Promise<RestoreOutcome> {
  return withWriteLock(async () => {
    const db = await readDb();

    // 恢复前快照：D4 第 2 步
    let preId = restorePreId;
    if (!preId) {
      const created = await createSnapshotInternal(db, 'restorePre');
      preId = created.meta.id;
    }
    const preMeta = (await readDb()).localSnapshots.find((meta) => meta.id === preId);
    if (!preMeta) throw new Error('errSnapshotMissing');

    const parents = await clearManagedRoots();
    try {
      const idMap = await rebuildFromContent(content, parents);

      // 代理清单一并还原（分类规则已下线，旧快照里的 rules 字段忽略）
      await applyPatch({ proxyBlocklist: content.proxyBlocklist });

      // 按 I1 规则重绑标签备注
      const rebind = await rebindMeta({
        sourceTree: content.bookmarks,
        sourceMeta: content.bookmarkMeta,
        targetTree: await getTree(),
        orphanSeed: content.orphanMeta,
      });
      // 重绑是全量新映射，必须整段替换，否则旧 id 的键会残留
      await applyPatch(
        { bookmarkMeta: rebind.bookmarkMeta, orphanMeta: rebind.orphanMeta },
        { replace: ['bookmarkMeta', 'orphanMeta'] },
      );

      // 恢复后清理空文件夹
      const empties = await findEmptyFolders(await getTree());
      if (empties.length > 0) await removeFoldersDeepestFirst(empties);

      await applyPatch({ flags: { statsDirty: true } });
      return {
        restored: idMap.size,
        invalid: 0,
        boundMeta: rebind.bound,
        orphanMeta: rebind.orphaned,
        restorePreId: preId,
      };
    } catch (err) {
      console.error('[backup] 恢复失败，尝试回滚到 restorePre', preId, err);
      const rollbackOk = await rollback(preId);
      return {
        failed: true,
        restored: 0,
        invalid: 0,
        boundMeta: 0,
        orphanMeta: 0,
        restorePreId: preId,
        rollbackFailed: !rollbackOk,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
}

/** 用 restorePre 快照 best-effort 回滚（D4 第 5 步） */
async function rollback(preId: string): Promise<boolean> {
  try {
    const content = await readSnapshotContent(preId);
    const parents = await clearManagedRoots();
    await rebuildFromContent(content, parents);
    const rebind = await rebindMeta({
      sourceTree: content.bookmarks,
      sourceMeta: content.bookmarkMeta,
      targetTree: await getTree(),
      orphanSeed: content.orphanMeta,
    });
    await applyPatch(
      {
        bookmarkMeta: rebind.bookmarkMeta,
        orphanMeta: rebind.orphanMeta,
        proxyBlocklist: content.proxyBlocklist,
        flags: { statsDirty: true },
      },
      { replace: ['bookmarkMeta', 'orphanMeta'] },
    );
    return true;
  } catch (err) {
    console.error('[backup] 回滚失败', err);
    return false;
  }
}

/**
 * 恢复前预检（D4 第 1–2 步）：校验快照 + 生成 restorePre。
 * 页面拿到结果后二次确认，确认走 `restoreSnapshot`，取消则删掉 restorePre。
 */
export async function prepareRestore(id: string): Promise<{ meta: SnapshotMeta; restorePreId: string }> {
  return withWriteLock(async () => {
    const db = await readDb();
    const content = await readSnapshotContent(id);
    void content;
    const { meta } = await createSnapshotInternal(db, 'restorePre');
    const target = db.localSnapshots.find((item) => item.id === id);
    if (!target) throw new Error('errSnapshotMissing');
    return { meta: target, restorePreId: meta.id };
  });
}

/* ------------------------------------------------------------------ */
/* 回收站                                                              */
/* ------------------------------------------------------------------ */

/** 收集子树内所有书签的标签备注（key = 旧 id） */
function collectSubtreeMeta(
  node: BookmarkNode,
  metas: Record<string, BookmarkMeta>,
): Record<string, BookmarkMeta> {
  const result: Record<string, BookmarkMeta> = {};
  const walk = (current: BookmarkNode): void => {
    const meta = metas[current.id];
    if (meta) result[current.id] = meta;
    for (const child of current.children ?? []) walk(child);
  };
  walk(node);
  return result;
}

/** 子树内所有节点 id */
function subtreeIds(node: BookmarkNode): string[] {
  const ids: string[] = [];
  const walk = (current: BookmarkNode): void => {
    ids.push(current.id);
    for (const child of current.children ?? []) walk(child);
  };
  walk(node);
  return ids;
}

/** 判断 candidate 是否为 ancestor 的子孙（用于剔除嵌套 id） */
function isDescendant(candidateId: string, ancestorId: string, parentOf: Map<string, string>): boolean {
  let current = parentOf.get(candidateId);
  while (current) {
    if (current === ancestorId) return true;
    current = parentOf.get(current);
  }
  return false;
}

/**
 * 删除书签/文件夹到回收站（A2 / A3 / D2）。
 * 单条 = 1 个顶层节点（删文件夹含整棵子树仍计 1 条）。
 */
export async function deleteToRecycle(ids: string[]): Promise<{ deleted: number }> {
  return withWriteLock(async () => {
    const db = await readDb();
    const tree = await getTree();
    const index = buildIndex(tree);

    // 剔除嵌套 id：父节点已在删除列表里时，子节点不再单独入回收站
    const tops: string[] = [];
    for (const id of ids) {
      if (index.mobileIds.has(id)) continue;
      if (index.roots.some((root) => root.id === id)) continue;
      if (tops.some((topId) => isDescendant(id, topId, index.parentOf))) continue;
      tops.push(id);
    }

    // 第一阶段：读到待删节点后立刻写 suppress 标记，供 onRemoved 忽略（A9）
    const targets: Array<{ node: BookmarkNode; meta: Record<string, BookmarkMeta>; parentId: string }> = [];
    const suppressIds: string[] = [];
    for (const id of tops) {
      const node = await getSubTree(id);
      if (!node) continue;
      targets.push({
        node,
        meta: collectSubtreeMeta(node, db.bookmarkMeta),
        parentId: node.parentId ?? index.roots[1]?.id ?? index.roots[0]?.id ?? '2',
      });
      suppressIds.push(...subtreeIds(node));
    }
    if (suppressIds.length > 0) {
      await applyPatch({
        flags: { ...db.flags, suppressRemovalIds: suppressIds, suppressAt: Date.now() },
      });
    }

    // 第二阶段：真正删除；无论成功与否都要清掉 suppress，避免标记残留
    const newItems: RecycleItem[] = [];
    const removedIds: string[] = [];
    try {
      for (const target of targets) {
        try {
          await removeNode(target.node);
        } catch (err) {
          console.error('[backup] 删除失败', target.node.id, err);
          throw new Error('errBookmarksWrite');
        }
        newItems.push({
          id: uid('rc-'),
          restoredNode: target.node,
          meta: Object.keys(target.meta).length > 0 ? target.meta : undefined,
          parentId: target.parentId,
          deletedAt: Date.now(),
        });
        removedIds.push(...subtreeIds(target.node));
        await sleep(10);
      }
    } finally {
      await applyPatch({ flags: { ...db.flags, suppressRemovalIds: [] } });
    }

    // 回收站轮转：按 deletedAt 保留最新 N 条
    const keep = db.settings.recycleKeep;
    let recycleBin = [...newItems, ...db.recycleBin].sort((a, b) => b.deletedAt - a.deletedAt);
    const dropped = recycleBin.slice(keep);
    recycleBin = recycleBin.slice(0, keep);

    // 清理被删节点的状态与 meta；淘汰条目的 meta 一并丢弃
    const linkStatus = { ...db.linkStatus };
    const bookmarkMeta = { ...db.bookmarkMeta };
    for (const id of removedIds) {
      delete linkStatus[id];
      delete bookmarkMeta[id];
    }
    for (const item of dropped) {
      for (const oldId of Object.keys(item.meta ?? {})) delete bookmarkMeta[oldId];
    }

    await applyPatch(
      {
        recycleBin,
        linkStatus,
        bookmarkMeta,
        flags: { statsDirty: true },
      },
      { replace: ['bookmarkMeta', 'linkStatus'] },
    );
    return { deleted: newItems.length };
  });
}

/** 回收站恢复：原父目录不存在时落到「其他书签」根（D2） */
export async function restoreRecycleItem(itemId: string): Promise<{ restored: number; parentId: string }> {
  return withWriteLock(async () => {
    const db = await readDb();
    const item = db.recycleBin.find((entry) => entry.id === itemId);
    if (!item) throw new Error('errRecycleItemMissing');

    const tree = await getTree();
    const index = buildIndex(tree);
    const parentNode = index.byId.get(item.parentId);
    const fallbackRoot = index.roots[1]?.id ?? index.roots[0]?.id;
    const targetParent = parentNode && isFolder(parentNode) ? parentNode.id : fallbackRoot;
    if (!targetParent) throw new Error('errNoManagedRoot');

    const idMap = new Map<string, string>();
    await recreateNodeInto(item.restoredNode, targetParent, idMap);

    // meta 按新 id 重新绑定，旧键一并清除
    const bookmarkMeta = { ...db.bookmarkMeta };
    for (const [oldId, meta] of Object.entries(item.meta ?? {})) {
      const newId = idMap.get(oldId);
      if (newId) bookmarkMeta[newId] = meta;
      delete bookmarkMeta[oldId];
    }

    await applyPatch(
      {
        recycleBin: db.recycleBin.filter((entry) => entry.id !== itemId),
        bookmarkMeta,
        flags: { statsDirty: true },
      },
      { replace: ['bookmarkMeta'] },
    );
    return { restored: idMap.size, parentId: targetParent };
  });
}

/** 恢复时把节点重建到指定父目录（顶层节点直接沿用原节点） */
async function recreateNodeInto(
  node: BookmarkNode,
  parentId: string,
  idMap: Map<string, string>,
): Promise<void> {
  await recreateNode(node, parentId, idMap);
}

/** 清空回收站：连带删除对应 bookmarkMeta */
export async function clearRecycleBin(): Promise<{ cleared: number }> {
  return withWriteLock(async () => {
    const db = await readDb();
    const bookmarkMeta = { ...db.bookmarkMeta };
    for (const item of db.recycleBin) {
      for (const oldId of Object.keys(item.meta ?? {})) delete bookmarkMeta[oldId];
    }
    await applyPatch({ recycleBin: [], bookmarkMeta }, { replace: ['bookmarkMeta'] });
    return { cleared: db.recycleBin.length };
  });
}

/* ------------------------------------------------------------------ */
/* opLog 与单步撤销                                                     */
/* ------------------------------------------------------------------ */

/** 追加一条操作记录（调用方已在写锁内，直接改 db 后由调用方落盘） */
export function appendOpLog(
  db: LocalDB,
  entry: { action: OpAction; affectedIds: string[]; beforeSnapshotId: string },
): OpRecord {
  const record: OpRecord = {
    id: uid('op-'),
    action: entry.action,
    createdAt: Date.now(),
    affectedIds: entry.affectedIds,
    beforeSnapshotId: entry.beforeSnapshotId,
  };
  db.opLog = [record, ...db.opLog].slice(0, OP_LOG_KEEP);
  return record;
}

/** 读取最近一次可撤销操作 */
export async function latestUndoable(): Promise<OpRecord | null> {
  const db = await readDb();
  return db.opLog[0] ?? null;
}

/**
 * 撤销预检（4.1：撤销执行前也要生成快照）。
 * 返回本次要回退到的快照 id 与新建的 restorePre。
 */
export async function prepareUndo(): Promise<{ op: OpRecord; restorePreId: string }> {
  return withWriteLock(async () => {
    const db = await readDb();
    const op = db.opLog[0];
    if (!op) throw new Error('errNothingToUndo');
    const exists = db.localSnapshots.some((meta) => meta.id === op.beforeSnapshotId);
    if (!exists) throw new Error('errUndoSnapshotMissing');
    const { meta } = await createSnapshotInternal(db, 'restorePre');
    return { op, restorePreId: meta.id };
  });
}

/** 执行撤销：整库回滚到该操作前的快照（决策已确认） */
export async function undoLastOp(restorePreId: string): Promise<RestoreOutcome> {
  const db = await readDb();
  const op = db.opLog[0];
  if (!op) throw new Error('errNothingToUndo');
  const outcome = await restoreSnapshot(op.beforeSnapshotId, restorePreId);
  // 撤销本身不可撤销：消耗掉这条记录
  if (!outcome.failed) {
    await withWriteLock(async () => {
      const latest = await readDb();
      await applyPatch({ opLog: latest.opLog.filter((entry) => entry.id !== op.id) });
    });
  }
  return outcome;
}

/* ------------------------------------------------------------------ */
/* 空文件夹清理                                                        */
/* ------------------------------------------------------------------ */

/** 扫描并清理空文件夹（A8 / C3 内部调用；调用方需事先有快照） */
export async function cleanEmptyFolders(): Promise<number> {
  const tree = await getTree();
  const empties = findEmptyFolders(tree);
  if (empties.length === 0) return 0;
  const removed = await removeFoldersDeepestFirst(empties);
  await applyPatch({ flags: { statsDirty: true } });
  return removed;
}

/** 只删指定 id 的空文件夹（预览后清理） */
export async function cleanEmptyFoldersByIds(ids: string[]): Promise<number> {
  const tree = await getTree();
  const index = buildIndex(tree);
  const wanted = ids
    .map((id) => index.byId.get(id))
    .filter((node): node is BookmarkNode => !!node && isFolder(node));
  if (wanted.length === 0) return 0;
  const removed = await removeFoldersDeepestFirst(wanted);
  await applyPatch({ flags: { statsDirty: true } });
  return removed;
}

/** 便于界面展示：按标题清洗后的文件夹名（保持与 B1 一致） */
export function folderDisplayName(title: string): string {
  return cleanTitle(title) || title;
}

/** 读取单条回收站条目（详情展示用） */
export async function findRecycleItem(itemId: string): Promise<RecycleItem | null> {
  const db = await readDb();
  return db.recycleBin.find((item) => item.id === itemId) ?? null;
}

/** 记录节点是否仍存在（恢复前校验） */
export async function nodeExists(id: string): Promise<boolean> {
  return (await getNode(id)) !== null;
}
