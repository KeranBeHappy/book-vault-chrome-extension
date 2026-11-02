import { ref } from 'vue';

import { getLanguage, setLanguage, t, translateError } from '@/modules/i18n';
import type { LanguageMode, ResolvedLanguage } from '@/shared/types';

/**
 * 语言（H2）：切换即时生效，不刷新页面。
 * `t()` 内部读取响应式 locale，因此模板里的 t('key') 会自动重渲染。
 */
export function useLocale(initial: LanguageMode = 'system') {
  const mode = ref<LanguageMode>(initial);
  const language = ref<ResolvedLanguage>(getLanguage());

  /** 应用语言模式并同步解析结果 */
  function apply(next: LanguageMode): void {
    mode.value = next;
    language.value = setLanguage(next);
  }

  return { mode, language, apply, t, translateError };
}
