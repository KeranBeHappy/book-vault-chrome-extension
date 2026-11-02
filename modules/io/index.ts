/**
 * 导入 / 导出：Netscape HTML、自有 JSON、下载触发。
 *
 * 文档出处：5.G（G1 导出、G2 导入合并）、决策 D-8。
 *
 * 口径：
 * - HTML 只承载书签节点，不携带标签备注与规则；JSON 承载全部并可加密。
 * - 导入采用「先全量解析校验 → 再写入」两阶段，解析失败零写入。
 * - 导入是合并：目标文件夹内还原原层级、同名文件夹不合并、重复 URL 跳过。
 */

import { decodeHtmlEntities } from '@/modules/scanner';
import {
  buildIndex,
  collectBookmarks,
  createBookmark,
  createFolder,
  getTree,
  isHttpUrl,
  validateUrl,
} from '@/modules/bookmarks';
import { normalizeUrl } from '@/modules/dedupe';
import { applyPatch, readDb } from '@/modules/storage';
import { formatLocalStamp, sleep, truncate } from '@/shared/util';
import { withWriteLock } from '@/shared/lock';
import type {
  BookmarkMeta,
  BookmarkTree,
  CategoryRule,
  ImportOptions,
  ImportPreview,
  LocalDB,
} from '@/shared/types';

/** 导入用的中间节点 */
export type ImportNode =
  | { kind: 'folder'; title: string; id?: string; children: ImportNode[] }
  | { kind: 'bookmark'; title: string; url: string; id?: string };

/** 解析结果 */
export interface ParsedImport {
  nodes: ImportNode[];
  /** 条目总数（书签 + 文件夹） */
  total: number;
  rules: CategoryRule[];
  proxyBlocklist: string[];
  /** 旧 bookmarks id → 归一化 URL（JSON 才有） */
  metaByOldId: Record<string, BookmarkMeta>;
}

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** HTML 转义 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPE[char] ?? char);
}

/** 反转义（复用 scanner 的实体解码能力，保证与 B2 口径一致） */
function unescapeHtml(text: string): string {
  return decodeHtmlEntities(text);
}

/* ------------------------------------------------------------------ */
/* 导出                                                                */
/* ------------------------------------------------------------------ */

/** 生成 Netscape Bookmark File（G1：Chrome/其他浏览器可识别，不含标签备注） */
export function exportHtml(tree: BookmarkTree): string {
  const lines: string[] = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ];

  const seconds = (node: chrome.bookmarks.BookmarkTreeNode): number =>
    Math.floor((node.dateAdded ?? Date.now()) / 1000);

  const walk = (node: chrome.bookmarks.BookmarkTreeNode, depth: number): void => {
    const indent = '    '.repeat(depth);
    if (node.url !== undefined) {
      lines.push(
        `${indent}<DT><A HREF="${escapeHtml(node.url)}" ADD_DATE="${seconds(node)}">` +
          `${escapeHtml(node.title)}</A>`,
      );
      return;
    }
    lines.push(`${indent}<DT><H3 ADD_DATE="${seconds(node)}">${escapeHtml(node.title)}</H3>`);
    lines.push(`${indent}<DL><p>`);
    for (const child of node.children ?? []) walk(child, depth + 1);
    lines.push(`${indent}</DL><p>`);
  };

  for (const root of tree) {
    for (const child of root.children ?? []) walk(child, 1);
  }
  lines.push('</DL><p>');
  return lines.join('\n');
}

/** 组装 JSON 导出的明文载荷（受管根子树 + 规则 + 代理清单 + 标签备注） */
export async function buildExportPayload(): Promise<{
  bookmarks: BookmarkTree;
  rules: CategoryRule[];
  proxyBlocklist: string[];
  bookmarkMeta: Record<string, BookmarkMeta>;
}> {
  const db = await readDb();
  const tree = await getTree();
  const index = buildIndex(tree);
  const root = tree[0];
  const bookmarks = (root?.children ?? []).filter((node) =>
    index.roots.some((managed) => managed.id === node.id),
  );
  return {
    bookmarks,
    rules: db.rules,
    proxyBlocklist: db.proxyBlocklist,
    bookmarkMeta: db.bookmarkMeta,
  };
}

/* ------------------------------------------------------------------ */
/* 解析                                                                */
/* ------------------------------------------------------------------ */

