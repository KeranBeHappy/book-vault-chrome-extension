import { computed, onUnmounted, ref, watch, type MaybeRefOrGetter, toValue } from 'vue';

import type { ResolvedTheme, ThemeMode } from '@/shared/types';

/** 系统是否深色（模块级单例，避免多个入口重复监听） */
const systemDark = ref(false);
let listening = false;

/** 开始监听系统配色变化（只启动一次） */
function ensureSystemListener(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  systemDark.value = media.matches;
  media.addEventListener('change', (event) => {
    systemDark.value = event.matches;
  });
}

/** 把主题模式解析成实际生效的 light / dark */
export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'light' || mode === 'dark') return mode;
  return systemDark.value ? 'dark' : 'light';
}

/** 写 `<html data-theme>`；首帧前调用可避免闪白（H1） */
export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
}

/**
 * 主题：跟随系统 / 浅色 / 深色（H1）。
 *
 * 用 `<html data-theme>` + CSS 变量切换，不改内联样式，首帧由 CSS 决定。
 * @param mode 响应式的主题模式（通常来自 settings.theme）
 */
export function useTheme(mode: MaybeRefOrGetter<ThemeMode>) {
  ensureSystemListener();

  const resolved = computed<ResolvedTheme>(() => resolveTheme(toValue(mode)));

  watch(resolved, (theme) => applyTheme(theme), { immediate: true });
  onUnmounted(() => {
    // 主题是全局的，离开页面不还原，避免闪烁
  });

  return { resolved };
}

/** 启动时按已存设置应用一次主题（main.ts 挂载前调用） */
export function initTheme(mode: ThemeMode = 'system'): ResolvedTheme {
  ensureSystemListener();
  const theme = resolveTheme(mode);
  applyTheme(theme);
  return theme;
}
