/**
 * 任务引擎：状态机、alarm 心跳续跑、断点续跑、写操作互斥锁出口。
 *
 * 文档出处：2.3（长任务执行模型）、4.4、4.6、8.1、9 节第 1 条。
 *
 * 关键约束：
 * - SW 非常驻，禁止在顶层持有可变状态；任务进度全部落 `jobs`。
 * - 单次唤醒 ≤ 4 分钟或 200 条（先到者为准），随后让出，靠 1 分钟心跳续跑。
 * - 同一时刻同一 kind 只允许一个 running 任务，重复触发复用现有任务。
 * - 每条处理前用 `chrome.bookmarks.get(id)` 校验存在，不存在记 `removed` 跳过。
 */

import { getNode, isHttpUrl } from '@/modules/bookmarks';
import { checkLink, fetchSiteName } from '@/modules/scanner';
import {
  ALARMS,
  JOB_BUDGET,
  JOB_TARGET_INLINE_LIMIT,
  STATUS_FLUSH,
  STORAGE_KEYS,
} from '@/shared/constants';
import { withWriteLock } from '@/shared/lock';
import { uid } from '@/shared/util';
import { applyPatch, readDb, removeItems, setItems } from '@/modules/storage';
import type { JobKind, JobProgress, JobState, LinkStatus } from '@/shared/types';

/** 导出锁，供其它模块统一使用（4.6 全部写操作串行化） */
export { withWriteLock } from '@/shared/lock';

/** 正在执行的取消控制器；SW 回收后自然丢失，任务状态以 storage 为准 */
const aborters = new Map<string, AbortController>();

/** 防止同一 SW 生命周期内并发跑多个切片 */
let sliceRunning = false;

/** 任务 id 列表分片键 */
function targetKey(jobId: string): string {
  return `${STORAGE_KEYS.jobIdsPrefix}${jobId}`;
}

/** 任务结果分片键（标题刷新抓到的新标题） */
export function resultKey(jobId: string): string {
  return `${STORAGE_KEYS.jobResultPrefix}${jobId}`;
}

/** 任务状态 → 页面用的进度对象 */
export function toProgress(job: JobState): JobProgress {
  return {
    jobId: job.id,
    kind: job.kind,
    status: job.status,
    done: job.done,
    total: job.total,
    failed: job.failed,
  };
}

/** 读取任务的目标 id 列表（内联或分片） */
async function loadTargets(job: JobState): Promise<string[]> {
  if (job.targetIds.length > 0) return job.targetIds;
  if (!job.targetRef) return [];
  const stored = await chrome.storage.local.get(job.targetRef);
  const list = stored[job.targetRef] as string[] | undefined;
  return Array.isArray(list) ? list : [];
}

/**
 * 启动任务。同 kind 已有 running/queued 任务时直接复用（4.4）。
 */
export async function startJob(kind: JobKind, ids: string[]): Promise<JobProgress> {
  const progress = await withWriteLock(async () => {
    const db = await readDb();
    const existing = Object.values(db.jobs).find(
      (job) => job.kind === kind && (job.status === 'running' || job.status === 'queued'),
    );
    if (existing) return toProgress(existing);

    const id = uid('job-');
    const now = Date.now();
    const job: JobState = {
      id,
      kind,
      status: 'running',
      targetIds: ids.length > JOB_TARGET_INLINE_LIMIT ? [] : ids,
      cursor: 0,
      total: ids.length,
      done: 0,
      failed: 0,
      startedAt: now,
      updatedAt: now,
    };
    if (ids.length > JOB_TARGET_INLINE_LIMIT) {
      job.targetRef = targetKey(id);
      await setItems({ [job.targetRef]: ids });
    }
    db.jobs[id] = job;
    await applyPatch({ jobs: { [id]: job } });
    await ensureJobAlarm();
    return toProgress(job);
  });

  // 锁外立刻跑第一批（2.3）：否则小任务要空等 1 分钟心跳才开始。
  // 不 await：任务可能超出单次唤醒预算，立即返回进度让页面先渲染。
  void runSlices();
  return progress;
}

