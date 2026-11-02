<script setup lang="ts">
import { reactive, ref, watch } from 'vue';

import { t, translateError } from '@/modules/i18n';
import { sendToBackground, type DeepPartial } from '@/shared/messages';
import { SETTINGS_BOUNDS } from '@/shared/constants';
import type { Settings, WebDavTestResult } from '@/shared/types';
import { useFeedbackStore } from '@/stores/feedback';

const props = defineProps<{
  settings: Settings;
  blocklist: string[];
  hasVault: boolean;
  rememberOnDevice: boolean;
}>();

const emit = defineEmits<{
  (event: 'save', patch: DeepPartial<Settings>): void;
  (event: 'setupEncryption', password: string): void;
  (event: 'changePassword', payload: { oldPassword: string; newPassword: string }): void;
  (event: 'clearVault'): void;
  (event: 'saveBlocklist', list: string[]): void;
}>();

const feedback = useFeedbackStore();

/** 本地表单副本：保存时只提交有变化的字段 */
const form = reactive({
  theme: props.settings.theme,
  language: props.settings.language,
  concurrency: props.settings.concurrency,
  timeoutSec: props.settings.timeoutSec,
  localSnapshotKeep: props.settings.localSnapshotKeep,
  cloudSnapshotKeep: props.settings.cloudSnapshotKeep,
  recycleKeep: props.settings.recycleKeep,
  titleSimilarityThreshold: props.settings.titleSimilarityThreshold,
  autoBackupDaily: props.settings.autoBackupDaily,
  autoBackupHour: props.settings.autoBackupHour,
  webdav: { ...props.settings.webdav },
  rememberOnDevice: props.settings.encryption.rememberOnDevice,
});

watch(
  () => props.settings,
  (next) => {
    form.theme = next.theme;
    form.language = next.language;
    form.concurrency = next.concurrency;
    form.timeoutSec = next.timeoutSec;
    form.localSnapshotKeep = next.localSnapshotKeep;
    form.cloudSnapshotKeep = next.cloudSnapshotKeep;
    form.recycleKeep = next.recycleKeep;
    form.titleSimilarityThreshold = next.titleSimilarityThreshold;
    form.autoBackupDaily = next.autoBackupDaily;
    form.autoBackupHour = next.autoBackupHour;
    form.webdav = { ...next.webdav };
    form.rememberOnDevice = next.encryption.rememberOnDevice;
  },
  { deep: true },
);

const blocklistText = ref(props.blocklist.join('\n'));
watch(
  () => props.blocklist,
  (next) => {
    blocklistText.value = next.join('\n');
  },
);

/** 把输入限制到文档规定的取值范围（第 10 节） */
function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value * 100) / 100));
}

function saveGeneral(): void {
  emit('save', {
    theme: form.theme,
    language: form.language,
    concurrency: clamp(form.concurrency, SETTINGS_BOUNDS.concurrency.min, SETTINGS_BOUNDS.concurrency.max),
    timeoutSec: clamp(form.timeoutSec, SETTINGS_BOUNDS.timeoutSec.min, SETTINGS_BOUNDS.timeoutSec.max),
    localSnapshotKeep: clamp(
      form.localSnapshotKeep,
      SETTINGS_BOUNDS.localSnapshotKeep.min,
      SETTINGS_BOUNDS.localSnapshotKeep.max,
    ),
    cloudSnapshotKeep: clamp(
      form.cloudSnapshotKeep,
      SETTINGS_BOUNDS.cloudSnapshotKeep.min,
      SETTINGS_BOUNDS.cloudSnapshotKeep.max,
    ),
    recycleKeep: clamp(form.recycleKeep, SETTINGS_BOUNDS.recycleKeep.min, SETTINGS_BOUNDS.recycleKeep.max),
    titleSimilarityThreshold: clamp(
      form.titleSimilarityThreshold,
      SETTINGS_BOUNDS.titleSimilarityThreshold.min,
      SETTINGS_BOUNDS.titleSimilarityThreshold.max,
    ),
    autoBackupDaily: form.autoBackupDaily,
    autoBackupHour: clamp(
      form.autoBackupHour,
      SETTINGS_BOUNDS.autoBackupHour.min,
      SETTINGS_BOUNDS.autoBackupHour.max,
    ),
    encryption: { enabled: props.settings.encryption.enabled, rememberOnDevice: form.rememberOnDevice },
  });
  feedback.success(t('settingsSaved'));
}

