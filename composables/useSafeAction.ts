import { translateError } from '@/modules/i18n';
import { sendToBackground } from '@/shared/messages';
import type { SnapshotSource } from '@/shared/types';
import { useFeedbackStore } from '@/stores/feedback';

/** 不可逆操作的统一入参（4.1 固定序列） */
export interface SafeActionOptions<T> {
  /** 操作类型名（确认框标题） */
  title: string;
  /** 主说明 */
  message: string;
  /** 影响数量等明细；可由 prepare 动态补齐 */
  details?: string[];
  confirmText?: string;
  danger?: boolean;
  requireAck?: string;
  /** 快照来源，默认 preOperation */
  source?: SnapshotSource;
  /** 执行前的快照备注 */
  note?: string;
  /** 计算影响数量等（在生成快照之前调用） */
  prepare?: () => Promise<{ details?: string[]; extra?: string[] }>;
  /** 真正执行；会拿到本次快照 id */
  execute: (snapshotId: string) => Promise<T>;
  /** 成功提示 */
  successText?: string;
}

/**
 * 不可逆操作保护（4.1）：计算影响数量 → 生成本地快照 → 二次确认 → 执行。
 *
 * - 快照生成失败时**禁止继续**，直接报错中止；
 * - 用户取消后删除本次快照，不留无效快照；
 * - 执行失败时保留快照，便于用户回到操作前状态。
 */
export function useSafeAction() {
  const feedback = useFeedbackStore();

  async function run<T>(options: SafeActionOptions<T>): Promise<T | null> {
    let extraDetails: string[] = [];
    if (options.prepare) {
      try {
        const prepared = await options.prepare();
        extraDetails = [...(prepared.details ?? []), ...(prepared.extra ?? [])];
      } catch (err) {
        feedback.error(translateError(err instanceof Error ? err.message : undefined));
        return null;
      }
    }

    // 1. 生成快照：失败即中止
    let snapshotId: string;
    try {
      const meta = await sendToBackground({
        type: 'snapshot:create',
        source: options.source ?? 'preOperation',
        note: options.note ?? options.title,
      });
      snapshotId = meta.id;
    } catch (err) {
      feedback.error(translateError(err instanceof Error ? err.message : undefined));
      return null;
    }

    // 2. 二次确认（取消则删掉刚生成的快照）
    const ok = await feedback.ask({
      title: options.title,
      message: options.message,
      details: [...(options.details ?? []), ...extraDetails],
      danger: options.danger,
      confirmText: options.confirmText,
      requireAck: options.requireAck,
    });
    if (!ok) {
      await sendToBackground({ type: 'snapshot:delete', id: snapshotId }).catch(() => undefined);
      return null;
    }

    // 3. 执行
    try {
      const result = await options.execute(snapshotId);
      if (options.successText) feedback.success(options.successText);
      return result;
    } catch (err) {
      feedback.error(translateError(err instanceof Error ? err.message : undefined));
      return null;
    }
  }

  return { run };
}
