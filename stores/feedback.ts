import { defineStore } from 'pinia';

import { uid } from '@/shared/util';

export type ToastKind = 'info' | 'success' | 'error' | 'warn';

export interface Toast {
  id: string;
  kind: ToastKind;
  text: string;
}

/** 二次确认框的入参（4.1：必须展示操作类型、影响数量、能否由快照恢复） */
export interface ConfirmOptions {
  title: string;
  /** 主说明 */
  message: string;
  /** 逐条明细：影响数量、快照说明等 */
  details?: string[];
  /** 危险操作样式 */
  danger?: boolean;
  /** 确认按钮文案（已本地化） */
  confirmText?: string;
  /** 需要用户勾选「我已了解」才能继续（K4 遗忘密码风险） */
  requireAck?: string;
}

/** Promise 解析器放在模块作用域，避免被 Pinia 序列化 */
let resolveConfirm: ((value: boolean) => void) | null = null;

interface FeedbackState {
  toasts: Toast[];
  confirm: ConfirmOptions | null;
}

/**
 * 轻量反馈层：toast + 二次确认。
 * 二次确认返回 Promise<boolean>，让各个操作都能写成线性流程。
 */
export const useFeedbackStore = defineStore('feedback', {
  state: (): FeedbackState => ({
    toasts: [],
    confirm: null,
  }),

  actions: {
    toast(text: string, kind: ToastKind = 'info', duration = 3600): void {
      const toast: Toast = { id: uid('toast-'), kind, text };
      this.toasts = [...this.toasts, toast];
      setTimeout(() => {
        this.toasts = this.toasts.filter((item) => item.id !== toast.id);
      }, duration);
    },

    error(text: string): void {
      this.toast(text, 'error', 6000);
    },

    success(text: string): void {
      this.toast(text, 'success');
    },

    /** 弹出二次确认；用户关闭视为取消 */
    ask(options: ConfirmOptions): Promise<boolean> {
      // 前一个确认框未关闭时，先按取消处理，避免 Promise 悬挂
      resolveConfirm?.(false);
      this.confirm = options;
      return new Promise<boolean>((resolve) => {
        resolveConfirm = resolve;
      });
    },

    answer(ok: boolean): void {
      this.confirm = null;
      const resolve = resolveConfirm;
      resolveConfirm = null;
      resolve?.(ok);
    },
  },
});
