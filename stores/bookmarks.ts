import { defineStore } from 'pinia';

import {
  buildIndex,
  collectBookmarks,
  collectFolders,
  getTree,
  type BookmarkEntry,
  type ManagedRoot,
  type TreeIndex,
} from '@/modules/bookmarks';
import { translateError } from '@/modules/i18n';
import type { BookmarkMeta, BookmarkNode, BookmarkTree } from '@/shared/types';

interface FolderRow {
  node: BookmarkNode;
  path: string[];
  rootId: string;
  depth: number;
}

interface BookmarksState {
  tree: BookmarkTree | null;
  entries: BookmarkEntry[];
  folders: FolderRow[];
  roots: ManagedRoot[];
  index: TreeIndex | null;
  /** 搜索用小写索引：id → 标题/URL/域名/标签/备注拼接串（A6） */
  haystacks: Record<string, string>;
  loading: boolean;
  error: string | null;
}

/** 域名（排序与搜索都用得到） */
function hostOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * 书签树的页面侧镜像。
 * 读操作由页面直接用 `chrome.bookmarks`（A1），写操作一律走 SW。
 */
export const useBookmarksStore = defineStore('bookmarks', {
  state: (): BookmarksState => ({
    tree: null,
    entries: [],
    folders: [],
    roots: [],
    index: null,
    haystacks: {},
    loading: false,
    error: null,
  }),

  getters: {
    /** 根节点 id → 标题（树顶部展示用） */
    rootTitles: (state): Record<string, string> =>
      Object.fromEntries(state.roots.map((root) => [root.id, root.title])),

    /** 文件夹 id → 展示路径 */
    folderPaths: (state): Record<string, string> => {
      const map: Record<string, string> = {};
      for (const root of state.roots) map[root.id] = root.title;
      for (const folder of state.folders) {
        map[folder.node.id] = [state.rootTitles[folder.rootId], ...folder.path, folder.node.title]
          .filter(Boolean)
          .join(' / ');
      }
      return map;
    },
  },

  actions: {
    /** 重新读取整棵树并重建索引（A9：外部变更后同步） */
    async reload(): Promise<void> {
      this.loading = true;
      try {
        const tree = await getTree();
        this.tree = tree;
        this.index = buildIndex(tree);
        this.roots = this.index.roots;
        this.entries = collectBookmarks(tree, this.index);
        this.folders = collectFolders(tree, this.index).map((folder) => ({
          ...folder,
          depth: folder.path.length,
        }));
        this.error = null;
      } catch (err) {
        this.error = translateError(err instanceof Error ? err.message : undefined);
      } finally {
        this.loading = false;
      }
    },

    /** 重建搜索索引（标题/URL/域名/标签/备注小写化，A6） */
    buildSearchIndex(meta: Record<string, BookmarkMeta>): void {
      const haystacks: Record<string, string> = {};
      for (const entry of this.entries) {
        const node = entry.node;
        const bookmarkMeta = meta[node.id];
        haystacks[node.id] = [
          node.title,
          node.url ?? '',
          hostOf(node.url),
          bookmarkMeta?.tags.join(' ') ?? '',
          bookmarkMeta?.note ?? '',
        ]
          .join('\u0001')
          .toLowerCase();
      }
      this.haystacks = haystacks;
    },
  },
});
