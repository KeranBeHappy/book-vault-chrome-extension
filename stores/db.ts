import { defineStore } from 'pinia';

import { translateError } from '@/modules/i18n';
import { sendToBackground, type DeepPartial } from '@/shared/messages';
import type { BookmarkMeta, LocalDB, Settings } from '@/shared/types';

interface DbState {
  db: LocalDB | null;
  loading: boolean;
  error: string | null;
}

/**
 * LocalDB 的页面侧只读镜像。
 *
 * 约束（4.6）：页面不直接写 storage，所有写操作都发 `db:patch` 给 SW，
 * 由 SW 串行化落盘；页面靠 `chrome.storage.onChanged` 刷新（见 useStorageSync）。
 */
export const useDbStore = defineStore('db', {
  state: (): DbState => ({
    db: null,
    loading: false,
    error: null,
  }),

  getters: {
    settings: (state): Settings | null => state.db?.settings ?? null,
    ready: (state): boolean => state.db !== null,
    linkStatus: (state) => state.db?.linkStatus ?? {},
    bookmarkMeta: (state) => state.db?.bookmarkMeta ?? {},
    orphanMeta: (state) => state.db?.orphanMeta ?? {},
    recycleBin: (state) => state.db?.recycleBin ?? [],
    snapshots: (state) => state.db?.localSnapshots ?? [],
    opLog: (state) => state.db?.opLog ?? [],
    jobs: (state) => state.db?.jobs ?? {},
    runtime: (state) => state.db?.runtime ?? {},
    flags: (state) => state.db?.flags ?? {},
    proxyBlocklist: (state) => state.db?.proxyBlocklist ?? [],
    vault: (state) => state.db?.secretVault,
  },

  actions: {
    /** 从 SW 读取全量 LocalDB */
    async load(): Promise<void> {
      this.loading = true;
      try {
        this.db = await sendToBackground({ type: 'db:get' });
        this.error = null;
      } catch (err) {
        this.error = translateError(err instanceof Error ? err.message : undefined);
      } finally {
        this.loading = false;
      }
    },

    /** 走 SW 的 patch 合并，禁止整体覆盖（4.6） */
    async patch(patch: DeepPartial<LocalDB>): Promise<void> {
      this.db = await sendToBackground({ type: 'db:patch', patch });
    },

    /** 设置只写变更字段 */
    async saveSettings(patch: DeepPartial<Settings>): Promise<void> {
      this.db = await sendToBackground({ type: 'settings:patch', patch });
    },

    /** 写入单条标签备注 */
    async saveMeta(bookmarkId: string, meta: BookmarkMeta): Promise<void> {
      await this.patch({ bookmarkMeta: { [bookmarkId]: meta } });
    },
  },
});