function saveWebdav(): void {
  emit('save', {
    webdav: {
      enabled: form.webdav.enabled,
      server: form.webdav.server.trim(),
      username: form.webdav.username.trim(),
      password: form.webdav.password,
      remoteDir: form.webdav.remoteDir.trim() || '/',
    },
  });
  feedback.success(t('settingsSaved'));
}

function saveBlocklist(): void {
  const list = blocklistText.value
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 0);
  emit('saveBlocklist', [...new Set(list)]);
  feedback.success(t('settingsSaved'));
}

/* ---------------- WebDAV 连接测试（E1） ---------------- */
const testing = ref(false);
const testResult = ref<WebDavTestResult | null>(null);

async function testConnection(): Promise<void> {
  testing.value = true;
  testResult.value = null;
  try {
    testResult.value = await sendToBackground({ type: 'webdav:test', config: form.webdav });
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  } finally {
    testing.value = false;
  }
}

/* ---------------- 加密（K 节） ---------------- */
const passwordDialog = ref<'setup' | 'change' | null>(null);
const password = ref('');
const oldPassword = ref('');
const acked = ref(false);

function openSetup(): void {
  passwordDialog.value = 'setup';
  password.value = '';
  oldPassword.value = '';
  acked.value = false;
}

function submitPassword(): void {
  if (passwordDialog.value === 'setup') {
    if (!password.value) {
      feedback.error(t('errPasswordEmpty'));
      return;
    }
    if (!acked.value) {
      feedback.error(t('encryptNeedAck'));
      return;
    }
    emit('setupEncryption', password.value);
    passwordDialog.value = null;
    password.value = '';
    return;
  }
  if (passwordDialog.value === 'change') {
    if (!oldPassword.value || !password.value) {
      feedback.error(t('errPasswordEmpty'));
      return;
    }
    emit('changePassword', { oldPassword: oldPassword.value, newPassword: password.value });
    passwordDialog.value = null;
    password.value = '';
    oldPassword.value = '';
  }
}

function toggleEncryption(event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  if (checked) {
    openSetup();
    return;
  }
  emit('save', { encryption: { enabled: false, rememberOnDevice: form.rememberOnDevice } });
}
</script>

