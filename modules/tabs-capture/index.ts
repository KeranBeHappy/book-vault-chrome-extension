/**
 * 当前窗口标签收藏（J 节）：标签读取、协议过滤、批量写入。
 *
 * 隐私边界（2.2 / 9 节第 10 条）：`tabs` 权限只在用户点击时即时读取，
 * 结果仅存活于本次内存，不落盘、不监听、不采集历史。
 */

import {
  buildIndex,
  collectBookmarks,
  createBookmark,
  getTree,
  isHttpUrl,
  validateUrl,
} from '@/modules/bookmarks';
import { normalizeUrl } from '@/modules/dedupe';
import { applyPatch, readDb } from '@/modules/storage';
import { clampNote, normalizeTags } from '@/modules/tags';
import { UNSUPPORTED_SCHEMES } from '@/shared/constants';
import { withWriteLock } from '@/shared/lock';
import { sleep } from '@/shared/util';
import type { BookmarkMeta, CaptureCandidate, CaptureResult } from '@/shared/types';

/** 是否可收藏：仅 http/https，且排除扩展页与各类特殊协议（J1） */
export function isCollectable(url: string | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return false;
  if (lower.startsWith('chrome-extension://')) return false;
  return !UNSUPPORTED_SCHEMES.some((scheme) => lower.startsWith(scheme));
}

/** 读取当前窗口的候选标签；被排除的数量单独统计（J1） */
export async function readWindowTabs(): Promise<{ candidates: CaptureCandidate[]; excluded: number }> {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const candidates: CaptureCandidate[] = [];
  let excluded = 0;
  const seen = new Set<string>();

  for (const tab of tabs) {
    if (!isCollectable(tab.url)) {
      excluded += 1;
      continue;
    }
    const url = tab.url as string;
    const normalized = normalizeUrl(url);
    if (!normalized) {
      excluded += 1;
      continue;
    }
    // 同窗口内重复 URL 只保留一条
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    const title = (tab.title ?? '').trim() || url;
    candidates.push({ title, url, normalized, selected: true });
  }
  return { candidates, excluded };
}

/** 与全库比对，标记哪些候选是重复的（界面用于预选与计数） */
export async function markDuplicates(candidates: CaptureCandidate[]): Promise<Set<string>> {
  const tree = await getTree();
  const existing = new Set<string>();
  for (const entry of collectBookmarks(tree)) {
    const normalized = normalizeUrl(entry.node.url);
    if (normalized) existing.add(normalized);
  }
  return new Set(candidates.filter((item) => existing.has(item.normalized)).map((item) => item.normalized));
}

/**
 * 批量写入（J2）。调用前提：页面已生成快照并完成二次确认。
 * 统一备注只写入本次新增条目，不覆盖已存在书签的备注。
 */
export async function captureItems(
  items: Array<{ title: string; url: string }>,
  parentId: string,
  note: string,
): Promise<CaptureResult> {
  return withWriteLock(async () => {
    const db = await readDb();
    const tree = await getTree();
    const index = buildIndex(tree);
    if (!index.byId.has(parentId)) throw new Error('errFolderMissing');

    const urls = new Set<string>();
    for (const entry of collectBookmarks(tree)) {
      const normalized = normalizeUrl(entry.node.url);
      if (normalized) urls.add(normalized);
    }

    const trimmedNote = clampNote(note ?? '').trim();
    const bookmarkMeta = { ...db.bookmarkMeta };
    let created = 0;
    let duplicates = 0;
    const failed: Array<{ title: string; reason: string }> = [];

    for (const item of items) {
      const error = validateUrl(item.url);
      if (error) {
        failed.push({ title: item.title, reason: error });
        continue;
      }
      const normalized = normalizeUrl(item.url);
      if (!normalized || urls.has(normalized)) {
        duplicates += 1;
        continue;
      }
      try {
        const node = await createBookmark({
          parentId,
          title: item.title || item.url,
          url: item.url,
        });
        urls.add(normalized);
        created += 1;
        if (trimmedNote) {
          const current: BookmarkMeta = bookmarkMeta[node.id] ?? { tags: [], note: '' };
          bookmarkMeta[node.id] = {
            tags: normalizeTags(current.tags),
            note: trimmedNote,
          };
        }
        // 4.8.1：批量写之间留 ≥10ms，避免 API 限流
        await sleep(10);
      } catch (err) {
        console.error('[tabs-capture] 写入失败', item.url, err);
        failed.push({ title: item.title, reason: 'errBookmarksWrite' });
      }
    }

    await applyPatch({ bookmarkMeta, flags: { statsDirty: true } });
    return { created, duplicates, failed };
  });
}

/** 批量打开标签（A4）：上限由调用方二次确认，这里只负责创建 */
export async function openTabs(urls: string[]): Promise<number> {
  let opened = 0;
  for (const url of urls) {
    if (!isHttpUrl(url)) continue;
    try {
      await chrome.tabs.create({ url, active: false });
      opened += 1;
    } catch (err) {
      console.error('[tabs-capture] 打开标签失败', url, err);
    }
  }
  return opened;
}
