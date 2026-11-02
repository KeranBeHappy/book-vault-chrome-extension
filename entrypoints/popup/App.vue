<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import AppToast from '@/components/AppToast.vue';
import { applyTheme, resolveTheme } from '@/composables/useTheme';
import { collectBookmarks, getTree, isHttpUrl } from '@/modules/bookmarks';
import { t, translateError } from '@/modules/i18n';
import { sendToBackground } from '@/shared/messages';
import type { LocalDB } from '@/shared/types';
import { formatLocalStamp } from '@/shared/util';
import { useFeedbackStore } from '@/stores/feedback';

/**
 * 工具栏 Popup（2.1 / 7 节）。
 *
 * 五个动作都复用既有后台能力，不另起实现：
 * 打开管理页 / 立即备份 / 检测死链 / 收藏当前窗口。
 * 备份状态读 `LocalDB.runtime`，与备份页看到的是同一份数据。
 */
const feedback = useFeedbackStore();
const db = ref<LocalDB | null>(null);
const busy = ref<string | null>(null);

const settings = computed(() => db.value?.settings);

/** 备份状态一行文案：失败 > 待补做 > 时间 > 从未 */
const backupStatus = computed(() => {
  const runtime = db.value?.runtime;
  if (!runtime) return '';
  if (runtime.lastBackupError) {
    return t('popupBackupFailed', { reason: translateError(runtime.lastBackupError) });
  }
  if (runtime.pendingVaultPrompt) return t('popupPendingVault');
  if (runtime.pendingCloudBackup) return t('popupPendingCloud');
  if (runtime.lastCloudBackupAt) {
    return t('popupLastBackup', { time: formatLocalStamp(runtime.lastCloudBackupAt) });
  }
  return t('popupBackupNever');
});

/** 读一次库（含主题） */
async function load(): Promise<void> {
  try {
    const next = await sendToBackground({ type: 'db:get' });
    db.value = next;
    applyTheme(resolveTheme(next.settings.theme));
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

/** 统一处理「执行 → 关闭」的按钮流程 */
async function run(action: string, task: () => Promise<string | null>): Promise<void> {
  if (busy.value) return;
  busy.value = action;
  try {
    const message = await task();
    if (message) feedback.success(message);
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  } finally {
    busy.value = null;
  }
}

function openManager(): Promise<void> {
  return run('manager', async () => {
    await sendToBackground({ type: 'ui:openManager' });
    window.close();
    return null;
  });
}

function backupNow(): Promise<void> {
  return run('backup', async () => {
    const cloud = Boolean(settings.value?.webdav.enabled);
    const result = await sendToBackground({ type: 'backup:now', cloud });
    await load();
    // SW 用返回值区分「只留本地快照」与「已上传云端」，失败原因以 i18n key 返回，
    // 这里必须显式抛错，否则备份失败也会提示成功
    if (result.error) throw new Error(result.error);
    return result.uploaded ? t('popupBackupDone') : t('popupBackupLocalDone');
  });
}

function checkLinks(): Promise<void> {
  return run('linkCheck', async () => {
    const tree = await getTree();
    const ids = collectBookmarks(tree)
      .map((entry) => entry.node)
      .filter((node) => isHttpUrl(node.url))
      .map((node) => node.id);
    if (ids.length === 0) throw new Error('errNoHttpBookmarks');
    await sendToBackground({ type: 'job:start', kind: 'linkCheck', ids });
    return t('popupLinkCheckStarted', { count: ids.length });
  });
}

function openCapture(): Promise<void> {
  return run('capture', async () => {
    await sendToBackground({ type: 'ui:openCapture', mode: 'window' });
    window.close();
    return null;
  });
}

onMounted(load);
</script>

<template>
  <main class="bv-popup">
    <header class="bv-popup__head">
      <h1 class="bv-popup__title">{{ t('popupTitle') }}</h1>
    </header>

    <p class="bv-popup__status" :class="{ 'is-error': db?.runtime.lastBackupError }">
      {{ backupStatus }}
    </p>

    <div class="bv-popup__actions">
      <button class="bv-btn bv-btn--primary" type="button" :disabled="busy !== null" @click="openManager">
        {{ t('popupOpenManager') }}
      </button>
      <button class="bv-btn" type="button" :disabled="busy !== null" @click="openCapture">
        {{ t('actionCaptureWindow') }}
      </button>
      <button class="bv-btn" type="button" :disabled="busy !== null" @click="backupNow">
        {{ t('popupBackupNow') }}
      </button>
      <button class="bv-btn" type="button" :disabled="busy !== null" @click="checkLinks">
        {{ t('actionCheckLinks') }}
      </button>
    </div>

    <AppToast />
  </main>
</template>

<style scoped>
.bv-popup {
  box-sizing: border-box;
  width: 320px;
  padding: var(--bv-space-4);
  color: var(--bv-text);
  background: var(--bv-bg);
  font: var(--bv-font-body);
}

.bv-popup__head {
  display: flex;
  gap: var(--bv-space-2);
  align-items: center;
  margin-bottom: var(--bv-space-2);
}

.bv-popup__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.bv-popup__status {
  margin: 0 0 var(--bv-space-3);
  color: var(--bv-text-secondary);
  font-size: 11px;
  line-height: 1.5;
}

.bv-popup__status.is-error {
  color: var(--bv-danger);
}

.bv-popup__actions {
  display: flex;
  flex-direction: column;
  gap: var(--bv-space-2);
}
</style>
