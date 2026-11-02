/**
 * 标题清洗、标题抓取（charset 嗅探 / 256KB 截断）、链接三态检测、CSV 报表。
 *
 * 文档出处：5.B（B1–B8）、9 节第 3/4/5 条（技术限制）。
 *
 * 技术边界（不得绕开）：
 * - 后台 fetch 不执行 JS、不渲染页面，SPA 可能抓不到真实标题，只能拿 HTML 里的值；
 * - SW 拿不到细粒度网络错误码，DNS 失败与其他网络错误无法稳定区分 → 一律归「存疑」；
 * - 不能伪造 User-Agent，不能分别走直连/代理对比。
 */

import { HTTP_LIMITS, UNFETCHABLE_PREFIXES } from '@/shared/constants';
import { formatLocalDateTime, truncate } from '@/shared/util';
import type { CsvRow } from '@/shared/types';

/* ------------------------------------------------------------------ */
/* B1 标题清洗                                                          */
/* ------------------------------------------------------------------ */

/** 站点后缀：` - 站名`、` | 站名`、`_站名` */
const SITE_SUFFIX = /\s*[-|_]\s*[^\-|_]{1,40}$/;

/**
 * 浏览器强制拦截、不允许扩展抓取的站点（Chrome 应用商店等）。
 * 命中时不要发请求，否则只会得到 CORS 拒绝并污染扩展错误面板。
 */
export function isFetchBlocked(url: string): boolean {
  return UNFETCHABLE_PREFIXES.some((prefix) => url.startsWith(prefix));
}

/**
 * 标题清洗（B1）：去站点后缀、连续空白与首尾空格；纯本地，不联网。
 * 结果为空时由调用方保留原值。
 */
export function cleanTitle(title: string): string {
  if (!title) return '';
  let result = title.replace(/\s+/g, ' ').trim();
  // 后缀可能叠加（"标题 - 站名 - 频道"），最多剥两层，避免把正文削光
  for (let i = 0; i < 2; i += 1) {
    const next = result.replace(SITE_SUFFIX, '').trim();
    if (next.length === 0 || next === result) break;
    result = next;
  }
  return result.trim();
}

/** 常见 HTML 实体反转义（B2：标题值做实体反转义后再清洗） */
export function decodeHtmlEntities(text: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    hellip: '…',
    mdash: '—',
    ndash: '–',
    middot: '·',
    ldquo: '“',
    rdquo: '”',
    lsquo: '‘',
    rsquo: '’',
    copy: '©',
    reg: '®',
    trade: '™',
  };
  return text.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return named[body.toLowerCase()] ?? match;
  });
}

/* ------------------------------------------------------------------ */
/* B2 联网抓取站点名                                                     */
/* ------------------------------------------------------------------ */

/** 从 Content-Type 中取 charset */
function charsetFromContentType(contentType: string | null): string | null {
  if (!contentType) return null;
  const match = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType);
  return match?.[1]?.toLowerCase() ?? null;
}

/** 在前 1024 字节内嗅探 charset（`<meta charset>` 与 `http-equiv` 两种写法） */
function sniffCharset(head: Uint8Array): string | null {
  // 头部只可能是 ASCII 兼容编码，用 latin1 解码不会破坏属性名
  const text = new TextDecoder('latin1').decode(head);
  const direct = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(text);
  if (direct?.[1]) return direct[1].toLowerCase();
  const equiv = /<meta[^>]+content\s*=\s*["'][^"']*charset\s*=\s*([\w-]+)/i.exec(text);
  if (equiv?.[1]) return equiv[1].toLowerCase();
  return null;
}

/** 用指定字符集解码；不支持或解码抛错时返回 null 交由调用方回退 UTF-8 */
function tryDecode(bytes: Uint8Array, charset: string | null): string | null {
  if (!charset) return null;
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return null;
  }
}

/** 读取响应体但不超过 limit 字节，超出后主动 cancel（B2：256KB 上限） */
async function readLimited(res: Response, limit: number): Promise<Uint8Array> {
  const body = res.body;
  if (!body) {
    const buffer = new Uint8Array(await res.arrayBuffer());
    return buffer.subarray(0, limit);
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      total += value.length;
    }
  } finally {
    // 达到上限或提前结束时都要中止，避免继续下载
    if (total >= limit) {
      try {
        await reader.cancel();
      } catch {
        /* 已结束的流 cancel 会抛错，忽略 */
      }
    }
    reader.releaseLock();
  }

  const merged = new Uint8Array(Math.min(total, limit));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= merged.length) break;
    const slice = chunk.subarray(0, Math.min(chunk.length, merged.length - offset));
    merged.set(slice, offset);
    offset += slice.length;
  }
  return merged;
}

/** 取 meta 标签 content（支持 property/name 两种属性顺序） */
function metaContent(html: string, key: string): string | null {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const hasKey = new RegExp(`(?:property|name)\\s*=\\s*["']${key}["']`, 'i').test(tag);
    if (!hasKey) continue;
    const content = /content\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
    const value = content?.[2] ?? content?.[3];
    if (value) return value;
  }
  return null;
}

/** 取 `<title>` 文本 */
function titleTag(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match?.[1] ? match[1] : null;
}

/** 取域名（B2 第三优先级） */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * 联网刷新站点名（B2）。解析优先级：og:site_name → `<title>` → 域名。
 * 返回 null 表示失败（调用方保留原标题并标记 titleRefresh=failed）。
 */
