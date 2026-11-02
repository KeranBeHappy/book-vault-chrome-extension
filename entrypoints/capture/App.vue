<script setup lang="ts">
import { t } from '@/modules/i18n';

// TODO(5.J1/J2)：收藏当前窗口标签
// 1. 解析 URL query（源页面标题/URL），chrome.tabs.query({ currentWindow: true }) 取全部标签
// 2. 过滤不可收藏协议（chrome:// file: about: 等），统计排除数量
// 3. 文件夹选择器 + 统一备注 + 重复 URL 跳过
// 4. 执行前生成快照并二次确认
</script>

<template>
  <main class="bv-capture">
    <h1 class="bv-capture__title">{{ t('captureTitle') }}</h1>
    <p class="bv-capture__hint">{{ t('placeholder') }}</p>
  </main>
</template>

<style scoped>
.bv-capture {
  padding: var(--bv-space-4);
  background: var(--bv-bg);
  color: var(--bv-text);
  font: var(--bv-font-body);
}

.bv-capture__title {
  margin-bottom: var(--bv-space-3);
  font-size: 14px;
  font-weight: 600;
}

.bv-capture__hint {
  color: var(--bv-text-secondary);
  font-size: 12px;
}
</style>
