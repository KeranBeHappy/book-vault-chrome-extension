/**
 * 跨上下文消息协议（页面 ↔ Service Worker）。
 *
 * 依据：文档 4.6「并发与一致性」——所有对书签与 LocalDB 的写操作统一走 SW，
 * 页面只发请求、不直接写，避免多页面竞争。
 *
 * 约定：
 * 1. 消息体必须是可结构化克隆的纯数据；不要传函数、DOM、Vue 响应式对象。
 * 2. 失败时 `error` 优先给 i18n key（如 `errUrlInvalid`），页面用
 *    `translateError` 转成当前语言；无法映射的原始信息会附带原文便于排查。
 * 3. 不可逆操作（4.1）由页面先算影响、再 `snapshot:create`、二次确认后带
 *    `snapshotId` 调执行接口；取消时用 `snapshot:delete` 删掉本次快照。
 */

import type {
  BookmarkNode,
  CaptureResult,
  ImportOptions,
  ImportPreview,
  JobKind,
  JobProgress,
  LocalDB,
  OpRecord,
  RemoteBackupEntry,
  RewriteResult,
  Settings,
  SnapshotContent,
  SnapshotMeta,
  SnapshotSource,
  WebDavSettings,
  WebDavTestResult,
} from './types';

/** 快照恢复结果（D4：失败可回滚，需回传 restorePre 快照 id） */
export interface RestoreOutcome {
  restored: number;
  /** 预览后已被外部删除而跳过的条数 */
  invalid: number;
  /** 重绑成功的标签备注条数 */
  boundMeta: number;
  /** 无法重绑、转入 orphanMeta 的条数 */
  orphanMeta: number;
  /** 恢复前快照 id，供失败时人工回滚 */
  restorePreId: string;
  /** 本次恢复是否失败（失败时界面按 error + restorePreId 提示） */
  failed?: boolean;
  /** 失败原因（i18n key 或原始信息） */
  error?: string;
  /** 自动回滚是否失败（失败时界面必须提示 restorePreId） */
  rollbackFailed?: boolean;
}

/** 云端恢复前的预检结果：确认框要展示书签数与是否加密（E3） */
export interface CloudRestorePreview {
  fileName: string;
  exportedAt: number;
  count: number;
  encrypted: boolean;
  /** 已生成的本机 restorePre 快照 id */
  restorePreId: string;
}

/** 批量改写输入项：页面已算好最终值，SW 只做二次校验与写入 */
export interface RewriteItem {
  id: string;
  title?: string;
  url?: string;
}

/** 页面 → SW 的请求 */
export type BvRequest =
  | { type: 'db:get' }
  | { type: 'db:patch'; patch: DeepPartial<LocalDB> }
  | { type: 'settings:patch'; patch: DeepPartial<Settings> }
  | { type: 'snapshot:create'; source: SnapshotSource; note?: string }
  | { type: 'snapshot:delete'; id: string }
  | { type: 'snapshot:read'; id: string }
  | { type: 'snapshot:prepareRestore'; id: string }
  | { type: 'snapshot:restore'; id: string; restorePreId: string }
  | { type: 'recycle:restore'; id: string }
  | { type: 'recycle:clear'; snapshotId: string }
  | { type: 'oplog:prepareUndo' }
  | { type: 'oplog:undo'; opLogId: string; restorePreId: string }
  | { type: 'bm:create'; parentId: string; title: string; url: string }
  | { type: 'bm:update'; id: string; title?: string; url?: string }
  | { type: 'bm:move'; ids: string[]; parentId: string; snapshotId: string }
  | { type: 'bm:delete'; ids: string[]; snapshotId: string }
  | { type: 'bm:rewrite'; items: RewriteItem[]; snapshotId: string }
  | { type: 'folder:create'; parentId: string; title: string }
  | { type: 'folder:rename'; id: string; title: string }
  | { type: 'folder:delete'; id: string; snapshotId: string }
  | { type: 'folder:cleanEmpty'; ids: string[]; snapshotId: string }
  | { type: 'job:start'; kind: JobKind; ids: string[] }
  | { type: 'job:cancel'; jobId: string }
  | { type: 'job:progress'; jobId: string }
  | { type: 'job:results'; jobId: string }
  | { type: 'title:apply'; jobId: string; snapshotId: string }
  | { type: 'classify:apply'; items: Array<{ bookmarkId: string; category: string }>; snapshotId: string }
  | { type: 'webdav:test'; config: WebDavSettings }
  | { type: 'webdav:list' }
  | { type: 'webdav:upload'; password?: string }
  | { type: 'webdav:prepareRestore'; fileName: string; password?: string }
  | { type: 'webdav:restore'; fileName: string; restorePreId: string; password?: string }
  | { type: 'webdav:delete'; fileName: string }
  | { type: 'backup:now'; cloud: boolean; password?: string }
  | { type: 'io:parse'; kind: 'json' | 'html'; text: string; password?: string }
  | { type: 'io:import'; kind: 'json' | 'html'; text: string; options: ImportOptions; snapshotId: string }
  | { type: 'io:exportJson'; password?: string }
  | { type: 'io:exportHtml' }
  | { type: 'encrypt:setup'; password: string }
  | { type: 'encrypt:changePassword'; oldPassword: string; newPassword: string }
  | { type: 'encrypt:clearVault' }
  | { type: 'capture:apply'; items: Array<{ title: string; url: string }>; parentId: string; note: string; snapshotId: string }
  | { type: 'ui:openManager' }
  | { type: 'ui:openCapture'; mode: 'page' | 'window'; url?: string; title?: string };

