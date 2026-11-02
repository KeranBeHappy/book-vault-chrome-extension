import { initI18n } from '@/modules/i18n';
import { STORAGE_KEYS } from '@/shared/constants';
import type { LanguageMode, Settings, ThemeMode } from '@/shared/types';

import { initTheme } from './useTheme';

export interface BootResult {
  theme: ThemeMode;
  language: LanguageMode;
}

/**
 * 三个入口（manager / popup / capture）共用的启动逻辑。
 *
 * 为什么在挂载前读一次 settings：语言与主题都要在首帧前定好，
 * 否则会出现「先中文后英文」「先白后黑」的闪烁（H1 / H2）。
 */
export async function bootApp(): Promise<BootResult> {
  let settings: Partial<Settings> | undefined;
  try {
    const raw = await chrome.storage.local.get(STORAGE_KEYS.settings);
    settings = raw[STORAGE_KEYS.settings] as Partial<Settings> | undefined;
  } catch (err) {
    console.warn('[boot] 读取设置失败，使用默认主题与语言', err);
  }

  const theme = settings?.theme ?? 'system';
  const language = settings?.language ?? 'system';
  initTheme(theme);
  initI18n(language);
  return { theme, language };
}
