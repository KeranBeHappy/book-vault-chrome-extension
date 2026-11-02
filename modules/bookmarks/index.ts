/**
 * chrome.bookmarks 封装：树读取、根节点识别、CRUD、移动、批量改写辅助、空文件夹扫描。
 *
 * 文档出处：5.A、4.3（范围约束）、4.2（URL 校验口径）。
 * 本模块只做「书签库」相关的事，不碰快照/回收站（那是 backup 的职责），
 * 以免出现 backup ↔ bookmarks 的循环依赖。
 */

import { MANAGED_ROOT_IDS, MOBILE_ROOT_ID, ROOT_TITLE_FALLBACK } from '@/shared/constants';
import type { BookmarkNode, BookmarkTree } from '@/shared/types';

/** 受管根：书签栏 / 其他书签（顺序固定，先书签栏后其他书签） */
export interface ManagedRoot {
  id: string;
  title: string;
}

/** 扁平化后的书签条目，供列表与索引使用 */
export interface BookmarkEntry {
  node: BookmarkNode;
  /** 祖先文件夹标题（不含根），用于「所属文件夹」列 */
  path: string[];
  /** 所属受管根 id */
  rootId: string;
}

/** 书签树索引：id → 节点、id → 父 id、受管根集合 */
export interface TreeIndex {
  byId: Map<string, BookmarkNode>;
  parentOf: Map<string, string>;
  roots: ManagedRoot[];
  /** 「移动设备书签」子树内的所有 id（写操作必须排除） */
  mobileIds: Set<string>;
}

/** 读取整棵树 */
export async function getTree(): Promise<BookmarkTree> {
  try {
    return await chrome.bookmarks.getTree();
  } catch (err) {
    console.error('[bookmarks] getTree 失败', err);
    throw new Error('errBookmarksRead');
  }
}

/** 取顶层分组（书签栏/其他书签/移动设备）。getTree 返回单根节点，其 children 即分组 */
function topGroups(tree: BookmarkTree): BookmarkNode[] {
  const root = tree[0];
  if (!root) return [];
  return root.children ?? tree.filter((node) => node !== root);
}

/**
 * 识别受管根（4.3）：优先固定 id（1=书签栏、2=其他书签），
 * id 不存在时按根标题匹配；两者都失败则不展示该根。
 */
export function resolveManagedRoots(tree: BookmarkTree): ManagedRoot[] {
  const groups = topGroups(tree);
  const byId = new Map(groups.map((node) => [node.id, node]));
  const used = new Set<string>();
  const roots: ManagedRoot[] = [];

  const pick = (fixedId: string, fallbackTitles: readonly string[]): void => {
    const direct = byId.get(fixedId);
    if (direct && !used.has(direct.id)) {
      roots.push({ id: direct.id, title: direct.title });
      used.add(direct.id);
      return;
    }
    const matched = groups.find(
      (node) =>
        !used.has(node.id) &&
        node.id !== MOBILE_ROOT_ID &&
        fallbackTitles.some((title) => node.title.trim() === title),
    );
    if (matched) {
      roots.push({ id: matched.id, title: matched.title });
      used.add(matched.id);
    }
  };

  pick(MANAGED_ROOT_IDS[0], ROOT_TITLE_FALLBACK.bar);
  pick(MANAGED_ROOT_IDS[1], ROOT_TITLE_FALLBACK.other);
  return roots;
}

/** 递归收集节点 id（含自身） */
export function collectIds(node: BookmarkNode, target: Set<string>): Set<string> {
  target.add(node.id);
  for (const child of node.children ?? []) collectIds(child, target);
  return target;
}

/** 构建树索引；「移动设备书签」子树单独收集，写操作据此排除 */
export function buildIndex(tree: BookmarkTree): TreeIndex {
  const byId = new Map<string, BookmarkNode>();
  const parentOf = new Map<string, string>();
  const mobileIds = new Set<string>();

  const walk = (node: BookmarkNode, parentId?: string): void => {
    byId.set(node.id, node);
    if (parentId) parentOf.set(node.id, parentId);
    for (const child of node.children ?? []) walk(child, node.id);
  };

  for (const group of topGroups(tree)) {
    walk(group);
    if (group.id === MOBILE_ROOT_ID || group.title === '移动设备书签') {
      collectIds(group, mobileIds);
    }
  }

  return { byId, parentOf, roots: resolveManagedRoots(tree), mobileIds };
}

