/**
 * 标签与备注：规范化、增删改、重命名、按归一化 URL 重绑、orphanMeta 生命周期。
 *
 * 文档出处：5.I（I1–I4）、决策 D-5。
 *
 * 边界：标签备注是扩展本地附加数据，按 bookmarkId 关联，绝不写回原生书签，
 * 也不随 Chrome 账号同步（9 节第 8 条）。
 */

import { CONTENT_LIMITS } from '@/shared/constants';
import { withWriteLock } from '@/shared/lock';
import { encodeUtf8, sha256Hex } from '@/shared/util';
import { applyPatch, readDb } from '@/modules/storage';
import { normalizeUrl } from '@/modules/dedupe';
import type { BookmarkMeta, BookmarkNode, BookmarkTree, CategoryRule } from '@/shared/types';

/** 统一小写比较键（去首尾空白后） */
function keyOf(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * 标签规范化（I2）：去首尾空白、按大小写不敏感去重但保留首次输入的形态、
 * 单标签 ≤ 32 字符、每书签 ≤ 50 个。
 */
export function normalizeTags(input: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const tag = raw.trim().slice(0, CONTENT_LIMITS.tagMaxChars);
    if (!tag) continue;
    const key = keyOf(tag);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= CONTENT_LIMITS.tagsPerBookmark) break;
  }
  return result;
}

/** 备注截断（I3：≤ 5000 字符，超出截断并提示由界面负责） */
export function clampNote(note: string): string {
  return note.slice(0, CONTENT_LIMITS.noteMaxChars);
}

/** 备注是否被截断（界面据此提示） */
export function isNoteTruncated(note: string): boolean {
  return note.length > CONTENT_LIMITS.noteMaxChars;
}

/** 新增标签（去重、超长截断） */
export function addTag(meta: BookmarkMeta, tag: string): BookmarkMeta {
  return { ...meta, tags: normalizeTags([...meta.tags, tag]) };
}

/** 删除标签（大小写不敏感匹配） */
export function removeTag(meta: BookmarkMeta, tag: string): BookmarkMeta {
  const key = keyOf(tag);
  return { ...meta, tags: meta.tags.filter((item) => keyOf(item) !== key) };
}

/** 空 meta（无标签也无备注）判定 */
export function isEmptyMeta(meta: BookmarkMeta): boolean {
  return meta.tags.length === 0 && meta.note.trim() === '';
}

