/**
 * URL 归一化、重复分组、标题 bigram Jaccard 相似度。
 *
 * 文档出处：4.2（归一化）、5.F（重复检测与相似检测）。
 * 纯函数模块：SW 与页面共用，不做任何 IO。
 */

import { cleanTitle } from '@/modules/scanner';
import { TRACKING_PARAMS } from '@/shared/constants';
import type { DuplicateGroup } from '@/shared/types';

const TRACKING_SET = new Set<string>(TRACKING_PARAMS.map((key) => key.toLowerCase()));

/** 判断是否为跟踪参数（`utm_*` 前缀 + 常量清单） */
function isTrackingParam(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.startsWith('utm_') || TRACKING_SET.has(lower);
}

/** 解码百分号编码；非法编码时原样返回（4.2 第 6 条只用于比较，不改写原 URL） */
function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/**
 * URL 归一化（4.2），严格按顺序执行：
 * 1. http/https 视为相同（只保留 host+path+query，不含协议）
 * 2. host 小写、去 `www.`、忽略默认端口（URL 解析会自动去掉 :80 / :443）
 * 3. 去掉路径末尾 `/`（根路径归一为空）
 * 4. 移除 `#fragment`
 * 5. 移除跟踪参数，剩余参数按 key 升序排序
 * 6. 百分号编码统一解码后再比较
 *
 * 非 http/https 返回 null（不参与归一化分组）。
 */
export function normalizeUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (!host) return null;

  // pathname 已不含 fragment；末尾斜杠统一去掉
  let path = safeDecode(parsed.pathname);
  path = path.replace(/\/+$/, '');

  const pairs: Array<[string, string]> = [];
  parsed.searchParams.forEach((value, key) => {
    if (isTrackingParam(key)) return;
    pairs.push([safeDecode(key), safeDecode(value)]);
  });
  pairs.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));

  const query = pairs.map(([key, value]) => `${key}=${value}`).join('&');
  return `${host}${path}${query ? `?${query}` : ''}`;
}

/**
 * 按归一化 URL 分组，返回书签数 ≥ 2 的组。
 * `unsupported`（非 http/https）不参与分组。
 */
export function groupDuplicates(
  items: Array<{ id: string; url?: string }>,
): DuplicateGroup[] {
  const buckets = new Map<string, string[]>();
  for (const item of items) {
    const normalized = normalizeUrl(item.url);
    if (!normalized) continue;
    const bucket = buckets.get(normalized);
    if (bucket) bucket.push(item.id);
    else buckets.set(normalized, [item.id]);
  }
  const groups: DuplicateGroup[] = [];
  for (const [normalizedUrl, bookmarkIds] of buckets) {
    if (bookmarkIds.length >= 2) groups.push({ normalizedUrl, bookmarkIds });
  }
  // 组内按 URL 排序，保证结果稳定
  groups.sort((a, b) => (a.normalizedUrl < b.normalizedUrl ? -1 : 1));
  return groups;
}

/** 相似度比较前的归一化：小写、去站点后缀（B1）、去标点与空白（F2） */
export function normalizeTitleForSimilarity(title: string): string {
  return cleanTitle(title)
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/;

/**
 * 构造比较用的 token 集合：
 * - 中文（含日韩）按字符 bigram；
 * - 拉丁/数字按词；
 * 单字中文退化为 unigram，避免完全无法比较。
 */
export function titleTokens(normalized: string): Set<string> {
  const tokens = new Set<string>();
  let latin = '';
  let cjkRun = '';

  const flushLatin = (): void => {
    if (latin) {
      tokens.add(latin);
      latin = '';
    }
  };
  const flushCjk = (): void => {
    if (!cjkRun) return;
    if (cjkRun.length === 1) tokens.add(cjkRun);
    for (let i = 0; i < cjkRun.length - 1; i += 1) tokens.add(cjkRun.slice(i, i + 2));
    cjkRun = '';
  };

  for (const char of normalized) {
    if (CJK.test(char)) {
      flushLatin();
      cjkRun += char;
    } else if (/[\p{L}\p{N}]/u.test(char)) {
      flushCjk();
      latin += char;
    } else {
      flushLatin();
      flushCjk();
    }
  }
  flushLatin();
  flushCjk();
  return tokens;
}

/** Jaccard 系数：交集 / 并集；两边皆空时为 0 */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** 计算两个标题的相似度（0–1） */
export function titleSimilarity(left: string, right: string): number {
  const a = titleTokens(normalizeTitleForSimilarity(left));
  const b = titleTokens(normalizeTitleForSimilarity(right));
  return jaccard(a, b);
}

/**
 * 局部相似检测：仅在「同一 host」或「同一重复组内」两两比较（F2 / 9 节第 12 条）。
 * 组规模 > 50 的组直接跳过并标记 skipped。
 */
export function findSimilarTitles(
  items: Array<{ id: string; title: string; url?: string }>,
  threshold: number,
  groupLimit = 50,
): { pairs: Array<{ a: string; b: string; score: number }>; skipped: number } {
  const byHost = new Map<string, Array<{ id: string; title: string }>>();
  for (const item of items) {
    const normalized = normalizeUrl(item.url);
    if (!normalized) continue;
    const host = normalized.split('/')[0] ?? '';
    const bucket = byHost.get(host);
    const entry = { id: item.id, title: item.title };
    if (bucket) bucket.push(entry);
    else byHost.set(host, [entry]);
  }

  const pairs: Array<{ a: string; b: string; score: number }> = [];
  let skipped = 0;
  for (const bucket of byHost.values()) {
    if (bucket.length < 2) continue;
    if (bucket.length > groupLimit) {
      skipped += 1;
      continue;
    }
    for (let i = 0; i < bucket.length; i += 1) {
      for (let j = i + 1; j < bucket.length; j += 1) {
        const left = bucket[i];
        const right = bucket[j];
        if (!left || !right) continue;
        const score = titleSimilarity(left.title, right.title);
        if (score >= threshold) pairs.push({ a: left.id, b: right.id, score });
      }
    }
  }
  return { pairs, skipped };
}
