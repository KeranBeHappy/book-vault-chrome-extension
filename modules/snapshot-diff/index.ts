/**
 * 快照与当前书签的差异计算（用于「快照预览」里展示改动前后对比）。
 *
 * 语义边界：
 * - 快照存的是**操作前**状态，所以差异 = 该次操作 + 快照之后的其它改动；
 * - 只比较书签节点（有 url 的），文件夹层级变化不在此体现；
 * - 匹配先按 id（未恢复过时 id 稳定），再按归一化 URL 兜底（恢复 / 导入后 id 全部重建）。
 */

import { normalizeUrl } from '@/modules/dedupe';
import type { BookmarkNode, BookmarkTree } from '@/shared/types';

export interface TitleChange {
  /** 该条书签的当前链接，展示时作为副标题 */
  url: string;
  before: string;
  after: string;
}

export interface UrlChange {
  title: string;
  before: string;
  after: string;
}

export interface SnapshotDiff {
  titleChanges: TitleChange[];
  urlChanges: UrlChange[];
  /** 快照里没有、当前有 */
  added: number;
  /** 快照里有、当前没有 */
  removed: number;
  /** 标题与链接都与快照一致的书签数 */
  unchanged: number;
}

interface FlatBookmark {
  id: string;
  title: string;
  url: string;
}

/** 只收书签节点（有 url），跳过文件夹 */
function flatten(nodes: BookmarkTree): FlatBookmark[] {
  const result: FlatBookmark[] = [];
  const walk = (node: BookmarkNode): void => {
    if (node.url !== undefined) {
      result.push({ id: node.id, title: node.title ?? '', url: node.url });
      return;
    }
    for (const child of node.children ?? []) walk(child);
  };
  for (const node of nodes) walk(node);
  return result;
}

/** 计算快照（操作前）与当前书签的差异 */
export function diffSnapshot(snapshotTree: BookmarkTree, currentTree: BookmarkTree): SnapshotDiff {
  const before = flatten(snapshotTree);
  const after = flatten(currentTree);

  const currentById = new Map(after.map((item) => [item.id, item]));
  const pairedCurrent = new Set<string>();
  const pairs: Array<{ before: FlatBookmark; after: FlatBookmark }> = [];

  // 第一轮：id 精确匹配
  for (const item of before) {
    const hit = currentById.get(item.id);
    if (!hit || pairedCurrent.has(hit.id)) continue;
    pairs.push({ before: item, after: hit });
    pairedCurrent.add(hit.id);
  }

  // 第二轮：归一化 URL 配对（同 URL 多条时按遍历顺序一一对应）
  const currentByUrl = new Map<string, FlatBookmark[]>();
  for (const item of after) {
    if (pairedCurrent.has(item.id)) continue;
    const key = normalizeUrl(item.url);
    if (!key) continue;
    const bucket = currentByUrl.get(key);
    if (bucket) bucket.push(item);
    else currentByUrl.set(key, [item]);
  }

  const pairedBefore = new Set(pairs.map((pair) => pair.before.id));
  let removed = 0;
  for (const item of before) {
    if (pairedBefore.has(item.id)) continue;
    const key = normalizeUrl(item.url);
    const hit = key ? currentByUrl.get(key)?.shift() : undefined;
    if (!hit) {
      removed += 1;
      continue;
    }
    pairs.push({ before: item, after: hit });
    pairedCurrent.add(hit.id);
  }

  let added = 0;
  for (const item of after) {
    if (!pairedCurrent.has(item.id)) added += 1;
  }

  const titleChanges: TitleChange[] = [];
  const urlChanges: UrlChange[] = [];
  let unchanged = 0;
  for (const pair of pairs) {
    const titleChanged = pair.before.title !== pair.after.title;
    const urlChanged = pair.before.url !== pair.after.url;
    if (titleChanged) {
      titleChanges.push({ url: pair.after.url, before: pair.before.title, after: pair.after.title });
    }
    if (urlChanged) {
      urlChanges.push({ title: pair.after.title, before: pair.before.url, after: pair.after.url });
    }
    if (!titleChanged && !urlChanged) unchanged += 1;
  }

  return { titleChanges, urlChanges, added, removed, unchanged };
}
