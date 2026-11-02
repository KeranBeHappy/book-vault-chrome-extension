import { createApp } from 'vue';
import { createPinia } from 'pinia';

import '@/styles/global.css';
import { initTheme } from '@/composables/useTheme';
import { initI18n, t } from '@/modules/i18n';
import App from './App.vue';

/**
 * 挂载顺序不能改：先加载语言包再挂载，否则首帧会出现 ⟦key⟧。
 *
 * 主题：先按系统偏好落一次 `data-theme` 防闪白，
 * 具体设置值由 App.vue 读到 `settings.theme` 后再校正（H1）。
 * 窗口标题同样走语言包（4.5）。
 */
async function bootstrap(): Promise<void> {
  await initI18n();
  document.title = t('popupTitle');
  initTheme();
  createApp(App).use(createPinia()).mount('#app');
}

void bootstrap();