export async function fetchSiteName(url: string, timeoutSec: number): Promise<string | null> {
  // 浏览器强拦的站点不发请求：只会拿到 CORS 错误，控制台还会留红字
  if (isFetchBlocked(url)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      credentials: 'omit',
      signal: controller.signal,
      headers: { Accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) {
      try {
        await res.body?.cancel();
      } catch {
        /* ignore */
      }
      return null;
    }
    const contentType = res.headers.get('content-type');
    const isHtml =
      !!contentType && /text\/html|application\/xhtml\+xml/i.test(contentType);
    if (!isHtml) {
      try {
        await res.body?.cancel();
      } catch {
        /* ignore */
      }
      return null;
    }

    const bytes = await readLimited(res, HTTP_LIMITS.titleMaxBytes);
    if (bytes.length === 0) return null;

    const sniffed = sniffCharset(bytes.subarray(0, HTTP_LIMITS.charsetSniffBytes));
    const declared = charsetFromContentType(contentType);
    let html = tryDecode(bytes, declared ?? sniffed);
    if (html === null) html = tryDecode(bytes, sniffed);
    // 解码失败不抛错，改用 UTF-8 重试一次
    if (html === null) html = new TextDecoder('utf-8').decode(bytes);

    const raw =
      metaContent(html, 'og:site_name') ??
      metaContent(html, 'og:title') ??
      titleTag(html) ??
      hostOf(url);
    const decoded = decodeHtmlEntities(raw).trim();
    const cleaned = cleanTitle(decoded);
    return cleaned || hostOf(url) || null;
  } catch (err) {
    console.warn('[scanner] 抓取标题失败', url, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* B3 / B4 链接有效性检测                                                */
/* ------------------------------------------------------------------ */

/** 三态判定结果（B4 保守口径） */
export interface LinkCheckResult {
  status: 'ok' | 'dead' | 'suspect' | 'unsupported';
  httpStatus?: number;
  error?: string;
  proxySuspect?: boolean;
}

/** 单次请求；HEAD 不读 body，GET 读到响应头后立即 cancel */
async function requestOnce(
  url: string,
  method: 'HEAD' | 'GET',
  timeoutSec: number,
): Promise<{ status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      credentials: 'omit',
      signal: controller.signal,
    });
    if (method === 'GET') {
      try {
        await res.body?.cancel();
      } catch {
        /* ignore */
      }
    }
    return { status: res.status };
  } finally {
    clearTimeout(timer);
  }
}

/** 把异常转成错误码（不区分 DNS 与其他网络错误，见 9 节第 4 条） */
function errorCode(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') return 'timeout';
  const name = err instanceof Error ? err.name : '';
  if (name === 'AbortError') return 'timeout';
  return 'network';
}

/**
 * 检测单条链接（B3 / B4）。
 * HEAD 优先；405/501/403 或网络异常时降级 GET；判定保守，不确定一律 suspect。
 */
export async function checkLink(
  url: string,
  timeoutSec: number,
  options?: { proxySuspect?: boolean },
): Promise<LinkCheckResult> {
  if (!/^https?:\/\//i.test(url)) return { status: 'unsupported' };

  // 浏览器强拦的站点（webstore 等）不发请求，标为不支持检测
  if (isFetchBlocked(url)) return { status: 'unsupported', error: 'blockedHost' };

  // 命中代理清单：直接标存疑，不发请求（避免 404 被误判死链）
  if (options?.proxySuspect) {
    return { status: 'suspect', proxySuspect: true, error: 'proxySuspect' };
  }

  let status: number;
  try {
    ({ status } = await requestOnce(url, 'HEAD', timeoutSec));
    if (status === 405 || status === 501 || status === 403) {
      ({ status } = await requestOnce(url, 'GET', timeoutSec));
    }
  } catch (headErr) {
    try {
      ({ status } = await requestOnce(url, 'GET', timeoutSec));
    } catch (getErr) {
      const code = errorCode(getErr) === 'timeout' ? 'timeout' : errorCode(headErr);
      return { status: 'suspect', error: code };
    }
  }

  if (status >= 200 && status < 300) return { status: 'ok', httpStatus: status };
  if (status === 404 || status === 410) return { status: 'dead', httpStatus: status };
  return { status: 'suspect', httpStatus: status, error: `http${status}` };
}

/* ------------------------------------------------------------------ */
/* B8 CSV 导出                                                         */
/* ------------------------------------------------------------------ */

/** RFC 4180 转义：含逗号/引号/CR/LF 时整体加引号，内部引号双写 */
export function csvEscape(value: string): string {
  const text = value ?? '';
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * 生成 CSV 文本：UTF-8 带 BOM、CRLF 行尾（Excel 打开中文不乱码）。
 * 字段顺序由调用方传入的表头决定（B8 固定为标题/URL/域名/状态/状态码/时间/错误/代理/标签/备注）。
 */
export function buildCsv(header: string[], rows: CsvRow[], statusLabels: Record<string, string>): string {
  const lines: string[] = [header.map(csvEscape).join(',')];
  for (const row of rows) {
    const cells = [
      row.title,
      row.url,
      row.domain,
      statusLabels[row.status] ?? row.status,
      row.httpStatus === null ? '' : String(row.httpStatus),
      row.checkedAt === null ? '' : formatLocalDateTime(row.checkedAt),
      row.error,
      row.proxySuspect ? statusLabels.yes ?? 'Y' : statusLabels.no ?? 'N',
      row.tags,
      row.note,
    ];
    lines.push(cells.map(csvEscape).join(','));
  }
  return `\ufeff${lines.join('\r\n')}`;
}

/** 响应体预览（E1：连接测试必须给出前 200 字符） */
export function bodyPreview(text: string): string {
  return truncate(text.replace(/\s+/g, ' ').trim(), HTTP_LIMITS.bodyPreviewChars);
}
