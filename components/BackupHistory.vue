<script setup lang="ts">
import { computed, ref } from 'vue';

import { t, translateError } from '@/modules/i18n';
import { sendToBackground, type RestoreOutcome } from '@/shared/messages';
import type {
  BookmarkNode,
  LocalDB,
  RemoteBackupEntry,
  SnapshotContent,
  SnapshotMeta,
} from '@/shared/types';
import { formatLocalDateTime } from '@/shared/util';
import { useFeedbackStore } from '@/stores/feedback';
import { useSafeAction } from '@/composables/useSafeAction';

const props = defineProps<{
  db: LocalDB;
  webdavEnabled: boolean;
  encryptionEnabled: boolean;
  cloudSnapshots: RemoteBackupEntry[];
  cloudLoading: boolean;
}>();

const emit = defineEmits<{
  (event: 'refreshCloud'): void;
  (event: 'gotoSettings'): void;
}>();

const feedback = useFeedbackStore();
const safe = useSafeAction();

const snapshots = computed<SnapshotMeta[]>(() =>
  [...props.db.localSnapshots].sort((a, b) => b.createdAt - a.createdAt),
);
const recycleBin = computed(() => props.db.recycleBin);
const opLog = computed(() => props.db.opLog);

const busy = ref(false);

function sourceLabel(source: SnapshotMeta['source']): string {
  return t(`snapshotSource_${source}`);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/* ---------------- 本地快照 ---------------- */

/** 手动立即备份（E2：可只备份本地，也可同时上传云端） */
async function manualBackup(cloud: boolean): Promise<void> {
  busy.value = true;
  try {
    const result = await sendToBackground({ type: 'backup:now', cloud });
    if (result.error) feedback.error(translateError(result.error));
    else if (result.uploaded) feedback.success(t('backupUploaded', { name: result.fileName ?? '' }));
    else feedback.success(t('backupLocalDone'));
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  } finally {
    busy.value = false;
  }
}

/** 快照内容预览（D1：树结构只读预览） */
const previewContent = ref<SnapshotContent | null>(null);
const previewRows = computed(() => {
  const rows: Array<{ id: string; title: string; depth: number; url?: string }> = [];
  const walk = (node: BookmarkNode, depth: number): void => {
    rows.push({ id: node.id, title: node.title, depth, ...(node.url ? { url: node.url } : {}) });
    for (const child of node.children ?? []) walk(child, depth + 1);
  };
  for (const root of previewContent.value?.bookmarks ?? []) walk(root, 0);
  return rows;
});

async function previewSnapshot(meta: SnapshotMeta): Promise<void> {
  try {
    previewContent.value = await sendToBackground({ type: 'snapshot:read', id: meta.id });
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

/** 快照恢复（D4）：先校验并生成 restorePre，再二次确认，再覆盖重建 */
async function restoreSnapshot(meta: SnapshotMeta): Promise<void> {
  busy.value = true;
  try {
    const prepared = await sendToBackground({ type: 'snapshot:prepareRestore', id: meta.id });
    const ok = await feedback.ask({
      title: t('restoreTitle'),
      message: t('restoreMessage', { count: prepared.meta.count }),
      details: [
        formatLocalDateTime(prepared.meta.createdAt),
        t('restoreLossHint'),
        t('restoreSnapshotId', { id: prepared.restorePreId }),
      ],
      danger: true,
      confirmText: t('actionRestore'),
    });
    if (!ok) {
      await sendToBackground({ type: 'snapshot:delete', id: prepared.restorePreId }).catch(
        () => undefined,
      );
      return;
    }
    const outcome = await sendToBackground({
      type: 'snapshot:restore',
      id: meta.id,
      restorePreId: prepared.restorePreId,
    });
    reportRestore(outcome);
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  } finally {
    busy.value = false;
  }
}

/** 统一处理恢复结果（含回滚失败提示 restorePreId） */
function reportRestore(outcome: RestoreOutcome): void {
  if (outcome.failed) {
    if (outcome.rollbackFailed) {
      feedback.error(t('restoreFailedNoRollback', { id: outcome.restorePreId }));
    } else {
      feedback.error(t('restoreFailedRolledBack', { id: outcome.restorePreId }));
    }
    return;
  }
  feedback.success(
    t('restoreDone', { restored: outcome.restored, bound: outcome.boundMeta, orphan: outcome.orphanMeta }),
  );
}

async function removeSnapshot(meta: SnapshotMeta): Promise<void> {
  const ok = await feedback.ask({
    title: t('snapshotDeleteTitle'),
    message: t('snapshotDeleteMessage', { time: formatLocalDateTime(meta.createdAt) }),
    danger: true,
  });
  if (!ok) return;
  try {
    await sendToBackground({ type: 'snapshot:delete', id: meta.id });
    feedback.success(t('snapshotDeleted'));
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

/* ---------------- 回收站 ---------------- */

async function restoreItem(id: string): Promise<void> {
  try {
    const result = await sendToBackendRecycleRestore(id);
    feedback.success(t('recycleRestored', { count: result.restored }));
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

async function sendToBackendRecycleRestore(id: string) {
  return sendToBackground({ type: 'recycle:restore', id });
}

async function clearRecycle(): Promise<void> {
  await safe.run({
    title: t('recycleClearTitle'),
    message: t('recycleClearMessage'),
    details: [t('recycleClearDetail')],
    danger: true,
    execute: async (snapshotId) => {
      const result = await sendToBackground({ type: 'recycle:clear', snapshotId });
      feedback.success(t('recycleCleared', { count: result.cleared }));
      return result;
    },
  });
}

/* ---------------- 单步撤销 ---------------- */

async function undo(): Promise<void> {
  busy.value = true;
  try {
    const prepared = await sendToBackground({ type: 'oplog:prepareUndo' });
    const ok = await feedback.ask({
      title: t('undoTitle'),
      message: t('undoMessage', { action: t(`opAction_${prepared.op.action}`) }),
      details: [formatLocalDateTime(prepared.op.createdAt), t('undoHint')],
      danger: true,
      confirmText: t('actionUndo'),
    });
    if (!ok) {
      await sendToBackground({ type: 'snapshot:delete', id: prepared.restorePreId }).catch(
        () => undefined,
      );
      return;
    }
    const outcome = await sendToBackground({
      type: 'oplog:undo',
      opLogId: prepared.op.id,
      restorePreId: prepared.restorePreId,
    });
    reportRestore(outcome);
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  } finally {
    busy.value = false;
  }
}

/* ---------------- 云端备份（E2 / E3） ---------------- */

const cloudPassword = ref('');
const passwordPrompt = ref<null | { title: string; resolve: (value: string | null) => void }>(null);

/** 需要密码时弹窗；返回 null 表示用户取消 */
function askPassword(title: string): Promise<string | null> {
  cloudPassword.value = '';
  return new Promise((resolve) => {
    passwordPrompt.value = { title, resolve };
  });
}

function submitPassword(): void {
  const prompt = passwordPrompt.value;
  passwordPrompt.value = null;
  prompt?.resolve(cloudPassword.value || null);
}

function cancelPassword(): void {
  const prompt = passwordPrompt.value;
  passwordPrompt.value = null;
  prompt?.resolve(null);
}

/** 上传（加密且本机 vault 缺失时会要求输入密码，E2） */
async function uploadCloud(): Promise<void> {
  busy.value = true;
  try {
    let password: string | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const result = await sendToBackground({ type: 'webdav:upload', password });
        feedback.success(t('backupUploaded', { name: result.fileName }));
        return;
      } catch (err) {
        const key = err instanceof Error ? err.message : '';
        if (key === 'errPasswordRequired' && attempt === 0) {
          const input = await askPassword(t('cloudPasswordTitle'));
          if (!input) return;
          password = input;
          continue;
        }
        throw err;
      }
    }
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  } finally {
    busy.value = false;
  }
}

/** 从云端恢复（E3）：下载解析 → 生成 restorePre → 二次确认 → 覆盖恢复 */
async function restoreCloud(entry: RemoteBackupEntry): Promise<void> {
  busy.value = true;
  try {
    let password: string | undefined;
    let preview;
    for (;;) {
      try {
        preview = await sendToBackground({
          type: 'webdav:prepareRestore',
          fileName: entry.fileName,
          password,
        });
        break;
      } catch (err) {
        const key = err instanceof Error ? err.message : '';
        if (key === 'errPasswordRequired') {
          const input = await askPassword(t('cloudPasswordTitle'));
          if (!input) return;
          password = input;
          continue;
        }
        throw err;
      }
    }

    const ok = await feedback.ask({
      title: t('cloudRestoreTitle'),
      message: t('cloudRestoreMessage', {
        name: preview.fileName,
        count: preview.count,
        type: preview.encrypted ? t('labelEncrypted') : t('labelPlain'),
      }),
      details: [
        formatLocalDateTime(preview.exportedAt),
        t('restoreLossHint'),
        t('restoreSnapshotId', { id: preview.restorePreId }),
      ],
      danger: true,
      confirmText: t('actionRestore'),
    });
    if (!ok) {
      await sendToBackground({ type: 'snapshot:delete', id: preview.restorePreId }).catch(
        () => undefined,
      );
      return;
    }

    const outcome = await sendToBackground({
      type: 'webdav:restore',
      fileName: entry.fileName,
      restorePreId: preview.restorePreId,
      password,
    });
    reportRestore(outcome);
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  } finally {
    busy.value = false;
  }
}

async function deleteCloud(entry: RemoteBackupEntry): Promise<void> {
  const ok = await feedback.ask({
    title: t('cloudDeleteTitle'),
    message: t('cloudDeleteMessage', { name: entry.fileName }),
    danger: true,
  });
  if (!ok) return;
  try {
    await sendToBackground({ type: 'webdav:delete', fileName: entry.fileName });
    feedback.success(t('cloudDeleted'));
    emit('refreshCloud');
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

/* ---------------- 导入导出（G 节） ---------------- */

const importInput = ref<HTMLInputElement | null>(null);
const importKind = ref<'json' | 'html'>('json');

async function exportJson(): Promise<void> {
  try {
    const result = await sendToBackground({ type: 'io:exportJson' });
    download(result.fileName, result.content, 'application/json');
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

async function exportHtml(): Promise<void> {
  try {
    const result = await sendToBackground({ type: 'io:exportHtml' });
    download(result.fileName, result.content, 'text/html');
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

function download(fileName: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** 导入：先解析预览，再选择落点并二次确认（G2 两阶段） */
async function pickImport(kind: 'json' | 'html'): Promise<void> {
  importKind.value = kind;
  importInput.value?.click();
}

async function onImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  busy.value = true;
  try {
    const text = await file.text();
    let password: string | undefined;
    let preview;
    for (;;) {
      try {
        preview = await sendToBackendParse(importKind.value, text, password);
        break;
      } catch (err) {
        const key = err instanceof Error ? err.message : '';
        if (key === 'errPasswordRequired') {
          const input2 = await askPassword(t('importPasswordTitle'));
          if (!input2) return;
          password = input2;
          continue;
        }
        throw err;
      }
    }

    if (preview.importable === 0) {
      feedback.error(t('importNothing', { duplicates: preview.duplicates, invalid: preview.invalid }));
      return;
    }

    await safe.run({
      title: t('importTitle'),
      message: t('importMessage', { count: preview.importable, name: file.name }),
      details: [
        t('importDuplicates', { count: preview.duplicates }),
        t('importInvalid', { count: preview.invalid }),
        t('importRules', { count: preview.rules }),
        t('importMeta', { count: preview.metaCount }),
        t('importTargetHint'),
      ],
      confirmText: t('actionImport'),
      execute: async (snapshotId) => {
        const result = await sendToBackground({
          type: 'io:import',
          kind: importKind.value,
          text,
          options: { password },
          snapshotId,
        });
        feedback.success(
          t('importDone', {
            created: result.created,
            duplicates: result.duplicates,
            invalid: result.invalid,
          }),
        );
        return result;
      },
    });
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  } finally {
    busy.value = false;
  }
}

async function sendToBackendParse(kind: 'json' | 'html', text: string, password?: string) {
  return sendToBackground({ type: 'io:parse', kind, text, password });
}
</script>

<template>
  <section class="bv-backup bv-scroll">
    <header class="bv-row">
      <h2 class="bv-section-title" style="margin: 0">{{ t('backupTitle') }}</h2>
      <span class="bv-spacer" />
      <button class="bv-btn" type="button" :disabled="busy" @click="manualBackup(false)">
        {{ t('actionBackupLocal') }}
      </button>
      <button class="bv-btn bv-btn--primary" type="button" :disabled="busy" @click="uploadCloud">
        {{ t('actionBackupCloud') }}
      </button>
    </header>

    <p v-if="db.runtime.lastBackupError" class="bv-backup__warn">
      {{ t('lastBackupError') }}：{{ translateError(db.runtime.lastBackupError) }}
    </p>
    <p v-if="db.runtime.pendingCloudBackup" class="bv-backup__warn">{{ t('pendingCloudBackup') }}</p>

    <div class="bv-card">
      <h3 class="bv-section-title">{{ t('localSnapshotsTitle') }}</h3>
      <p v-if="db.runtime.lastDailyBackupDate" class="bv-hint">
        {{ t('lastDailyBackup', { date: db.runtime.lastDailyBackupDate }) }}
      </p>
      <p v-if="snapshots.length === 0" class="bv-empty">{{ t('noSnapshots') }}</p>
      <table v-else class="bv-table">
        <thead>
          <tr>
            <th>{{ t('colTime') }}</th>
            <th>{{ t('colSource') }}</th>
            <th>{{ t('colCount') }}</th>
            <th>{{ t('colSize') }}</th>
            <th>{{ t('colActions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="meta in snapshots" :key="meta.id">
            <td>{{ formatLocalDateTime(meta.createdAt) }}</td>
            <td>{{ sourceLabel(meta.source) }}</td>
            <td>{{ meta.count }}</td>
            <td>{{ formatBytes(meta.bytes) }}</td>
            <td class="bv-backup__actions">
              <button class="bv-btn bv-btn--sm" type="button" @click="previewSnapshot(meta)">
                {{ t('actionPreview') }}
              </button>
              <button
                class="bv-btn bv-btn--sm"
                type="button"
                :disabled="busy"
                @click="restoreSnapshot(meta)"
              >
                {{ t('actionRestore') }}
              </button>
              <button
                class="bv-btn bv-btn--sm bv-btn--danger"
                type="button"
                @click="removeSnapshot(meta)"
              >
                {{ t('actionDelete') }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="bv-card">
      <div class="bv-row">
        <h3 class="bv-section-title" style="margin: 0">{{ t('recycleTitle') }}</h3>
        <span class="bv-chip">{{ recycleBin.length }}</span>
        <span class="bv-spacer" />
        <button
          class="bv-btn bv-btn--danger bv-btn--sm"
          type="button"
          :disabled="recycleBin.length === 0"
          @click="clearRecycle"
        >
          {{ t('actionClearRecycle') }}
        </button>
      </div>
      <p class="bv-hint">{{ t('recycleHint') }}</p>
      <p v-if="recycleBin.length === 0" class="bv-empty">{{ t('recycleEmpty') }}</p>
      <ul v-else class="bv-backup__list">
        <li v-for="item in recycleBin" :key="item.id" class="bv-backup__item">
          <span class="bv-backup__item-title">
            {{ item.restoredNode.title || item.restoredNode.url }}
          </span>
          <span class="bv-hint">{{ formatLocalDateTime(item.deletedAt) }}</span>
          <span class="bv-spacer" />
          <button class="bv-btn bv-btn--sm" type="button" @click="restoreItem(item.id)">
            {{ t('actionRestore') }}
          </button>
        </li>
      </ul>
    </div>

    <div class="bv-card">
      <h3 class="bv-section-title">{{ t('undoTitle') }}</h3>
      <p v-if="opLog.length === 0" class="bv-hint">{{ t('undoEmpty') }}</p>
      <template v-else>
        <p class="bv-hint">
          {{ t('undoLatest', { action: t(`opAction_${opLog[0]?.action}`), time: formatLocalDateTime(opLog[0]?.createdAt ?? 0) }) }}
        </p>
        <button class="bv-btn" type="button" :disabled="busy" @click="undo">
          {{ t('actionUndo') }}
        </button>
      </template>
    </div>

    <div class="bv-card">
      <div class="bv-row">
        <h3 class="bv-section-title" style="margin: 0">{{ t('cloudTitle') }}</h3>
        <span class="bv-spacer" />
        <button
          class="bv-btn bv-btn--sm"
          type="button"
          :disabled="!webdavEnabled || cloudLoading"
          @click="emit('refreshCloud')"
        >
          {{ t('actionRefresh') }}
        </button>
      </div>

      <p v-if="!webdavEnabled" class="bv-hint">
        {{ t('cloudNotConfigured') }}
        <button class="bv-btn bv-btn--sm" type="button" @click="emit('gotoSettings')">
          {{ t('actionGotoSettings') }}
        </button>
      </p>

      <template v-else>
        <p class="bv-hint">
          {{ encryptionEnabled ? t('cloudEncryptedOn') : t('cloudEncryptedOff') }}
        </p>
        <p v-if="cloudSnapshots.length === 0" class="bv-empty">
          {{ cloudLoading ? t('loading') : t('cloudEmpty') }}
        </p>
        <table v-else class="bv-table">
          <thead>
            <tr>
              <th>{{ t('colFileName') }}</th>
              <th>{{ t('colTime') }}</th>
              <th>{{ t('colSize') }}</th>
              <th>{{ t('colActions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="entry in cloudSnapshots" :key="entry.fileName">
              <td class="bv-backup__filename">
                {{ entry.fileName }}
                <span v-if="!entry.recognized" class="bv-chip bv-chip--suspect">
                  {{ t('labelUnknownFormat') }}
                </span>
              </td>
              <td>
                {{ entry.exportedAt ? formatLocalDateTime(entry.exportedAt) : '—' }}
              </td>
              <td>{{ entry.size === null ? '—' : formatBytes(entry.size) }}</td>
              <td class="bv-backup__actions">
                <button
                  class="bv-btn bv-btn--sm"
                  type="button"
                  :disabled="!entry.recognized || busy"
                  @click="restoreCloud(entry)"
                >
                  {{ t('actionRestore') }}
                </button>
                <button
                  class="bv-btn bv-btn--sm bv-btn--danger"
                  type="button"
                  :disabled="!entry.recognized"
                  @click="deleteCloud(entry)"
                >
                  {{ t('actionDelete') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </div>

    <div class="bv-card">
      <h3 class="bv-section-title">{{ t('ioTitle') }}</h3>
      <p class="bv-hint">{{ t('ioHint') }}</p>
      <div class="bv-row bv-backup__io">
        <button class="bv-btn" type="button" @click="exportHtml">{{ t('actionExportHtml') }}</button>
        <button class="bv-btn" type="button" @click="exportJson">{{ t('actionExportJson') }}</button>
        <button class="bv-btn" type="button" @click="pickImport('json')">
          {{ t('actionImportJson') }}
        </button>
        <button class="bv-btn" type="button" @click="pickImport('html')">
          {{ t('actionImportHtml') }}
        </button>
        <input ref="importInput" type="file" accept=".json,.html,.htm" hidden @change="onImportFile" />
      </div>
    </div>

    <!-- 快照内容预览 -->
    <div v-if="previewContent" class="bv-mask" @click.self="previewContent = null">
      <section class="bv-preview" role="dialog" aria-modal="true">
        <header class="bv-row">
          <h3 class="bv-section-title" style="margin: 0">{{ t('snapshotPreviewTitle') }}</h3>
          <span class="bv-spacer" />
          <button class="bv-btn bv-btn--sm" type="button" @click="previewContent = null">
            {{ t('actionClose') }}
          </button>
        </header>
        <div class="bv-preview__body bv-scroll">
          <p v-for="row in previewRows" :key="row.id" class="bv-preview__row" :style="{ paddingLeft: `${row.depth * 16}px` }">
            <span v-if="row.url">🔗 {{ row.title || row.url }}</span>
            <span v-else class="bv-preview__folder">📁 {{ row.title || t('unnamedFolder') }}</span>
          </p>
        </div>
      </section>
    </div>

    <!-- 密码输入（云端加密备份 / 导入加密 JSON） -->
    <div v-if="passwordPrompt" class="bv-mask" @click.self="cancelPassword">
      <section class="bv-pwd" role="dialog" aria-modal="true">
        <h3 class="bv-section-title">{{ passwordPrompt.title }}</h3>
        <p class="bv-hint">{{ t('cloudPasswordHint') }}</p>
        <input
          v-model="cloudPassword"
          class="bv-input"
          type="password"
          autocomplete="off"
          @keydown.enter.prevent="submitPassword"
        />
        <div class="bv-row">
          <span class="bv-spacer" />
          <button class="bv-btn" type="button" @click="cancelPassword">
            {{ t('actionCancel') }}
          </button>
          <button class="bv-btn bv-btn--primary" type="button" @click="submitPassword">
            {{ t('actionConfirm') }}
          </button>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.bv-backup {
  display: flex;
  flex-direction: column;
  gap: var(--bv-space-3);
  padding: var(--bv-space-4);
  height: 100%;
  overflow: auto;
}

.bv-backup__warn {
  color: var(--bv-danger);
  font-size: var(--bv-font-size-sm);
}

.bv-table {
  width: 100%;
  font-size: var(--bv-font-size-sm);
  border-collapse: collapse;
}

.bv-table th,
.bv-table td {
  padding: 6px var(--bv-space-2);
  text-align: left;
  border-bottom: 1px solid var(--bv-border);
}

.bv-table th {
  color: var(--bv-text-secondary);
  font-size: var(--bv-font-size-xs);
  font-weight: 600;
}

.bv-backup__actions {
  display: flex;
  gap: var(--bv-space-1);
  white-space: nowrap;
}

.bv-backup__filename {
  font-family: var(--bv-font-mono);
  font-size: var(--bv-font-size-xs);
  word-break: break-all;
}

.bv-backup__list {
  padding: 0;
  margin: var(--bv-space-2) 0 0;
  list-style: none;
}

.bv-backup__item {
  display: flex;
  gap: var(--bv-space-2);
  align-items: center;
  padding: 5px 0;
  border-bottom: 1px solid var(--bv-border);
}

.bv-backup__item-title {
  overflow: hidden;
  max-width: 420px;
  font-size: var(--bv-font-size-sm);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bv-backup__io {
  flex-wrap: wrap;
  margin-top: var(--bv-space-2);
}

.bv-mask {
  position: fixed;
  inset: 0;
  z-index: var(--bv-z-dialog);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bv-overlay);
}

.bv-preview {
  display: flex;
  flex-direction: column;
  width: 720px;
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 64px);
  padding: var(--bv-space-4);
  background: var(--bv-surface);
  border: 1px solid var(--bv-border);
  border-radius: var(--bv-radius-md);
  box-shadow: var(--bv-shadow-3);
}

.bv-preview__body {
  flex: 1;
  min-height: 0;
  margin-top: var(--bv-space-2);
  overflow: auto;
}

.bv-preview__row {
  font-size: var(--bv-font-size-xs);
  line-height: 1.9;
}

.bv-preview__folder {
  color: var(--bv-text-secondary);
  font-weight: 600;
}

.bv-pwd {
  display: flex;
  flex-direction: column;
  gap: var(--bv-space-3);
  width: 380px;
  padding: var(--bv-space-5);
  background: var(--bv-surface);
  border: 1px solid var(--bv-border);
  border-radius: var(--bv-radius-md);
  box-shadow: var(--bv-shadow-3);
}
</style>
