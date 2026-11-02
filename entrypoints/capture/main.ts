import { createApp } from 'vue';
import { createPinia } from 'pinia';

import '@/styles/global.css';
import { initTheme } from '@/composables/useTheme';
import { initI18n, t } from '@/modules/i18n';
import App from './App.vue';

/**
 * 收藏小窗入口（2.1）。
 * 为什么不复用 popup：contextMenus.onClicked 在 SW 里无法直接渲染 UI，
 * 只能 `chrome.windows.create({ type: 'popup' })` 打开一个独立小窗。
 *
 * 主题：挂载前先按系统偏好落一次 `data-theme` 防闪白，
 * 具体设置值由 App.vue 读到 `settings.theme` 后再校正（H1）。
 */
async function bootstrap(): Promise<void> {
  await initI18n();
  // 窗口标题走语言包（4.5）：html 里的静态标题不会随语言切换
  document.title = t('captureTitle');
  initTheme();
  createApp(App).use(createPinia()).mount('#app');
}

void bootstrap();