<template>
  <section class="bv-settings bv-scroll">
    <h2 class="bv-section-title">{{ t('settingsTitle') }}</h2>

    <div class="bv-card bv-col">
      <h3 class="bv-section-title">{{ t('settingsGeneral') }}</h3>
      <div class="bv-settings__grid">
        <label class="bv-settings__field">
          <span class="bv-hint">{{ t('fieldTheme') }}</span>
          <select v-model="form.theme" class="bv-select">
            <option value="system">{{ t('themeSystem') }}</option>
            <option value="light">{{ t('themeLight') }}</option>
            <option value="dark">{{ t('themeDark') }}</option>
          </select>
        </label>
        <label class="bv-settings__field">
          <span class="bv-hint">{{ t('fieldLanguage') }}</span>
          <select v-model="form.language" class="bv-select">
            <option value="system">{{ t('languageSystem') }}</option>
            <option value="zh_CN">简体中文</option>
            <option value="en">English</option>
          </select>
        </label>
        <label class="bv-settings__field">
          <span class="bv-hint">{{ t('fieldConcurrency') }}</span>
          <input
            v-model.number="form.concurrency"
            class="bv-input"
            type="number"
            :min="SETTINGS_BOUNDS.concurrency.min"
            :max="SETTINGS_BOUNDS.concurrency.max"
          />
        </label>
        <label class="bv-settings__field">
          <span class="bv-hint">{{ t('fieldTimeout') }}</span>
          <input
            v-model.number="form.timeoutSec"
            class="bv-input"
            type="number"
            :min="SETTINGS_BOUNDS.timeoutSec.min"
            :max="SETTINGS_BOUNDS.timeoutSec.max"
          />
        </label>
        <label class="bv-settings__field">
          <span class="bv-hint">{{ t('fieldLocalKeep') }}</span>
          <input
            v-model.number="form.localSnapshotKeep"
            class="bv-input"
            type="number"
            :min="SETTINGS_BOUNDS.localSnapshotKeep.min"
            :max="SETTINGS_BOUNDS.localSnapshotKeep.max"
          />
        </label>
        <label class="bv-settings__field">
          <span class="bv-hint">{{ t('fieldCloudKeep') }}</span>
          <input
            v-model.number="form.cloudSnapshotKeep"
            class="bv-input"
            type="number"
            :min="SETTINGS_BOUNDS.cloudSnapshotKeep.min"
            :max="SETTINGS_BOUNDS.cloudSnapshotKeep.max"
          />
        </label>
        <label class="bv-settings__field">
          <span class="bv-hint">{{ t('fieldRecycleKeep') }}</span>
          <input
            v-model.number="form.recycleKeep"
            class="bv-input"
            type="number"
            :min="SETTINGS_BOUNDS.recycleKeep.min"
            :max="SETTINGS_BOUNDS.recycleKeep.max"
          />
        </label>
        <label class="bv-settings__field">
          <span class="bv-hint">{{ t('fieldSimilarity') }}</span>
          <input
            v-model.number="form.titleSimilarityThreshold"
            class="bv-input"
            type="number"
            step="0.01"
            :min="SETTINGS_BOUNDS.titleSimilarityThreshold.min"
            :max="SETTINGS_BOUNDS.titleSimilarityThreshold.max"
          />
        </label>
        <label class="bv-settings__field">
          <span class="bv-hint">{{ t('fieldAutoBackupHour') }}</span>
          <input
            v-model.number="form.autoBackupHour"
            class="bv-input"
            type="number"
            :min="SETTINGS_BOUNDS.autoBackupHour.min"
            :max="SETTINGS_BOUNDS.autoBackupHour.max"
          />
        </label>
        <label class="bv-settings__field bv-row">
          <input v-model="form.autoBackupDaily" type="checkbox" />
          <span class="bv-hint">{{ t('fieldAutoBackupDaily') }}</span>
        </label>
      </div>
      <div class="bv-row">
        <span class="bv-spacer" />
        <button class="bv-btn bv-btn--primary" type="button" @click="saveGeneral">
          {{ t('actionSave') }}
        </button>
      </div>
    </div>

    <div class="bv-card bv-col">
      <h3 class="bv-section-title">{{ t('settingsWebdav') }}</h3>
      <label class="bv-row">
        <input v-model="form.webdav.enabled" type="checkbox" />
        <span class="bv-hint">{{ t('fieldWebdavEnabled') }}</span>
      </label>
      <div class="bv-settings__grid">
        <label class="bv-settings__field bv-settings__field--wide">
          <span class="bv-hint">{{ t('fieldWebdavServer') }}</span>
          <input v-model="form.webdav.server" class="bv-input" type="url" />
        </label>
        <label class="bv-settings__field">
          <span class="bv-hint">{{ t('fieldWebdavUser') }}</span>
          <input v-model="form.webdav.username" class="bv-input" type="text" autocomplete="off" />
        </label>
        <label class="bv-settings__field">
          <span class="bv-hint">{{ t('fieldWebdavPassword') }}</span>
          <input
            v-model="form.webdav.password"
            class="bv-input"
            type="password"
            autocomplete="new-password"
          />
        </label>
        <label class="bv-settings__field">
          <span class="bv-hint">{{ t('fieldWebdavDir') }}</span>
          <input v-model="form.webdav.remoteDir" class="bv-input" type="text" />
        </label>
      </div>
      <p class="bv-hint bv-settings__warn">{{ t('webdavPasswordRisk') }}</p>
      <div class="bv-row">
        <button class="bv-btn" type="button" :disabled="testing" @click="testConnection">
          {{ testing ? t('loading') : t('actionTestConnection') }}
        </button>
        <button class="bv-btn bv-btn--primary" type="button" @click="saveWebdav">
          {{ t('actionSave') }}
        </button>
      </div>

      <div v-if="testResult" class="bv-settings__test">
        <p :class="testResult.ok ? 'bv-settings__ok' : 'bv-settings__bad'">
          {{ testResult.ok ? t('davTestOk', { count: testResult.fileCount ?? 0 }) : t(`davCode_${testResult.code}`) }}
        </p>
        <ul class="bv-settings__test-lines">
          <li>{{ t('davTestUrl') }}: {{ testResult.url }}</li>
          <li>{{ t('davTestMethod') }}: {{ testResult.method }}</li>
          <li>{{ t('davTestStatus') }}: {{ testResult.status ?? '—' }}</li>
          <li>{{ t('davTestDuration') }}: {{ testResult.durationMs }} ms</li>
          <li v-if="testResult.detail">{{ t('davTestDetail') }}: {{ testResult.detail }}</li>
          <li v-if="testResult.bodyPreview" class="bv-settings__preview">
            {{ testResult.bodyPreview }}
          </li>
        </ul>
      </div>
    </div>

    <div class="bv-card bv-col">
      <h3 class="bv-section-title">{{ t('settingsEncryption') }}</h3>
      <label class="bv-row">
        <input
          type="checkbox"
          :checked="settings.encryption.enabled"
          :disabled="!settings.encryption.enabled && passwordDialog === 'setup'"
          @change="toggleEncryption"
        />
        <span class="bv-hint">{{ t('fieldEncryptEnabled') }}</span>
        <span v-if="settings.encryption.enabled" class="bv-chip bv-chip--primary">
          {{ hasVault ? t('vaultCached') : t('vaultMissing') }}
        </span>
      </label>
      <label class="bv-row">
        <input v-model="form.rememberOnDevice" type="checkbox" />
        <span class="bv-hint">{{ t('fieldRememberKey') }}</span>
      </label>
      <p class="bv-hint">{{ t('encryptionScopeHint') }}</p>
      <p class="bv-hint bv-settings__warn">{{ t('encryptionRiskHint') }}</p>
      <div class="bv-row">
        <button
          v-if="settings.encryption.enabled"
          class="bv-btn"
          type="button"
          @click="passwordDialog = 'change'"
        >
          {{ t('actionChangePassword') }}
        </button>
        <button
          v-if="hasVault"
          class="bv-btn bv-btn--danger"
          type="button"
          @click="emit('clearVault')"
        >
          {{ t('actionClearVault') }}
        </button>
        <span class="bv-spacer" />
        <button class="bv-btn" type="button" @click="saveGeneral">{{ t('actionSave') }}</button>
      </div>
    </div>

    <div class="bv-card bv-col">
      <h3 class="bv-section-title">{{ t('settingsProxy') }}</h3>
      <p class="bv-hint">{{ t('proxyHint') }}</p>
      <textarea v-model="blocklistText" class="bv-textarea" rows="6" spellcheck="false" />
      <div class="bv-row">
        <span class="bv-spacer" />
        <button class="bv-btn bv-btn--primary" type="button" @click="saveBlocklist">
          {{ t('actionSave') }}
        </button>
      </div>
    </div>

    <!-- 密码输入框（开启加密 / 修改密码） -->
    <div v-if="passwordDialog" class="bv-mask" @click.self="passwordDialog = null">
      <section class="bv-pwd" role="dialog" aria-modal="true">
        <h3 class="bv-section-title">
          {{ passwordDialog === 'setup' ? t('encryptSetupTitle') : t('encryptChangeTitle') }}
        </h3>
        <label v-if="passwordDialog === 'change'" class="bv-col">
          <span class="bv-hint">{{ t('fieldOldPassword') }}</span>
          <input v-model="oldPassword" class="bv-input" type="password" autocomplete="off" />
        </label>
        <label class="bv-col">
          <span class="bv-hint">{{ t('fieldNewPassword') }}</span>
          <input v-model="password" class="bv-input" type="password" autocomplete="new-password" />
        </label>
        <label v-if="passwordDialog === 'setup'" class="bv-row bv-settings__ack">
          <input v-model="acked" type="checkbox" />
          <span>{{ t('encryptAck') }}</span>
        </label>
        <div class="bv-row">
          <span class="bv-spacer" />
          <button class="bv-btn" type="button" @click="passwordDialog = null">
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
.bv-settings {
  display: flex;
  flex-direction: column;
  gap: var(--bv-space-3);
  padding: var(--bv-space-4);
  height: 100%;
  overflow: auto;
}

.bv-settings__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--bv-space-3);
}

.bv-settings__field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bv-settings__field--wide {
  grid-column: span 2;
}

.bv-settings__warn {
  color: var(--bv-danger);
}

.bv-settings__ack {
  color: var(--bv-danger);
  font-size: var(--bv-font-size-sm);
  line-height: 1.6;
}

.bv-settings__test {
  padding: var(--bv-space-2);
  background: var(--bv-surface-sunken);
  border-radius: var(--bv-radius-sm);
}

.bv-settings__ok {
  color: var(--bv-ok);
  font-size: var(--bv-font-size-sm);
}

.bv-settings__bad {
  color: var(--bv-danger);
  font-size: var(--bv-font-size-sm);
}

.bv-settings__test-lines {
  padding-left: var(--bv-space-4);
  margin: var(--bv-space-1) 0 0;
  color: var(--bv-text-secondary);
  font-size: var(--bv-font-size-xs);
  word-break: break-all;
}

.bv-settings__preview {
  font-family: var(--bv-font-mono);
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
