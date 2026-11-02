import { createApp } from 'vue';
import { createPinia } from 'pinia';

import '@/styles/global.css';
import { initI18n } from '@/modules/i18n';
import App from './App.vue';

/**
 * 挂载顺序不能改：先加载语言包再挂载，否则首帧会出现 ⟦key⟧。
 * 主题跟随设置（H1），实现时在这里读取 settings.theme 并写 data-theme。
 */
async function bootstrap(): Promise<void> {
  await initI18n();
  createApp(App).use(createPinia()).mount('#app');
}

void bootstrap();
