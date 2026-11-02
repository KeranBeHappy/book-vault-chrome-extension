/**
 * 本地规则自动分类：规则匹配（类型分桶 + 桶内 order）、预览影响计算、写回重建。
 *
 * 文档出处：5.C（C1–C3）、决策 D-6。
 *
 * 关键口径：
 * - 类型优先级固定为 domainExact → domainContains → urlKeyword → titleKeyword，
 *   `order` 只在桶内生效，不能被跨类型跨越（R-06）。
 * - 每个书签只取第一条命中规则；无命中归「待分类」。
 * - 写回只是「移动」，不删除任何书签；会丢弃原有文件夹层级，必须提示。
 */

import {
  buildIndex,
  countBookmarks,
  createFolder,
  domainOf,
  getTree,
  isFolder,
  moveNode,
  removeFoldersDeepestFirst,
} from '@/modules/bookmarks';
import { applyPatch, readDb } from '@/modules/storage';
import { UNCATEGORIZED } from '@/shared/constants';
import { withWriteLock } from '@/shared/lock';
import { sleep } from '@/shared/util';
import type {
  BookmarkNode,
  BookmarkTree,
  CategoryRule,
  ClassificationPreviewItem,
  RuleType,
} from '@/shared/types';

/** 类型桶顺序（决策 D-6，固定不可配置） */
export const RULE_TYPE_ORDER: RuleType[] = [
  'domainExact',
  'domainContains',
  'urlKeyword',
  'titleKeyword',
];