/** 取消任务：状态置 canceled，保留已完成结果（4.4） */
export async function cancelJob(jobId: string): Promise<JobProgress> {
  const aborter = aborters.get(jobId);
  aborter?.abort();
  aborters.delete(jobId);

  const db = await withWriteLock(async () => {
    const current = (await readDb()).jobs[jobId];
    if (!current) throw new Error('errJobNotFound');
    const next: JobState = { ...current, status: 'canceled', updatedAt: Date.now() };
    const patched = await applyPatch({ jobs: { [jobId]: next } });
    return patched;
  });

  const running = Object.values(db.jobs).some((job) => job.status === 'running');
  if (!running) await chrome.alarms.clear(ALARMS.jobTick);
  const job = db.jobs[jobId];
  if (!job) throw new Error('errJobNotFound');
  return toProgress(job);
}

/** 查询进度 */
export async function getProgress(jobId: string): Promise<JobProgress> {
  const db = await readDb();
  const job = db.jobs[jobId];
  if (!job) throw new Error('errJobNotFound');
  return toProgress(job);
}

/** 读取任务结果（标题刷新：id → 抓到的标题） */
export async function getResults(jobId: string): Promise<Record<string, string>> {
  const key = resultKey(jobId);
  const raw = await chrome.storage.local.get(key);
  const value = raw[key];
  return (value as Record<string, string> | undefined) ?? {};
}

/** 保证心跳闹钟存在（周期 1 分钟） */
export async function ensureJobAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(ALARMS.jobTick);
  if (!existing) {
    await chrome.alarms.create(ALARMS.jobTick, { periodInMinutes: 1 });
  }
}

/**
 * 执行一个切片：处理所有 running 任务直到预算耗尽。
 * 由 alarm / onStartup / 任意唤醒事件触发，可安全重复调用。
 */
export async function runSlices(): Promise<void> {
  if (sliceRunning) return;
  sliceRunning = true;
  try {
    const db = await readDb();
    if (db.flags.importInProgress) {
      // A9：原生导入期间暂停任务引擎
      console.info('[jobs] 原生导入进行中，暂停任务引擎');
      return;
    }
    const running = Object.values(db.jobs).filter((job) => job.status === 'running');
    if (running.length === 0) {
      await chrome.alarms.clear(ALARMS.jobTick);
      return;
    }
    const startedAt = Date.now();
    for (const job of running) {
      const finished = await runJobSlice(job, startedAt);
      if (!finished) {
        await ensureJobAlarm();
        return;
      }
    }
    // 全部完成 → 清心跳
    const latest = await readDb();
    if (!Object.values(latest.jobs).some((job) => job.status === 'running')) {
      await chrome.alarms.clear(ALARMS.jobTick);
    }
  } catch (err) {
    console.error('[jobs] 切片执行失败', err);
    await ensureJobAlarm();
  } finally {
    sliceRunning = false;
  }
}

/**
 * 跑单个任务的一个切片。
 * @returns true 表示任务已收尾（完成/失败/取消），false 表示预算耗尽需续跑
 */
