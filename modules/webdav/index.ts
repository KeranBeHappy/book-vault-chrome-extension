/**
 * 坚果云 WebDAV 客户端：PROPFIND / PUT / GET / DELETE、退避重试、轮转、连接测试。
 *
 * 文档出处：5.E（E1–E5）、9 节第 6 条。
 *
 * 技术边界（不得绕开）：
 * - 已声明 host_permissions，扩展的 fetch 跳过 CORS 检查、不发预检，
 *   因此**不存在「CORS 拦截」这一类错误**；失败只能是认证/权限/路径/频率/服务端/网络。
 * - 后台 fetch 不执行 JS，但 WebDAV 只需 XML 文本，用正则解析（SW 无 DOMParser）。
 * - 轮转只删除文件名匹配备份正则的文件，目录内其他文件一律不动（D-12）。
 */

import {
  BACKUP_FILE_PATTERN,
  HTTP_LIMITS,
  WEBDAV_RETRY_DELAYS,
  parseBackupFileName,
} from '@/shared/constants';
import { bytesToBase64, encodeUtf8, sleep, truncate } from '@/shared/util';
import type { RemoteBackupEntry, WebDavSettings, WebDavTestResult } from '@/shared/types';

/** WebDAV 请求结果 */
export interface DavResponse {
  status: number;
  ok: boolean;
  text: string;
  headers: Headers;
  url: string;
  durationMs: number;
}

/** 状态码 → 归类（E1 表格） */
export function classifyStatus(status: number): WebDavTestResult['code'] {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'notFound';
  if (status === 429) return 'rateLimited';
  if (status >= 500) return 'serverError';
  if ((status >= 200 && status < 300) || status === 207) return 'ok';
  return 'unknown';
}

/** 归类对应的 i18n key */
export function statusErrorKey(code: WebDavTestResult['code']): string {
  switch (code) {
    case 'unauthorized':
      return 'errDavUnauthorized';
    case 'forbidden':
      return 'errDavForbidden';
    case 'notFound':
      return 'errDavNotFound';
    case 'rateLimited':
      return 'errDavRateLimited';
    case 'serverError':
      return 'errDavServer';
    case 'network':
      return 'errDavNetwork';
    default:
      return 'errDavUnknown';
  }
}

/** Basic 认证头（UTF-8 安全） */
function authHeader(config: WebDavSettings): string {
  const raw = encodeUtf8(`${config.username}:${config.password}`);
  return `Basic ${bytesToBase64(raw)}`;
}

/** 拼接远端路径：server + remoteDir + name，逐段编码 */
export function buildUrl(config: WebDavSettings, name = ''): string {
  const server = config.server.trim().replace(/\/+$/, '');
  const dir = (config.remoteDir || '/').replace(/^\/?/, '/').replace(/\/?$/, '/');
  const encodedDir = dir
    .split('/')
    .map((segment) => (segment ? encodeURIComponent(segment) : ''))
    .join('/');
  const encodedName = name ? encodeURIComponent(name) : '';
  return `${server}${encodedDir}${encodedName}`;
}

/** 统一的请求入口；`retry` 打开时按 2s/8s/30s 退避（E2） */
async function request(
  config: WebDavSettings,
  method: string,
  url: string,
  options: {
    body?: string;
    contentType?: string;
    timeoutSec?: number;
    retry?: boolean;
    /** 额外请求头，如 PROPFIND 的 `Depth`（E1/E2/E3 都依赖它） */
    headers?: Record<string, string>;
  } = {},
): Promise<DavResponse> {
  const timeoutSec = options.timeoutSec ?? 30;
  const attempts = options.retry ? WEBDAV_RETRY_DELAYS.length + 1 : 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);
    const startedAt = Date.now();
    try {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: authHeader(config),
          ...(options.contentType ? { 'Content-Type': options.contentType } : {}),
          ...(options.headers ?? {}),
        },
        body: options.body,
        credentials: 'omit',
        redirect: 'follow',
        signal: controller.signal,
      });
      const text = await res.text();
      const durationMs = Date.now() - startedAt;
      clearTimeout(timer);

      const retriable = res.status === 429 || res.status >= 500;
      if (options.retry && retriable && attempt < attempts - 1) {
        await sleep(WEBDAV_RETRY_DELAYS[attempt] ?? 30000);
        continue;
      }
      return { status: res.status, ok: res.ok, text, headers: res.headers, url, durationMs };
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt < attempts - 1) {
        await sleep(WEBDAV_RETRY_DELAYS[attempt] ?? 30000);
        continue;
      }
      console.warn('[webdav] 请求失败', method, url, err);
      throw new Error('errDavNetwork');
    }
  }
  throw lastError instanceof Error ? new Error('errDavNetwork') : new Error('errDavNetwork');
}