/** 按「类型分桶 + 桶内 order 升序 + id 字典序兜底」排序 */
export function sortRules(rules: CategoryRule[]): CategoryRule[] {
  return [...rules].sort((a, b) => {
    const typeDiff = RULE_TYPE_ORDER.indexOf(a.type) - RULE_TYPE_ORDER.indexOf(b.type);
    if (typeDiff !== 0) return typeDiff;
    if (a.order !== b.order) return a.order - b.order;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** 去掉 fragment 的完整 URL（urlKeyword 的匹配对象） */
function urlWithoutFragment(url: string): string {
  const index = url.indexOf('#');
  return index >= 0 ? url.slice(0, index) : url;
}

/** 归一化 host（小写、去 www.） */
function normalizedHost(url: string | undefined): string {
  return domainOf(url).replace(/^www\./, '');
}

/** 单条规则是否命中 */
function ruleMatches(rule: CategoryRule, url: string | undefined, title: string): boolean {
  const pattern = rule.pattern.trim();
  if (!pattern) return false;
  switch (rule.type) {
    case 'domainExact': {
      const host = normalizedHost(url);
      return host !== '' && host === pattern.toLowerCase().replace(/^www\./, '');
    }
    case 'domainContains': {
      const host = normalizedHost(url);
      return host !== '' && host.includes(pattern.toLowerCase().replace(/^www\./, ''));
    }
    case 'urlKeyword': {
      if (!url) return false;
      return urlWithoutFragment(url).toLowerCase().includes(pattern.toLowerCase());
    }
    case 'titleKeyword':
      return title.toLowerCase().includes(pattern.toLowerCase());
    default:
      return false;
  }
}

/** 为单条书签找第一条命中规则（类型优先 + 桶内 order） */
export function matchRule(
  url: string | undefined,
  title: string,
  rules: CategoryRule[],
): { rule: CategoryRule | null; category: string } {
  const ordered = sortRules(rules.filter((rule) => rule.enabled));
  for (const rule of ordered) {
    if (ruleMatches(rule, url, title)) {
      return { rule, category: rule.category || UNCATEGORIZED };
    }
  }
  return { rule: null, category: UNCATEGORIZED };
}

/** 生成分类预览（C2）；手动调整只存在于页面内存，这里只给初始结果 */
export function buildPreview(
  entries: Array<{ node: BookmarkNode }>,
  rules: CategoryRule[],
): ClassificationPreviewItem[] {
  return entries.map(({ node }) => {
    const matched = matchRule(node.url, node.title, rules);
    return {
      bookmarkId: node.id,
      title: node.title,
      url: node.url ?? '',
      ruleId: matched.rule?.id ?? null,
      category: matched.category,
      manual: false,
    };
  });
}

/** 分类清单（内置默认 + 规则里出现过的），用于预览分组与下拉 */
export function categoryList(rules: CategoryRule[], defaults: readonly string[]): string[] {
  const result = [...defaults];
  const seen = new Set(result);
  for (const rule of rules) {
    const name = rule.category.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  if (!seen.has(UNCATEGORIZED)) result.push(UNCATEGORIZED);
  return result;
}

/** 找到书签所属受管根 id */
function rootOf(bookmarkId: string, index: ReturnType<typeof buildIndex>): string | null {
  let current = index.parentOf.get(bookmarkId);
  let last: string | null = null;
  while (current) {
    last = current;
    current = index.parentOf.get(current);
  }
  return last;
}

/** 目标分类文件夹：受管根下的同名直接子文件夹；不存在时创建 */
async function ensureCategoryFolder(
  rootId: string,
  category: string,
  index: ReturnType<typeof buildIndex>,
): Promise<string> {
  const rootNode = index.byId.get(rootId);
  const existing = (rootNode?.children ?? []).find(
    (child) => isFolder(child) && child.title.trim() === category.trim(),
  );
  if (existing) return existing.id;
  const created = await createFolder({ parentId: rootId, title: category });
  index.byId.set(created.id, created);
  if (rootNode) {
    rootNode.children = [...(rootNode.children ?? []), created];
  }
  return created.id;
}

/**
 * 计算写回影响（C3）：将被移除的原文件夹数量、各分类数量。
 * 在页面侧调用，用于确认框展示。
 */
export function computeImpact(
  tree: BookmarkTree,
  items: Array<{ bookmarkId: string; category: string }>,
): { removedFolders: number; categoryCounts: Array<{ name: string; count: number }> } {
  const index = buildIndex(tree);
  const targetOf = new Map<string, string>();
  const counts = new Map<string, number>();

  for (const item of items) {
    const node = index.byId.get(item.bookmarkId);
    if (!node) continue;
    const rootId = rootOf(item.bookmarkId, index);
    if (!rootId) continue;
    const key = `${rootId}::${item.category}`;
    targetOf.set(item.bookmarkId, key);
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }

  // 统计每个文件夹写回后是否仍有书签（自身或子树）
  const alive = new Set<string>();
  // 先按「不移动的书签」铺底
  const movingIds = new Set(targetOf.keys());
  const markStatic = (node: BookmarkNode): boolean => {
    if (node.url !== undefined) return !movingIds.has(node.id);
    let has = false;
    for (const child of node.children ?? []) {
      const childHas = markStatic(child);
      has = has || childHas;
    }
    if (has) alive.add(node.id);
    return has;
  };
  for (const root of index.roots) {
    const node = index.byId.get(root.id);
    if (node) markStatic(node);
  }
  // 再标记目标分类文件夹存活
  for (const item of items) {
    const rootId = rootOf(item.bookmarkId, index);
    if (!rootId) continue;
    const rootNode = index.byId.get(rootId);
    const existing = (rootNode?.children ?? []).find(
      (child) => isFolder(child) && child.title.trim() === item.category.trim(),
    );
    const folderId = existing?.id ?? `virtual:${rootId}:${item.category}`;
    alive.add(folderId);
    alive.add(rootId);
  }

  const protectedIds = new Set(index.roots.map((root) => root.id));
  let removedFolders = 0;
  for (const [id, node] of index.byId) {
    if (node.url !== undefined) continue;
    if (protectedIds.has(id)) continue;
    if (!alive.has(id)) removedFolders += 1;
  }

  const categoryCounts = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { removedFolders, categoryCounts };
}

/**
 * 写回重建（C3）：按预览结果把书签移动到一级分类文件夹。
 * 不删除书签；写回后清理不再含书签的旧文件夹。
 * 调用前提：页面已生成快照并完成二次确认。
 */
export async function applyClassification(
  items: Array<{ bookmarkId: string; category: string }>,
): Promise<{ moved: number; invalid: number; removedFolders: number }> {
  return withWriteLock(async () => {
    const db = await readDb();
    const tree = await getTree();
    const index = buildIndex(tree);
    let moved = 0;
    let invalid = 0;

    for (const item of items) {
      const node = index.byId.get(item.bookmarkId);
      if (!node || node.url === undefined) {
        invalid += 1;
        continue;
      }
      const rootId = rootOf(item.bookmarkId, index);
      if (!rootId) {
        invalid += 1;
        continue;
      }
      const category = item.category.trim() || UNCATEGORIZED;
      try {
        const targetId = await ensureCategoryFolder(rootId, category, index);
        if (node.parentId === targetId) continue;
        await moveNode(node.id, targetId);
        moved += 1;
        await sleep(10);
      } catch (err) {
        console.error('[classifier] 移动失败', item.bookmarkId, err);
        invalid += 1;
      }
    }

    // 清理不再含书签的旧文件夹（C3 / A8）
    const latest = await getTree();
    const latestIndex = buildIndex(latest);
    const empties: BookmarkNode[] = [];
    for (const root of latestIndex.roots) {
      const rootNode = latestIndex.byId.get(root.id);
      for (const child of rootNode?.children ?? []) {
        if (!isFolder(child)) continue;
        if (countBookmarks(child) === 0) empties.push(child);
      }
    }
    const removedFolders = empties.length > 0 ? await removeFoldersDeepestFirst(empties) : 0;

    await applyPatch({ flags: { statsDirty: true } });
    void db;
    return { moved, invalid, removedFolders };
  });
}