/** 解析 Netscape HTML（G2） */
export function parseHtml(html: string): ParsedImport {
  const token =
    /<dl\b[^>]*>|<\/dl\s*>|<dt\b[^>]*>\s*<h3\b[^>]*>([\s\S]*?)<\/h3\s*>|<dt\b[^>]*>\s*<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;

  const root: ImportNode = { kind: 'folder', title: '__root__', children: [] };
  const stack: ImportNode[] = [root];
  let pendingFolder: ImportNode | null = null;
  let total = 0;
  let match: RegExpExecArray | null;

  const top = (): ImportNode => stack[stack.length - 1] ?? root;

  while ((match = token.exec(html)) !== null) {
    const [raw, h3Title, attrs, anchorText] = match;
    const topNode = top();

    if (h3Title !== undefined) {
      const folder: ImportNode = {
        kind: 'folder',
        title: unescapeHtml(h3Title).trim() || '未命名',
        children: [],
      };
      if (topNode.kind === 'folder') topNode.children.push(folder);
      pendingFolder = folder;
      total += 1;
      continue;
    }

    if (attrs !== undefined) {
      const href = /href\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
      const url = unescapeHtml(href?.[2] ?? href?.[3] ?? '').trim();
      const title = unescapeHtml((anchorText ?? '').trim());
      const bookmark: ImportNode = { kind: 'bookmark', title: title || url, url };
      if (topNode.kind === 'folder') topNode.children.push(bookmark);
      total += 1;
      continue;
    }

    if (/^<\/dl/i.test(raw)) {
      if (stack.length > 1) stack.pop();
      continue;
    }

    // <DL>：若紧跟 <H3>，则进入该文件夹层级
    if (pendingFolder) {
      stack.push(pendingFolder);
      pendingFolder = null;
    } else {
      stack.push(topNode);
    }
  }

  const nodes = root.kind === 'folder' ? root.children : [];
  return { nodes, total, rules: [], proxyBlocklist: [], metaByOldId: {} };
}

/** 把 JSON 备份的树转成 ImportNode（保留旧 id 供 meta 重绑） */
function toImportNodes(tree: BookmarkTree): ImportNode[] {
  const convert = (node: chrome.bookmarks.BookmarkTreeNode): ImportNode => {
    if (node.url !== undefined) {
      return { kind: 'bookmark', title: node.title, url: node.url, id: node.id };
    }
    return {
      kind: 'folder',
      title: node.title,
      id: node.id,
      children: (node.children ?? []).map(convert),
    };
  };
  return tree.map(convert);
}

/** 解析 JSON 备份（结构校验由 encrypt 模块负责，这里只转结构） */
export function parseJson(
  file: { bookmarks?: BookmarkTree; rules?: CategoryRule[]; proxyBlocklist?: string[]; bookmarkMeta?: Record<string, BookmarkMeta> },
): ParsedImport {
  const nodes = toImportNodes(file.bookmarks ?? []);
  let total = 0;
  const count = (list: ImportNode[]): void => {
    for (const node of list) {
      total += 1;
      if (node.kind === 'folder') count(node.children);
    }
  };
  count(nodes);
  return {
    nodes,
    total,
    rules: file.rules ?? [],
    proxyBlocklist: file.proxyBlocklist ?? [],
    metaByOldId: file.bookmarkMeta ?? {},
  };
}

/* ------------------------------------------------------------------ */
/* 预览                                                                */
/* ------------------------------------------------------------------ */

/** 全库归一化 URL 集合（与导入条目的重复判定用） */
function existingUrls(): Promise<Set<string>> {
  return getTree().then((tree) => {
    const urls = new Set<string>();
    for (const entry of collectBookmarks(tree)) {
      const normalized = normalizeUrl(entry.node.url);
      if (normalized) urls.add(normalized);
    }
    return urls;
  });
}

/** 统计可导入/重复/非法条数（两阶段的「先全量解析校验」） */
export async function previewImport(parsed: ParsedImport): Promise<ImportPreview> {
  const urls = await existingUrls();
  let importable = 0;
  let duplicates = 0;
  let invalid = 0;

  const visit = (list: ImportNode[]): void => {
    for (const node of list) {
      if (node.kind === 'folder') {
        visit(node.children);
        continue;
      }
      const error = validateUrl(node.url);
      if (error) {
        invalid += 1;
        continue;
      }
      const normalized = normalizeUrl(node.url);
      if (!normalized || urls.has(normalized)) {
        duplicates += 1;
        continue;
      }
      urls.add(normalized);
      importable += 1;
    }
  };
  visit(parsed.nodes);

  return {
    kind: 'json',
    importable,
    duplicates,
    invalid,
    rules: parsed.rules.length,
    metaCount: Object.keys(parsed.metaByOldId).length,
    encrypted: false,
  };
}

/* ------------------------------------------------------------------ */
/* 写入                                                                */
/* ------------------------------------------------------------------ */

/** 规则去重键 */
function ruleKey(rule: CategoryRule): string {
  return `${rule.type}::${rule.pattern.trim().toLowerCase()}::${rule.category.trim()}`;
}

/** 合并规则与代理清单（G2：追加不替换） */
function mergeRules(existing: CategoryRule[], incoming: CategoryRule[]): CategoryRule[] {
  const result = [...existing];
  const seen = new Set(existing.map(ruleKey));
  for (const rule of incoming) {
    if (!rule || typeof rule.pattern !== 'string' || !rule.pattern.trim()) continue;
    const key = ruleKey(rule);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      id: rule.id || `import-${result.length + 1}`,
      type: rule.type,
      pattern: rule.pattern,
      category: rule.category || '待分类',
      enabled: rule.enabled !== false,
      order: typeof rule.order === 'number' ? rule.order : result.length + 1,
    });
  }
  return result;
}

/**
 * 执行导入（G2）。调用前提：已生成快照并完成二次确认。
 * @returns 各计数与 meta 绑定情况
 */