async function runJobSlice(job: JobState, startedAt: number): Promise<boolean> {
  const targets = await loadTargets(job);
  const snapshot = await readDb();
  const settings = snapshot.settings;
  const aborter = new AbortController();
  aborters.set(job.id, aborter);

  const statusDelta: Record<string, LinkStatus> = {};
  const results = job.kind === 'titleRefresh' ? await getResults(job.id) : {};
  let cursor = job.cursor;
  let done = job.done;
  let failed = job.failed;
  let processedSinceFlush = 0;
  let lastFlushAt = Date.now();
  let finished = false;
  let failure: string | undefined;

  const flush = async (force: boolean): Promise<void> => {
    const elapsed = Date.now() - lastFlushAt;
    if (!force && processedSinceFlush < STATUS_FLUSH.everyItems && elapsed < STATUS_FLUSH.everyMs) {
      return;
    }
    if (processedSinceFlush === 0 && !force) return;
    await withWriteLock(async () => {
      const patch: Record<string, unknown> = {
        jobs: {
          [job.id]: {
            cursor,
            done,
            failed,
            updatedAt: Date.now(),
            ...(failure ? { lastError: failure } : {}),
          },
        },
      };
      if (Object.keys(statusDelta).length > 0) patch.linkStatus = { ...statusDelta };
      await applyPatch(patch);
    });
    if (job.kind === 'titleRefresh') {
      await setItems({ [resultKey(job.id)]: results });
    }
    processedSinceFlush = 0;
    lastFlushAt = Date.now();
  };

  try {
    while (cursor < targets.length) {
      if (aborted(job.id)) return true;
      if (Date.now() - startedAt > JOB_BUDGET.maxDurationMs) break;
      if (cursor >= JOB_BUDGET.maxItems + job.cursor) break;

      const batchSize = Math.max(1, settings.concurrency);
      const batch = targets.slice(cursor, cursor + batchSize);
      await Promise.all(
        batch.map(async (id) => {
          const result = await processOne(
            id,
            job.kind,
            settings.timeoutSec,
            statusDelta,
            results,
            snapshot.linkStatus,
            snapshot.proxyBlocklist,
          );
          if (result.ok) done += 1;
          else failed += 1;
        }),
      );
      cursor += batch.length;
      processedSinceFlush += batch.length;
      await flush(false);
    }

    finished = cursor >= targets.length;
  } catch (err) {
    console.error('[jobs] 任务执行异常', job.id, err);
    failure = err instanceof Error ? err.message : String(err);
    finished = false;
  } finally {
    aborters.delete(job.id);
  }

  // 收尾写状态：取消优先，其次完成/失败，否则保持 running 等心跳续跑
  const db = await withWriteLock(async () => {
    const current = (await readDb()).jobs[job.id];
    const canceled = current?.status === 'canceled' || aborted(job.id);
    const next: JobState = {
      ...(current ?? job),
      cursor,
      done,
      failed,
      updatedAt: Date.now(),
      status: canceled
        ? 'canceled'
        : finished
          ? failure
            ? 'failed'
            : 'completed'
          : 'running',
      ...(failure ? { lastError: failure } : {}),
    };
    const patch: Record<string, unknown> = { jobs: { [job.id]: next } };
    if (Object.keys(statusDelta).length > 0) patch.linkStatus = { ...statusDelta };
    return applyPatch(patch);
  });

  if (job.kind === 'titleRefresh') {
    await setItems({ [resultKey(job.id)]: results });
  }

  if (!finished && !failure) {
    // 预算耗尽：保持 running，靠心跳续跑；同时保留目标分片
    void db;
    return false;
  }

  // 任务结束后清理 id 分片（结果分片保留，供页面读取回填）
  if (job.targetRef) await removeItems([job.targetRef]);
  return true;
}

/** 任务是否已请求取消 */
function aborted(jobId: string): boolean {
  const aborter = aborters.get(jobId);
  return aborter?.signal.aborted ?? false;
}

/**
 * 处理单条书签。
 * 幂等：书签已被删除时记 failed 并跳过（2.3 第 5 条）。
 * 返回值 `ok` 表示「本条检测/抓取成功」，dead / suspect 都算检测成功。
 */
async function processOne(
  id: string,
  kind: JobKind,
  timeoutSec: number,
  statusDelta: Record<string, LinkStatus>,
  results: Record<string, string>,
  existing: Record<string, LinkStatus>,
  proxyBlocklist: string[],
): Promise<{ ok: boolean }> {
  const node = await getNode(id);
  if (!node) {
    statusDelta[id] = {
      ...(existing[id] ?? { titleRefresh: 'failed' as const }),
      status: 'untested',
      error: 'removed',
      checkedAt: Date.now(),
    };
    return { ok: false };
  }

  const previousTitleRefresh = existing[id]?.titleRefresh ?? 'unchanged';

  if (kind === 'linkCheck') {
    if (!node.url) return { ok: false };
    const host = hostOf(node.url);
    const proxySuspect = proxyBlocklist.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    );
    const result = await checkLink(node.url, timeoutSec, { proxySuspect });
    statusDelta[id] = {
      status: result.status,
      httpStatus: result.httpStatus,
      checkedAt: Date.now(),
      error: result.error,
      proxySuspect: result.proxySuspect,
      titleRefresh: previousTitleRefresh,
    };
    return { ok: true };
  }

  // titleRefresh：只抓取，不写书签（回填需用户二次确认，B2）
  if (!node.url || !isHttpUrl(node.url)) return { ok: false };
  const title = await fetchSiteName(node.url, timeoutSec);
  if (!title) {
    statusDelta[id] = {
      ...(existing[id] ?? { status: 'untested' as const }),
      titleRefresh: 'failed',
    };
    return { ok: false };
  }
  results[id] = title;
  statusDelta[id] = {
    ...(existing[id] ?? { status: 'untested' as const }),
    titleRefresh: title === node.title ? 'unchanged' : 'updated',
  };
  return { ok: true };
}

/** 取 host（仅用于代理清单匹配） */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}
