import { createApp } from 'vue';
import { createPinia } from 'pinia';

import '@/styles/global.css';
import { initI18n } from '@/modules/i18n';
import App from './App.vue';

/**
 * 管理页入口。挂载前先初始化语言与主题，避免首帧闪烁。
 * 视图切换用 `UiState.activeView`（不做路由），因此不需要 vue-router。
 */
async function bootstrap(): Promise<void> {
  await initI18n();
  createApp(App).use(createPinia()).mount('#app');
}

void bootstrap();