export async function importBookmarks(
  parsed: ParsedImport,
  options: ImportOptions,
  kind: 'json' | 'html',
): Promise<{
  created: number;
  duplicates: number;
  invalid: number;
  rules: number;
  boundMeta: number;
  orphanMeta: number;
}> {
  return withWriteLock(async () => {
    const db: LocalDB = await readDb();
    const tree = await getTree();
    const index = buildIndex(tree);

    const urls = new Set<string>();
    for (const entry of collectBookmarks(tree)) {
      const normalized = normalizeUrl(entry.node.url);
      if (normalized) urls.add(normalized);
    }

    // 落点：指定文件夹，否则在「其他书签」下新建
    let targetId = options.targetFolderId;
    if (targetId && !index.byId.has(targetId)) targetId = undefined;
    if (!targetId) {
      const otherRoot = index.roots[1]?.id ?? index.roots[0]?.id;
      if (!otherRoot) throw new Error('errNoManagedRoot');
      const folder = await createFolder({
        parentId: otherRoot,
        title: `导入 ${formatLocalStamp()}`,
      });
      targetId = folder.id;
      await sleep(10);
    }

    let created = 0;
    let duplicates = 0;
    let invalid = 0;
    const oldIdToNewId = new Map<string, string>();

    const createInto = async (nodes: ImportNode[], parentId: string): Promise<void> => {
      for (const node of nodes) {
        if (node.kind === 'folder') {
          const folder = await createFolder({ parentId, title: node.title || '未命名' });
          if (node.id) oldIdToNewId.set(node.id, folder.id);
          await sleep(10);
          await createInto(node.children, folder.id);
          continue;
        }
        const error = validateUrl(node.url);
        if (error) {
          invalid += 1;
          continue;
        }
        const normalized = normalizeUrl(node.url);
        if (!normalized || urls.has(normalized)) {
          duplicates += 1;
          continue;
        }
        urls.add(normalized);
        const bookmark = await createBookmark({
          parentId,
          title: node.title || node.url,
          url: node.url,
        });
        if (node.id) oldIdToNewId.set(node.id, bookmark.id);
        created += 1;
        await sleep(10);
      }
    };
    await createInto(parsed.nodes, targetId);

    // 规则与代理清单：追加
    const rules = mergeRules(db.rules, parsed.rules);
    const proxyBlocklist = [
      ...new Set([...db.proxyBlocklist, ...parsed.proxyBlocklist.filter(isHttpUrl)]),
    ];

    // 标签备注：JSON 才处理；按旧 id → 新 id 直接绑定，未匹配进 orphanMeta
    const bookmarkMeta = { ...db.bookmarkMeta };
    const orphanMeta = { ...db.orphanMeta };
    let boundMeta = 0;
    let orphanCount = 0;

    if (kind === 'json' && Object.keys(parsed.metaByOldId).length > 0) {
      const latest = await getTree();
      const latestBookmarks = collectBookmarks(latest);
      const byId = new Map(latestBookmarks.map((entry) => [entry.node.id, entry.node]));

      for (const [oldId, meta] of Object.entries(parsed.metaByOldId)) {
        const newId = oldIdToNewId.get(oldId);
        if (newId && byId.has(newId) && !bookmarkMeta[newId]) {
          bookmarkMeta[newId] = meta;
          boundMeta += 1;
          continue;
        }
        // 未匹配：按归一化 URL 挂起，等下次匹配（I1）
        const sourceUrl = findUrlByOldId(parsed.nodes, oldId);
        const normalized = normalizeUrl(sourceUrl);
        if (!normalized) continue;
        const hash = await sha256Short(normalized);
        orphanMeta[hash] = meta;
        orphanCount += 1;
      }
    }

    await applyPatch({
      rules,
      proxyBlocklist,
      bookmarkMeta,
      orphanMeta,
      flags: { statsDirty: true },
    });

    return {
      created,
      duplicates,
      invalid,
      rules: rules.length - db.rules.length,
      boundMeta,
      orphanMeta: orphanCount,
    };
  });
}

/** 旧 id 对应的 URL（用于未绑定 meta 挂起） */
function findUrlByOldId(nodes: ImportNode[], oldId: string): string | undefined {
  for (const node of nodes) {
    if (node.kind === 'folder') {
      const found = findUrlByOldId(node.children, oldId);
      if (found) return found;
      continue;
    }
    if (node.id === oldId) return node.url;
  }
  return undefined;
}

/** 归一化 URL 的短 hash（orphanMeta 键） */
async function sha256Short(normalized: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 40);
}

/** 触发浏览器下载（不申请 downloads 权限，用 Blob + <a download>） */
export function downloadText(fileName: string, content: string, mime: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // 延迟回收，避免部分浏览器下载尚未开始就失效
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** 导出文件名（G1） */
export function exportFileName(ext: 'html' | 'json'): string {
  return `bookvault-${formatLocalStamp()}.${ext}`;
}

/** 便于界面展示的截断（错误反馈用） */
export function previewText(text: string, max = 200): string {
  return truncate(text, max);
}