/** 标签计数（标签云与筛选面板用） */
export function tagCounts(metas: Record<string, BookmarkMeta>): Array<{ tag: string; count: number }> {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const meta of Object.values(metas)) {
    for (const tag of meta.tags) {
      const key = keyOf(tag);
      const current = counts.get(key);
      if (current) current.count += 1;
      else counts.set(key, { tag, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** 写入单条 meta（走 SW 写锁；页面不直接写 storage） */
export async function setMeta(
  bookmarkId: string,
  patch: Partial<BookmarkMeta>,
): Promise<void> {
  await withWriteLock(async () => {
    const db = await readDb();
    const current = db.bookmarkMeta[bookmarkId] ?? { tags: [], note: '' };
    const next: BookmarkMeta = {
      tags: normalizeTags(patch.tags ?? current.tags),
      note: clampNote(patch.note ?? current.note),
    };
    const bookmarkMeta = { ...db.bookmarkMeta };
    if (isEmptyMeta(next)) delete bookmarkMeta[bookmarkId];
    else bookmarkMeta[bookmarkId] = next;
    await applyPatch({ bookmarkMeta });
  });
}

/**
 * 标签重命名的纯函数版本（页面侧用：算好新映射后走 `db:patch` 交给 SW 落盘）。
 * 新名与已有标签重名时按「合并」处理并去重。
 */
export function renameTagIn(
  bookmarkMeta: Record<string, BookmarkMeta>,
  orphanMeta: Record<string, BookmarkMeta>,
  from: string,
  to: string,
): { bookmarkMeta: Record<string, BookmarkMeta>; orphanMeta: Record<string, BookmarkMeta>; updated: number } {
  const nextName = to.trim().slice(0, CONTENT_LIMITS.tagMaxChars);
  if (!nextName) throw new Error('errTagEmpty');
  const fromKey = keyOf(from);
  let updated = 0;

  const renameIn = (metas: Record<string, BookmarkMeta>): Record<string, BookmarkMeta> => {
    const result: Record<string, BookmarkMeta> = {};
    for (const [id, meta] of Object.entries(metas)) {
      if (!meta.tags.some((tag) => keyOf(tag) === fromKey)) {
        result[id] = meta;
        continue;
      }
      const replaced = meta.tags.map((tag) => (keyOf(tag) === fromKey ? nextName : tag));
      result[id] = { ...meta, tags: normalizeTags(replaced) };
      updated += 1;
    }
    return result;
  };

  return {
    bookmarkMeta: renameIn(bookmarkMeta),
    orphanMeta: renameIn(orphanMeta),
    updated,
  };
}

/** 标签删除的纯函数版本（I2：仅解除关联，不删书签） */
export function deleteTagIn(
  bookmarkMeta: Record<string, BookmarkMeta>,
  orphanMeta: Record<string, BookmarkMeta>,
  tag: string,
): { bookmarkMeta: Record<string, BookmarkMeta>; orphanMeta: Record<string, BookmarkMeta>; updated: number } {
  const target = keyOf(tag);
  let updated = 0;

  const stripIn = (metas: Record<string, BookmarkMeta>): Record<string, BookmarkMeta> => {
    const result: Record<string, BookmarkMeta> = {};
    for (const [id, meta] of Object.entries(metas)) {
      if (!meta.tags.some((item) => keyOf(item) === target)) {
        result[id] = meta;
        continue;
      }
      const next = { ...meta, tags: meta.tags.filter((item) => keyOf(item) !== target) };
      updated += 1;
      if (!isEmptyMeta(next)) result[id] = next;
    }
    return result;
  };

  return {
    bookmarkMeta: stripIn(bookmarkMeta),
    orphanMeta: stripIn(orphanMeta),
    updated,
  };
}

/** 标签重命名（SW 侧写入口，供后台/迁移调用） */
export async function renameTag(from: string, to: string): Promise<{ updated: number }> {
  return withWriteLock(async () => {
    const db = await readDb();
    const result = renameTagIn(db.bookmarkMeta, db.orphanMeta, from, to);
    await applyPatch({ bookmarkMeta: result.bookmarkMeta, orphanMeta: result.orphanMeta });
    return { updated: result.updated };
  });
}

/** 删除标签（SW 侧写入口） */
export async function deleteTag(tag: string): Promise<{ updated: number }> {
  return withWriteLock(async () => {
    const db = await readDb();
    const result = deleteTagIn(db.bookmarkMeta, db.orphanMeta, tag);
    await applyPatch({ bookmarkMeta: result.bookmarkMeta, orphanMeta: result.orphanMeta });
    return { updated: result.updated };
  });
}

/** 清理挂起记录（I1：orphanMeta 只在用户清理或重新匹配时减少） */
export async function clearOrphanMeta(): Promise<{ cleared: number }> {
  return withWriteLock(async () => {
    const db = await readDb();
    const cleared = Object.keys(db.orphanMeta).length;
    await applyPatch({ orphanMeta: {} });
    return { cleared };
  });
}

/* ------------------------------------------------------------------ */
/* 重绑（I1 / D-5）                                                     */
/* ------------------------------------------------------------------ */

/** 收集「归一化 URL → meta 队列」，队列顺序即快照中的先序顺序 */
export function groupMetaByUrl(
  sourceTree: BookmarkTree,
  sourceMeta: Record<string, BookmarkMeta>,
): Map<string, BookmarkMeta[]> {
  const urlOf = new Map<string, string>();
  const walk = (node: BookmarkNode): void => {
    if (node.url !== undefined) {
      const normalized = normalizeUrl(node.url);
      if (normalized) urlOf.set(node.id, normalized);
      return;
    }
    for (const child of node.children ?? []) walk(child);
  };
  for (const root of sourceTree) walk(root);

  const pool = new Map<string, BookmarkMeta[]>();
  for (const [oldId, meta] of Object.entries(sourceMeta)) {
    const normalized = urlOf.get(oldId);
    if (!normalized) continue;
    const queue = pool.get(normalized);
    if (queue) queue.push(meta);
    else pool.set(normalized, [meta]);
  }
  return pool;
}

/** 先序遍历当前树的全部书签节点 */
function preorderBookmarks(tree: BookmarkTree): BookmarkNode[] {
  const result: BookmarkNode[] = [];
  const walk = (node: BookmarkNode): void => {
    if (node.url !== undefined) {
      result.push(node);
      return;
    }
    for (const child of node.children ?? []) walk(child);
  };
  for (const root of tree) walk(root);
  return result;
}

/** 挂起 meta 的键：归一化 URL 的 SHA-256 前 40 位 hex */
export async function orphanKeyFor(normalizedUrl: string): Promise<string> {
  const hash = await sha256Hex(encodeUtf8(normalizedUrl));
  return hash.slice(0, 40);
}

export interface RebindResult {
  bookmarkMeta: Record<string, BookmarkMeta>;
  orphanMeta: Record<string, BookmarkMeta>;
  bound: number;
  orphaned: number;
}

/**
 * meta 重绑（I1）：按书签树先序遍历，依次为每个书签分配一条未被占用的同 URL meta；
 * 每书签最多 1 条；剩余写入 orphanMeta（不丢弃）。
 */
export async function rebindMeta(params: {
  sourceTree: BookmarkTree;
  sourceMeta: Record<string, BookmarkMeta>;
  targetTree: BookmarkTree;
  orphanSeed?: Record<string, BookmarkMeta>;
  /** 已有 meta（合并导入时用于「已存在书签不覆盖」） */
  existingMeta?: Record<string, BookmarkMeta>;
}): Promise<RebindResult> {
  const pool = groupMetaByUrl(params.sourceTree, params.sourceMeta);
  const bookmarkMeta: Record<string, BookmarkMeta> = { ...(params.existingMeta ?? {}) };
  let bound = 0;

  for (const node of preorderBookmarks(params.targetTree)) {
    const normalized = normalizeUrl(node.url);
    if (!normalized) continue;
    // 已存在标签备注的书签不覆盖（I4 / G2）
    if (bookmarkMeta[node.id]) {
      const queue = pool.get(normalized);
      if (queue && queue.length > 0) queue.shift();
      continue;
    }
    const queue = pool.get(normalized);
    if (!queue || queue.length === 0) continue;
    const meta = queue.shift();
    if (!meta) continue;
    bookmarkMeta[node.id] = meta;
    bound += 1;
  }

  const orphanMeta: Record<string, BookmarkMeta> = { ...(params.orphanSeed ?? {}) };
  let orphaned = 0;
  for (const [normalized, queue] of pool) {
    for (const meta of queue) {
      orphanMeta[await orphanKeyFor(normalized)] = meta;
      orphaned += 1;
    }
  }
  return { bookmarkMeta, orphanMeta, bound, orphaned };
}

/** 便于界面展示：meta 上的标签字符串（CSV 导出用 `|` 连接） */
export function tagsToText(meta: BookmarkMeta | undefined): string {
  return meta?.tags.join('|') ?? '';
}

/** 分类清单去重追加（G2：JSON 中的分类名不在现有清单时自动追加） */
export function mergeCategoryNames(rules: CategoryRule[], existing: string[]): string[] {
  const result = [...existing];
  const seen = new Set(existing.map((name) => name.trim()));
  for (const rule of rules) {
    const name = rule.category.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}
