import { createApp } from 'vue';
import { createPinia } from 'pinia';

import '@/styles/global.css';
import { initI18n } from '@/modules/i18n';
import App from './App.vue';

/**
 * 收藏小窗入口（2.1）。
 * 为什么不复用 popup：contextMenus.onClicked 在 SW 里无法直接渲染 UI，
 * 只能 `chrome.windows.create({ type: 'popup' })` 打开一个独立小窗。
 */
async function bootstrap(): Promise<void> {
  await initI18n();
  createApp(App).use(createPinia()).mount('#app');
}

void bootstrap();
