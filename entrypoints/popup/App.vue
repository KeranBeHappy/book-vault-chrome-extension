<script setup lang="ts">
import { t } from '@/modules/i18n';

// TODO(2.1 Popup)：
// 1. 快捷动作：打开管理页 / 立即备份 / 检测死链 / 开始分类 / 收藏当前窗口标签
// 2. 备份状态提示：读 LocalDB.runtime（lastCloudBackupAt / pendingCloudBackup / lastBackupError）
// 3. 所有入口复现管理页对应功能，不另起独立实现（第 7 节）
</script>

<template>
  <main class="bv-popup">
    <header class="bv-popup__head">
      <h1 class="bv-popup__title">{{ t('popupTitle') }}</h1>
    </header>

    <p class="bv-popup__hint">{{ t('placeholder') }}</p>
  </main>
</template>

<style scoped>
.bv-popup {
  box-sizing: border-box;
  width: 320px;
  padding: var(--bv-space-4);
  background: var(--bv-bg);
  color: var(--bv-text);
  font: var(--bv-font-body);
}

.bv-popup__head {
  display: flex;
  align-items: center;
  gap: var(--bv-space-2);
  margin-bottom: var(--bv-space-4);
}

.bv-popup__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.bv-popup__hint {
  margin: 0;
  color: var(--bv-text-secondary);
  font-size: 12px;
}
</style>
