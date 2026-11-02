/**
 * 全局写操作串行化锁（文档 4.6）。
 *
 * 为什么放在 shared：`chrome.bookmarks` 与 `storage.local` 的写必须全局串行，
 * 而 modules/ 之间禁止跨模块 import 内部文件，锁又是 storage 与 jobs 都要用的
 * 公共原语，放在 shared 可避免 storage ↔ jobs 的循环依赖。
 *
 * 注意：SW 可能被回收，队列中的未执行任务会丢失；这是可接受的——每次写都是
 * 独立事务，页面侧收到失败后重试即可。
 */

/** Promise 链尾：新任务排在它之后执行 */
let chain: Promise<unknown> = Promise.resolve();

/**
 * 在全局写锁内执行任务。
 * 前一个任务失败不会阻断后续任务（用 catch 把链拉平）。
 */
export function withWriteLock<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  // 吞掉异常只为保持链条存活，异常仍会由 run 抛给调用方
  chain = run.catch(() => undefined);
  return run;
}