/** 各请求对应的响应数据类型 */
export interface BvResponseMap {
  'db:get': LocalDB;
  'db:patch': LocalDB;
  'settings:patch': LocalDB;
  'snapshot:create': SnapshotMeta;
  'snapshot:delete': null;
  'snapshot:read': SnapshotContent;
  'snapshot:prepareRestore': { meta: SnapshotMeta; restorePreId: string };
  'snapshot:restore': RestoreOutcome;
  'recycle:restore': { restored: number; parentId: string };
  'recycle:clear': { cleared: number };
  'oplog:prepareUndo': { op: OpRecord; restorePreId: string };
  'oplog:undo': RestoreOutcome;
  'bm:create': BookmarkNode;
  'bm:update': null;
  'bm:move': { moved: number; skipped: number };
  'bm:delete': { deleted: number };
  'bm:rewrite': RewriteResult;
  'folder:create': BookmarkNode;
  'folder:rename': null;
  'folder:delete': { deleted: number };
  'folder:cleanEmpty': { removed: number };
  'job:start': JobProgress;
  'job:cancel': JobProgress;
  'job:progress': JobProgress;
  'job:results': Record<string, string>;
  'title:apply': { updated: number; failed: number };
  'classify:apply': { moved: number; invalid: number; removedFolders: number };
  'webdav:test': WebDavTestResult;
  'webdav:list': RemoteBackupEntry[];
  'webdav:upload': { fileName: string; deleted: number };
  'webdav:prepareRestore': CloudRestorePreview;
  'webdav:restore': RestoreOutcome;
  'webdav:delete': null;
  'backup:now': { snapshot: SnapshotMeta; uploaded: boolean; fileName?: string; error?: string };
  'io:parse': ImportPreview;
  'io:import': { created: number; duplicates: number; invalid: number; rules: number; boundMeta: number; orphanMeta: number };
  'io:exportJson': { fileName: string; content: string };
  'io:exportHtml': { fileName: string; content: string };
  'encrypt:setup': null;
  'encrypt:changePassword': null;
  'encrypt:clearVault': null;
  'capture:apply': CaptureResult;
  'ui:openManager': null;
  'ui:openCapture': null;
}

/** 递归可选，供 patch 语义使用；数组整体替换而非逐项合并 */
export type DeepPartial<T> = T extends readonly (infer U)[]
  ? U[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/** SW → 页面的统一响应；失败必须给用户可读文案（不含堆栈） */
export type BvResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * 发送请求给 SW 并解包结果。
 * 失败时抛 Error（`message` 为 i18n key 或原始信息），由调用方转成界面提示。
 */
export async function sendToBackground<T extends BvRequest['type']>(
  req: Extract<BvRequest, { type: T }>,
): Promise<BvResponseMap[T]> {
  const res = (await chrome.runtime.sendMessage(req)) as BvResponse<BvResponseMap[T]> | undefined;
  if (!res) throw new Error('errBackgroundUnavailable');
  if (!res.ok) throw new Error(res.error);
  return res.data;
}