/** PROPFIND 的请求体 */
const PROPFIND_BODY =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<d:propfind xmlns:d="DAV:"><d:prop>' +
  '<d:resourcetype/><d:getcontentlength/><d:getlastmodified/>' +
  '</d:prop></d:propfind>';

/**
 * 连接测试（E1）：OPTIONS → PROPFIND Depth:0 → PROPFIND Depth:1，
 * 按最终状态码归类，并返回 URL / 方法 / 状态码 / 耗时 / 响应体前 200 字符。
 */
export async function testConnection(config: WebDavSettings): Promise<WebDavTestResult> {
  const url = buildUrl(config);
  const startedAt = Date.now();

  try {
    // 第一步：OPTIONS（部分服务端不支持也不影响后续判定）
    await request(config, 'OPTIONS', url, { timeoutSec: 15 }).catch(() => null);
    // 第二步：PROPFIND Depth:0
    const depth0 = await request(config, 'PROPFIND', url, {
      body: PROPFIND_BODY,
      contentType: 'application/xml; charset=utf-8',
      headers: { Depth: '0' },
      timeoutSec: 15,
    });
    const code = classifyStatus(depth0.status);
    if (code !== 'ok') {
      return {
        ok: false,
        url,
        method: 'PROPFIND',
        status: depth0.status,
        durationMs: Date.now() - startedAt,
        bodyPreview: truncate(depth0.text.replace(/\s+/g, ' ').trim(), HTTP_LIMITS.bodyPreviewChars),
        code,
        detail: depth0.headers.get('retry-after') ?? undefined,
        fileCount: 0,
      };
    }

    // 第三步：PROPFIND Depth:1（顺便数远端文件数）
    const depth1 = await request(config, 'PROPFIND', url, {
      body: PROPFIND_BODY,
      contentType: 'application/xml; charset=utf-8',
      headers: { Depth: '1' },
      timeoutSec: 20,
      retry: true,
    });
    const finalCode = classifyStatus(depth1.status);
    const entries = finalCode === 'ok' ? parseEntries(depth1.text) : [];
    return {
      ok: finalCode === 'ok',
      url,
      method: 'PROPFIND',
      status: depth1.status,
      durationMs: Date.now() - startedAt,
      bodyPreview: truncate(depth1.text.replace(/\s+/g, ' ').trim(), HTTP_LIMITS.bodyPreviewChars),
      code: finalCode,
      detail: depth1.headers.get('retry-after') ?? undefined,
      fileCount: entries.length,
    };
  } catch (err) {
    return {
      ok: false,
      url,
      method: 'PROPFIND',
      status: null,
      durationMs: Date.now() - startedAt,
      bodyPreview: '',
      code: 'network',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 解析 PROPFIND 响应。
 * SW 里没有 DOMParser，用正则抓 response 块；只看直接子文件，忽略目录自身。
 */
export function parseEntries(xml: string): RemoteBackupEntry[] {
  const blocks = xml.match(/<[a-zA-Z0-9]*:?response\b[^>]*>[\s\S]*?<\/[a-zA-Z0-9]*:?response>/g) ?? [];
  const entries: RemoteBackupEntry[] = [];

  for (const block of blocks) {
    const hrefMatch = /<[a-zA-Z0-9]*:?href\b[^>]*>([\s\S]*?)<\/[a-zA-Z0-9]*:?href>/i.exec(block);
    if (!hrefMatch?.[1]) continue;
    const href = hrefMatch[1].trim();

    let decoded = href;
    try {
      decoded = decodeURIComponent(href.split('?')[0] ?? href);
    } catch {
      /* 保留原值 */
    }

    // 目录自身（以 / 结尾且没有文件名）跳过
    const segments = decoded.split('/').filter(Boolean);
    const fileName = segments[segments.length - 1] ?? '';
    if (!fileName) continue;
    if (decoded.endsWith('/')) continue;

    const lengthMatch = /<[a-zA-Z0-9]*:?getcontentlength\b[^>]*>(\d+)</i.exec(block);
    const size = lengthMatch?.[1] ? Number(lengthMatch[1]) : null;
    const exportedAt = parseBackupFileName(fileName);
    entries.push({
      fileName,
      exportedAt,
      size: Number.isFinite(size ?? NaN) ? size : null,
      recognized: BACKUP_FILE_PATTERN.test(fileName),
    });
  }

  // 按文件名时间戳倒序；无法解析的排最后
  entries.sort((a, b) => {
    if (a.exportedAt === null && b.exportedAt === null) return a.fileName < b.fileName ? -1 : 1;
    if (a.exportedAt === null) return 1;
    if (b.exportedAt === null) return -1;
    return b.exportedAt - a.exportedAt;
  });
  return entries;
}

/** 列出远端目录 */
export async function listRemote(config: WebDavSettings): Promise<RemoteBackupEntry[]> {
  const res = await request(config, 'PROPFIND', buildUrl(config), {
    body: PROPFIND_BODY,
    contentType: 'application/xml; charset=utf-8',
    // 必须 Depth:1，否则只返回目录自身，云端备份列表会永远是空的
    headers: { Depth: '1' },
    timeoutSec: 30,
    retry: true,
  });
  if (!res.ok && res.status !== 207) {
    throw new Error(statusErrorKey(classifyStatus(res.status)));
  }
  return parseEntries(res.text);
}

/** 上传（E2）：PUT + Content-Type application/json */
export async function putFile(
  config: WebDavSettings,
  fileName: string,
  content: string,
): Promise<void> {
  const res = await request(config, 'PUT', buildUrl(config, fileName), {
    body: content,
    contentType: 'application/json',
    timeoutSec: 60,
    retry: true,
  });
  if (!res.ok) throw new Error(statusErrorKey(classifyStatus(res.status)));
}

/** 下载文件文本 */
export async function getFile(config: WebDavSettings, fileName: string): Promise<string> {
  const res = await request(config, 'GET', buildUrl(config, fileName), {
    timeoutSec: 60,
    retry: true,
  });
  if (!res.ok) throw new Error(statusErrorKey(classifyStatus(res.status)));
  return res.text;
}

/** 删除远端文件 */
export async function deleteFile(config: WebDavSettings, fileName: string): Promise<void> {
  const res = await request(config, 'DELETE', buildUrl(config, fileName), {
    timeoutSec: 30,
    retry: true,
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(statusErrorKey(classifyStatus(res.status)));
  }
}

/**
 * 生成备份文件名（E2）：`bookmarks-backup-YYYYMMDD-HHmmss.json`，
 * 同秒冲突追加 `-2`、`-3`……
 */
export function uniqueBackupFileName(baseStamp: string, existing: string[]): string {
  const taken = new Set(existing);
  const first = `bookmarks-backup-${baseStamp}.json`;
  if (!taken.has(first)) return first;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `bookmarks-backup-${baseStamp}-${index}.json`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error('errDavNameConflict');
}

/**
 * 轮转（E2 / E5）：只处理匹配正则的文件，按文件名时间戳倒序保留最新 N 份。
 * 单个删除失败不阻断，返回待补删清单（调用方落 runtime.pendingCloudDeletes）。
 */
export async function rotateRemote(
  config: WebDavSettings,
  entries: RemoteBackupEntry[],
  keep: number,
): Promise<{ deleted: string[]; failed: string[] }> {
  const candidates = entries.filter((entry) => entry.recognized && entry.exportedAt !== null);
  const surplus = candidates.slice(Math.max(1, keep));

  const deleted: string[] = [];
  const failed: string[] = [];
  for (const entry of surplus) {
    try {
      await deleteFile(config, entry.fileName);
      deleted.push(entry.fileName);
    } catch (err) {
      console.warn('[webdav] 轮转删除失败', entry.fileName, err);
      failed.push(entry.fileName);
    }
  }
  return { deleted, failed };
}
