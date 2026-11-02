/**
 * 运行时文案解析。
 *
 * 为什么不用 `chrome.i18n.getMessage`：它只跟随浏览器 UI 语言，无法在设置里
 * 即时切换（文档 H2 要求切换立即生效）。因此这里直接使用构建期打包进产物的
 * `messages.generated.ts`（由 scripts/i18n-check.mjs 从 `public/_locales/` 生成），
 * 文件格式与 chrome.i18n 完全兼容。
 *
 * 回退链：目标语言 → 简体中文 → 开发模式显示 ⟦key⟧（生产模式返回 key 本身）。
 * 生产环境不出现 key 原文外露由 `pnpm i18n:check` 在构建前兜住。
 */

import { ref } from 'vue';

import type { LanguageMode, ResolvedLanguage } from '@/shared/types';
import { MESSAGES } from './messages.generated';

/** 当前生效语言；用 ref 让模板里的 t() 调用具备响应式依赖 */
const locale = ref<ResolvedLanguage>('zh_CN');

/**
 * 把「跟随系统 / 简中 / English」解析成实际语言。
 * 跟随系统时取浏览器 UI 语言，含 zh 一律按简体中文处理。
 */
export function resolveLanguage(mode: LanguageMode): ResolvedLanguage {
  if (mode !== 'system') return mode;
  const ui = (chrome.i18n.getUILanguage?.() || navigator.language || '').toLowerCase();
  return ui.startsWith('zh') ? 'zh_CN' : 'en';
}

/** 初始化（挂载前调用；无需异步，语言包已在包内） */
export function initI18n(mode: LanguageMode = 'system'): ResolvedLanguage {
  locale.value = resolveLanguage(mode);
  return locale.value;
}

/** 切换语言；立即生效，无需刷新页面（H2） */
export function setLanguage(mode: LanguageMode): ResolvedLanguage {
  locale.value = resolveLanguage(mode);
  return locale.value;
}

/** 当前生效语言 */
export function getLanguage(): ResolvedLanguage {
  return locale.value;
}

/** 语言响应式引用（模板里需要显式依赖时用） */
export function languageRef(): typeof locale {
  return locale;
}

/** 某个 key 是否存在（用于把 SW 返回的 error 当 key 翻译） */
export function hasMessage(key: string): boolean {
  return Boolean(MESSAGES[locale.value]?.[key] ?? MESSAGES.zh_CN[key]);
}

/**
 * 取文案。支持 chrome.i18n 风格的 `$1`/`$2` 占位符。
 * 读取 `locale.value` 以建立响应式依赖，因此切换语言会触发重渲染。
 */
export function t(key: string, params?: Record<string, string | number>): string {
  const lang = locale.value;
  const entry = MESSAGES[lang]?.[key] ?? MESSAGES.zh_CN[key];

  if (!entry || !entry.message) {
    if (import.meta.env.DEV) console.error(`[i18n] 缺失文案: ${key}`);
    return import.meta.env.DEV ? `⟦${key}⟧` : key;
  }

  if (!params) return entry.message;
  return entry.message.replace(/\$(\d+)/g, (_match, index: string) => String(params[index] ?? ''));
}

/**
 * 把后台抛出的错误转成可读文案。
 * SW 抛 i18n key（如 `errUrlScheme`），未知内容回退到通用错误 + 原始信息。
 */
export function translateError(message: string | undefined): string {
  if (!message) return t('errUnknown');
  if (hasMessage(message)) return t(message);
  return `${t('errUnknown')}（${message}）`;
}
