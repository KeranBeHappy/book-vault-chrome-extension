import { onUnmounted } from 'vue';

import { DB_WATCH_KEYS } from '@/modules/storage';
import { useDbStore } from '@/stores/db';

/** 页面监听 storage 变更时需要匹配的键集合（含分片 Map 的索引键） */
const WATCH = new Set([...DB_WATCH_KEYS, ...DB_WATCH_KEYS.map((key) => `${key}:meta`)]);

/**
 * 跨页面状态同步（4.6）。
 *
 * 所有页面监听 `storage.onChanged`，只处理自己关心的键；收到变更后整份重读
 * （不做 diff 合并，避免半新半旧）。分片写入会产生 `<name>:meta` 变更，一并处理。
 */
export function useStorageSync(): void {
  const dbStore = useDbStore();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ): void => {
    if (area !== 'local') return;
    const relevant = Object.keys(changes).some((key) => WATCH.has(key));
    if (!relevant) return;
    // 合并短时间内的多次变更，避免批次写入时反复重读
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void dbStore.load();
    }, 120);
  };

  chrome.storage.onChanged.addListener(listener);
  onUnmounted(() => {
    if (timer) clearTimeout(timer);
    chrome.storage.onChanged.removeListener(listener);
  });
}
