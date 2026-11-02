import { defineStore } from 'pinia';

import { useDbStore } from '@/stores/db';
import type { LinkState, ManagerView, UiState } from '@/shared/types';

interface UiStoreState {
  activeView: ManagerView;
  selectedFolderId: string | null;
  keyword: string;
  statusFilter: LinkState | '';
  tagFilter: string[];
  sortKey: UiState['sort']['key'];
  sortDir: UiState['sort']['dir'];
  /** 当前勾选的书签 id */
  selection: string[];
  /** 详情面板显示的书签 id */
  detailId: string | null;
  expandedFolderIds: string[];
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 界面状态：只影响展示，丢了不影响正确性，因此不强制走 SW 即时写。
 * 持久化时写入 LocalDB.uiState（防抖合并，不做逐键写）。
 */
export const useUiStore = defineStore('ui', {
  state: (): UiStoreState => ({
    activeView: 'manager',
    selectedFolderId: null,
    keyword: '',
    statusFilter: '',
    tagFilter: [],
    sortKey: 'title',
    sortDir: 'asc',
    selection: [],
    detailId: null,
    expandedFolderIds: [],
  }),

  getters: {
    selectedSet: (state): Set<string> => new Set(state.selection),
    hasSelection: (state): boolean => state.selection.length > 0,
  },

  actions: {
    /** 从 LocalDB.uiState 恢复界面偏好 */
    hydrate(uiState: UiState): void {
      this.activeView = uiState.activeView ?? 'manager';
      this.selectedFolderId = uiState.selectedFolderId ?? null;
      this.keyword = uiState.filter?.keyword ?? '';
      this.statusFilter = uiState.filter?.status ?? '';
      this.tagFilter = uiState.filter?.tags ?? [];
      this.sortKey = uiState.sort?.key ?? 'title';
      this.sortDir = uiState.sort?.dir ?? 'asc';
      this.expandedFolderIds = uiState.expandedFolderIds ?? [];
    },

    setView(view: ManagerView): void {
      this.activeView = view;
      this.persist();
    },

    selectFolder(folderId: string | null): void {
      this.selectedFolderId = folderId;
      this.persist();
    },

    toggleFolder(folderId: string): void {
      const set = new Set(this.expandedFolderIds);
      if (set.has(folderId)) set.delete(folderId);
      else set.add(folderId);
      this.expandedFolderIds = [...set];
      this.persist();
    },

    setKeyword(keyword: string): void {
      this.keyword = keyword;
      this.persist();
    },

    setStatus(status: LinkState | ''): void {
      this.statusFilter = status;
      this.persist();
    },

    setTagFilter(tags: string[]): void {
      this.tagFilter = tags;
      this.persist();
    },

    setSort(key: UiState['sort']['key'], dir: UiState['sort']['dir']): void {
      this.sortKey = key;
      this.sortDir = dir;
      this.persist();
    },

    toggleSelection(id: string): void {
      const set = new Set(this.selection);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      this.selection = [...set];
    },

    setSelection(ids: string[]): void {
      this.selection = [...new Set(ids)];
    },

    clearSelection(): void {
      this.selection = [];
    },

    openDetail(id: string | null): void {
      this.detailId = id;
    },

    /** 防抖 300ms 后合并写入 LocalDB.uiState */
    persist(): void {
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        const dbStore = useDbStore();
        const next: UiState = {
          activeView: this.activeView,
          filter: {
            ...(this.statusFilter ? { status: this.statusFilter } : {}),
            ...(this.tagFilter.length > 0 ? { tags: [...this.tagFilter] } : {}),
            ...(this.keyword ? { keyword: this.keyword } : {}),
          },
          sort: { key: this.sortKey, dir: this.sortDir },
          expandedFolderIds: this.expandedFolderIds,
          ...(this.selectedFolderId ? { selectedFolderId: this.selectedFolderId } : {}),
        };
        void dbStore.patch({ uiState: next }).catch(() => undefined);
      }, 300);
    },
  },
});
