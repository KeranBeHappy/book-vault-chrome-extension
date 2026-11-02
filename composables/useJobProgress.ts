import { onUnmounted, ref, watch, type Ref } from 'vue';

import { sendToBackground } from '@/shared/messages';
import type { JobProgress, JobStatus } from '@/shared/types';

/** 终态：不再轮询 */
const TERMINAL: JobStatus[] = ['completed', 'failed', 'canceled'];

/**
 * 任务进度（4.4 / 2.3）。
 *
 * 轮询而不是长连接：SW 会被回收，消息通道随时断，只有 storage 里的 jobs 是真相。
 * 页面每 1 秒读一次进度；任务进入终态后自动停表。
 */
export function useJobProgress(jobId: Ref<string | null>, intervalMs = 1000) {
  const progress = ref<JobProgress | null>(null);
  const error = ref<string | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;

  function stop(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
  }

  async function tick(): Promise<void> {
    const id = jobId.value;
    if (!id) return;
    try {
      const next = await sendToBackground({ type: 'job:progress', jobId: id });
      progress.value = next;
      if (TERMINAL.includes(next.status)) stop();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      stop();
    }
  }

  function start(): void {
    stop();
    if (!jobId.value) return;
    void tick();
    timer = setInterval(() => void tick(), intervalMs);
  }

  watch(jobId, () => start(), { immediate: true });
  onUnmounted(stop);

  return { progress, error, start, stop };
}