/** 是否 http/https 链接 */
export function isHttpUrl(url: string | undefined | null): boolean {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

/**
 * URL 校验（A2 / R-01 / R-02）：只接受 http/https 且 host 非空。
 * 返回 i18n key 表示错误，null 表示合法。
 */
export function validateUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return 'errUrlEmpty';
  if (!isHttpUrl(trimmed)) return 'errUrlScheme';
  try {
    const parsed = new URL(trimmed);
    if (!parsed.hostname) return 'errUrlInvalid';
    return null;
  } catch {
    return 'errUrlInvalid';
  }
}

/** 节点是否为文件夹（无 url） */
export function isFolder(node: BookmarkNode): boolean {
  return node.url === undefined;
}

/** 取单个节点；不存在时返回 null（不抛错，供幂等校验用） */
export async function getNode(id: string): Promise<BookmarkNode | null> {
  try {
    const nodes = await chrome.bookmarks.get(id);
    return nodes[0] ?? null;
  } catch {
    return null;
  }
}

/** 取子树（含自身） */
export async function getSubTree(id: string): Promise<BookmarkNode | null> {
  try {
    const nodes = await chrome.bookmarks.getSubTree(id);
    return nodes[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * 扁平化受管根下的全部书签（url 非空），先序遍历。
 * `path` 为该书签上方的文件夹标题链（不含根），用于「所属文件夹」列。
 */
export function collectBookmarks(tree: BookmarkTree, index?: TreeIndex): BookmarkEntry[] {
  const resolved = index ?? buildIndex(tree);
  const entries: BookmarkEntry[] = [];

  const walk = (node: BookmarkNode, rootId: string, ancestors: string[]): void => {
    if (node.url !== undefined) {
      entries.push({ node, path: ancestors, rootId });
      return;
    }
    for (const child of node.children ?? []) walk(child, rootId, [...ancestors, node.title]);
  };

  for (const root of resolved.roots) {
    const node = resolved.byId.get(root.id);
    if (!node || resolved.mobileIds.has(node.id)) continue;
    for (const child of node.children ?? []) walk(child, root.id, []);
  }
  return entries;
}

/** 受管根下的全部文件夹（不含根本身、不含移动设备书签） */
export function collectFolders(
  tree: BookmarkTree,
  index?: TreeIndex,
): Array<{ node: BookmarkNode; path: string[]; rootId: string }> {
  const resolved = index ?? buildIndex(tree);
  const folders: Array<{ node: BookmarkNode; path: string[]; rootId: string }> = [];

  const walk = (node: BookmarkNode, rootId: string, ancestors: string[]): void => {
    if (node.url !== undefined) return;
    folders.push({ node, path: ancestors, rootId });
    for (const child of node.children ?? []) walk(child, rootId, [...ancestors, node.title]);
  };

  for (const root of resolved.roots) {
    const node = resolved.byId.get(root.id);
    if (!node || resolved.mobileIds.has(node.id)) continue;
    for (const child of node.children ?? []) walk(child, root.id, []);
  }
  return folders;
}

/** 子树内的书签数量（不含文件夹自身） */
export function countBookmarks(node: BookmarkNode): number {
  if (node.url !== undefined) return 1;
  return (node.children ?? []).reduce((sum, child) => sum + countBookmarks(child), 0);
}

/**
 * 扫描空文件夹（A8）：该文件夹递归不含任何 url 非空节点，且不是根节点、
 * 不包含受保护根（受管根与「移动设备书签」）。
 *
 * 父文件夹为空时其空子文件夹也会被列出；清理时按深度倒序删除即可，
 * 子节点先删不会报错。
 */
export function findEmptyFolders(tree: BookmarkTree): BookmarkNode[] {
  const index = buildIndex(tree);
  const protectedIds = new Set<string>([MOBILE_ROOT_ID, ...index.roots.map((root) => root.id)]);
  const result: BookmarkNode[] = [];

  const hasBookmark = (node: BookmarkNode): boolean => {
    if (node.url !== undefined) return true;
    return (node.children ?? []).some(hasBookmark);
  };

  const walk = (node: BookmarkNode): void => {
    if (node.url !== undefined) return;
    const isProtected = protectedIds.has(node.id);
    if (!isProtected && !hasBookmark(node)) result.push(node);
    for (const child of node.children ?? []) walk(child);
  };

  for (const group of topGroups(tree)) {
    if (protectedIds.has(group.id)) {
      // 受管根的直属子文件夹仍要参与扫描，但根本身不动
      for (const child of group.children ?? []) walk(child);
    }
  }
  return result;
}

/** 新建书签；调用方需先校验 URL 与标题 */
export async function createBookmark(input: {
  parentId: string;
  title: string;
  url: string;
}): Promise<BookmarkNode> {
  try {
    return await chrome.bookmarks.create({
      parentId: input.parentId,
      title: input.title,
      url: input.url,
    });
  } catch (err) {
    console.error('[bookmarks] create 失败', err);
    throw new Error('errBookmarksWrite');
  }
}

/** 新建文件夹 */
export async function createFolder(input: { parentId: string; title: string }): Promise<BookmarkNode> {
  try {
    return await chrome.bookmarks.create({ parentId: input.parentId, title: input.title });
  } catch (err) {
    console.error('[bookmarks] createFolder 失败', err);
    throw new Error('errBookmarksWrite');
  }
}

/** 更新标题/URL（只传需要变更的字段） */
export async function updateNode(
  id: string,
  changes: { title?: string; url?: string },
): Promise<void> {
  try {
    await chrome.bookmarks.update(id, changes);
  } catch (err) {
    console.error('[bookmarks] update 失败', err);
    throw new Error('errBookmarksWrite');
  }
}

/** 移动到指定文件夹；index 缺省时追加到末尾 */
export async function moveNode(id: string, parentId: string, index?: number): Promise<void> {
  try {
    await chrome.bookmarks.move(id, index === undefined ? { parentId } : { parentId, index });
  } catch (err) {
    console.error('[bookmarks] move 失败', err);
    throw new Error('errBookmarksWrite');
  }
}

/** 删除节点：书签用 remove，文件夹用 removeTree（A3） */
export async function removeNode(node: BookmarkNode): Promise<void> {
  try {
    if (node.url !== undefined) await chrome.bookmarks.remove(node.id);
    else await chrome.bookmarks.removeTree(node.id);
  } catch (err) {
    console.error('[bookmarks] remove 失败', err);
    throw new Error('errBookmarksWrite');
  }
}

/** 空文件夹清理：按深度倒序删除，避免父先于子被删导致 id 失效 */
export async function removeFoldersDeepestFirst(nodes: BookmarkNode[]): Promise<number> {
  const withDepth = nodes.map((node) => ({ node, depth: depthOf(node) }));
  withDepth.sort((a, b) => b.depth - a.depth);
  let removed = 0;
  for (const { node } of withDepth) {
    const current = await getNode(node.id);
    if (!current || current.url !== undefined) continue;
    try {
      await chrome.bookmarks.removeTree(node.id);
      removed += 1;
    } catch (err) {
      console.error('[bookmarks] 删除空文件夹失败', node.id, err);
    }
  }
  return removed;
}

/** 节点深度（最大递归层数，用于删除顺序） */
function depthOf(node: BookmarkNode): number {
  if (!node.children || node.children.length === 0) return 0;
  return 1 + Math.max(...node.children.map((child) => depthOf(child)));
}

/* ------------------------------------------------------------------ */
/* 批量改写（A5）                                                        */
/* ------------------------------------------------------------------ */

/** 标题改写操作 */
export type TitleOp =
  | { kind: 'prefix'; text: string }
  | { kind: 'suffix'; text: string }
  | { kind: 'replace'; from: string; to: string; caseSensitive: boolean };

/** 转义正则元字符，供「按字面量查找替换」使用 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 按字面量查找替换；from 为空时原样返回（禁止把空串替换成任意内容） */
function replaceLiteral(
  input: string,
  from: string,
  to: string,
  caseSensitive: boolean,
): string {
  if (!from) return input;
  const regex = new RegExp(escapeRegExp(from), caseSensitive ? 'g' : 'gi');
  return input.replace(regex, to);
}

/** 应用标题改写；返回最终标题（可能为空，由调用方决定是否告警） */
export function applyTitleOp(title: string, op: TitleOp): string {
  switch (op.kind) {
    case 'prefix':
      return `${op.text}${title}`;
    case 'suffix':
      return `${title}${op.text}`;
    case 'replace':
      return replaceLiteral(title, op.from, op.to, op.caseSensitive);
    default:
      return title;
  }
}

/** 应用 URL 替换（只允许查找替换，禁止改协议/清空） */
export function applyUrlReplace(
  url: string,
  op: { from: string; to: string; caseSensitive: boolean },
): string {
  return replaceLiteral(url, op.from, op.to, op.caseSensitive);
}

/** 域名提取（统计与排序用）；非 http/https 返回空串 */
export function domainOf(url: string | undefined): string {
  if (!isHttpUrl(url)) return '';
  try {
    return new URL(url as string).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}
