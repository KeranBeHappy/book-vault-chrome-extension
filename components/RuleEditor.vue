<script setup lang="ts">
import { computed, ref } from 'vue';

import type { BookmarkEntry } from '@/modules/bookmarks';
import {
  buildPreview,
  categoryList,
  computeImpact,
  RULE_TYPE_ORDER,
  sortRules,
} from '@/modules/classifier';
import { t, translateError } from '@/modules/i18n';
import { DEFAULT_CATEGORIES, UNCATEGORIZED } from '@/shared/constants';
import type { BookmarkTree, CategoryRule, ClassificationPreviewItem, RuleType } from '@/shared/types';
import { uid } from '@/shared/util';
import { useDbStore } from '@/stores/db';
import { useFeedbackStore } from '@/stores/feedback';

const props = defineProps<{
  rules: CategoryRule[];
  entries: BookmarkEntry[];
  tree: BookmarkTree | null;
}>();

const emit = defineEmits<{
  (event: 'apply', items: Array<{ bookmarkId: string; category: string }>): void;
}>();

const dbStore = useDbStore();
const feedback = useFeedbackStore();

const typeLabels: Record<RuleType, string> = {
  domainExact: 'ruleTypeDomainExact',
  domainContains: 'ruleTypeDomainContains',
  urlKeyword: 'ruleTypeUrlKeyword',
  titleKeyword: 'ruleTypeTitleKeyword',
};

/** 分类候选：内置默认分类 + 规则里出现过的分类（C2 / 3.4） */
const categoryOptions = computed(() => {
  const list = new Set(categoryList(props.rules, DEFAULT_CATEGORIES));
  list.add(UNCATEGORIZED);
  return [...list];
});

/* ---------------- 规则分组（类型桶固定，桶内 order 升序） ---------------- */
const grouped = computed(() =>
  RULE_TYPE_ORDER.map((type) => ({
    type,
    rules: sortRules(props.rules.filter((rule) => rule.type === type)),
  })),
);

const dragRuleId = ref<string | null>(null);

/** 规则持久化：直接走 SW 的 settings 同级 patch（规则不涉及书签，不需要快照） */
async function persist(next: CategoryRule[]): Promise<void> {
  try {
    await dbStore.patch({ rules: next });
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

/* ---------------- 新增 / 编辑 ---------------- */
const editingId = ref<string | null>(null);
const form = ref<{ type: RuleType; pattern: string; category: string; enabled: boolean }>({
  type: 'domainExact',
  pattern: '',
  category: UNCATEGORIZED,
  enabled: true,
});

function startCreate(): void {
  editingId.value = 'new';
  form.value = { type: 'domainExact', pattern: '', category: UNCATEGORIZED, enabled: true };
}

function startEdit(rule: CategoryRule): void {
  editingId.value = rule.id;
  form.value = {
    type: rule.type,
    pattern: rule.pattern,
    category: rule.category,
    enabled: rule.enabled,
  };
}

function cancelEdit(): void {
  editingId.value = null;
}

async function submit(): Promise<void> {
  const pattern = form.value.pattern.trim();
  const category = form.value.category.trim();
  if (!pattern) {
    feedback.error(t('errRulePatternEmpty'));
    return;
  }
  if (!category) {
    feedback.error(t('errRuleCategoryEmpty'));
    return;
  }

  if (editingId.value === 'new') {
    const sameType = props.rules.filter((rule) => rule.type === form.value.type);
    const next: CategoryRule = {
      id: uid('rule-'),
      type: form.value.type,
      pattern,
      category,
      enabled: form.value.enabled,
      order: sameType.length + 1,
    };
    await persist([...props.rules, next]);
  } else if (editingId.value) {
    const target = props.rules.find((rule) => rule.id === editingId.value);
    if (!target) return;
    const next = props.rules.map((rule) =>
      rule.id === editingId.value
        ? { ...rule, pattern, category, enabled: form.value.enabled, type: form.value.type }
        : rule,
    );
    await persist(next);
  }
  editingId.value = null;
}

async function toggleEnabled(rule: CategoryRule): Promise<void> {
  await persist(
    props.rules.map((item) => (item.id === rule.id ? { ...item, enabled: !item.enabled } : item)),
  );
}

async function removeRule(rule: CategoryRule): Promise<void> {
  await persist(props.rules.filter((item) => item.id !== rule.id));
}

/* ---------------- 组内拖拽排序（跨组不可拖） ---------------- */
function onDragStart(rule: CategoryRule): void {
  dragRuleId.value = rule.id;
}

async function onDrop(target: CategoryRule): Promise<void> {
  const sourceId = dragRuleId.value;
  dragRuleId.value = null;
  if (!sourceId || sourceId === target.id) return;
  const source = props.rules.find((rule) => rule.id === sourceId);
  if (!source || source.type !== target.type) return; // 类型优先级不可跨越（D-6）

  const bucket = sortRules(props.rules.filter((rule) => rule.type === target.type));
  const fromIndex = bucket.findIndex((rule) => rule.id === sourceId);
  const toIndex = bucket.findIndex((rule) => rule.id === target.id);
  if (fromIndex < 0 || toIndex < 0) return;

  const reordered = [...bucket];
  const [moved] = reordered.splice(fromIndex, 1);
  if (!moved) return;
  reordered.splice(toIndex, 0, moved);

  const orderMap = new Map(reordered.map((rule, index) => [rule.id, index + 1]));
  await persist(
    props.rules.map((rule) =>
      orderMap.has(rule.id) ? { ...rule, order: orderMap.get(rule.id) as number } : rule,
    ),
  );
}

/* ---------------- 规则导入导出 ---------------- */
const fileInput = ref<HTMLInputElement | null>(null);

/** 导出规则 JSON（结构即 CategoryRule[]） */
function exportRules(): void {
  const blob = new Blob([JSON.stringify(props.rules, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'bookvault-rules.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** 导入规则：校验 type 枚举、pattern 非空、category 非空（C1） */
async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    if (!Array.isArray(parsed)) throw new Error('errRuleImportInvalid');
    const valid: CategoryRule[] = [];
    for (const item of parsed as Array<Partial<CategoryRule>>) {
      if (!item || typeof item.pattern !== 'string' || !item.pattern.trim()) continue;
      if (!item.type || !RULE_TYPE_ORDER.includes(item.type)) continue;
      if (typeof item.category !== 'string' || !item.category.trim()) continue;
      valid.push({
        id: typeof item.id === 'string' && item.id ? item.id : uid('rule-'),
        type: item.type,
        pattern: item.pattern.trim(),
        category: item.category.trim(),
        enabled: item.enabled !== false,
        order: typeof item.order === 'number' ? item.order : valid.length + 1,
      });
    }
    if (valid.length === 0) throw new Error('errRuleImportInvalid');
    await persist(valid);
    feedback.success(t('ruleImportDone', { count: valid.length }));
  } catch (err) {
    feedback.error(translateError(err instanceof Error ? err.message : undefined));
  }
}

/* ---------------- 分类预览（C2，仅当前会话内存） ---------------- */
const preview = ref<ClassificationPreviewItem[] | null>(null);
const dragItemId = ref<string | null>(null);

const impact = computed(() => {
  if (!preview.value || !props.tree) return null;
  return computeImpact(
    props.tree,
    preview.value.map((item) => ({ bookmarkId: item.bookmarkId, category: item.category })),
  );
});

const previewGroups = computed(() => {
  const map = new Map<string, ClassificationPreviewItem[]>();
  for (const item of preview.value ?? []) {
    const list = map.get(item.category);
    if (list) list.push(item);
    else map.set(item.category, [item]);
  }
  return [...map.entries()]
    .map(([category, items]) => ({ category, items }))
    .sort((a, b) => b.items.length - a.items.length || a.category.localeCompare(b.category));
});

function generatePreview(): void {
  preview.value = buildPreview(props.entries, props.rules);
}

function onItemDragStart(item: ClassificationPreviewItem): void {
  dragItemId.value = item.bookmarkId;
}

/** 手动拖拽调整归属（以手动为准，仅存在于当前会话） */
function onDropToCategory(category: string): void {
  const id = dragItemId.value;
  dragItemId.value = null;
  if (!id || !preview.value) return;
  preview.value = preview.value.map((item) =>
    item.bookmarkId === id ? { ...item, category, manual: true } : item,
  );
}

function applyPreview(): void {
  if (!preview.value) return;
  emit(
    'apply',
    preview.value.map((item) => ({ bookmarkId: item.bookmarkId, category: item.category })),
  );
}

/** 预览生成前的规则命中说明（C2：查看命中哪条规则） */
function ruleName(ruleId: string | null): string {
  if (!ruleId) return t('noRuleMatched');
  const rule = props.rules.find((item) => item.id === ruleId);
  if (!rule) return t('noRuleMatched');
  return `${t(typeLabels[rule.type])}: ${rule.pattern}`;
}
</script>

<template>
  <section class="bv-rules bv-scroll">
    <header class="bv-rules__head">
      <h2 class="bv-section-title">{{ t('rulesTitle') }}</h2>
      <div class="bv-row">
        <button class="bv-btn" type="button" @click="startCreate">
          {{ t('actionNewRule') }}
        </button>
        <button class="bv-btn" type="button" @click="exportRules">
          {{ t('actionExportRules') }}
        </button>
        <button class="bv-btn" type="button" @click="fileInput?.click()">
          {{ t('actionImportRules') }}
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          hidden
          @change="onFileChange"
        />
      </div>
    </header>

    <p class="bv-hint">{{ t('rulesPriorityHint') }}</p>

    <form
      v-if="editingId"
      class="bv-card bv-rules__form"
      @submit.prevent="submit"
    >
      <div class="bv-row">
        <label class="bv-rules__field">
          <span class="bv-hint">{{ t('fieldRuleType') }}</span>
          <select v-model="form.type" class="bv-select">
            <option v-for="type in RULE_TYPE_ORDER" :key="type" :value="type">
              {{ t(typeLabels[type]) }}
            </option>
          </select>
        </label>
        <label class="bv-rules__field bv-rules__field--grow">
          <span class="bv-hint">{{ t('fieldRulePattern') }}</span>
          <input v-model="form.pattern" class="bv-input" type="text" :placeholder="t('rulePatternPlaceholder')" />
        </label>
        <label class="bv-rules__field">
          <span class="bv-hint">{{ t('fieldRuleCategory') }}</span>
          <input
            v-model="form.category"
            class="bv-input"
            type="text"
            list="bv-category-options"
            :placeholder="t('ruleCategoryPlaceholder')"
          />
          <datalist id="bv-category-options">
            <option v-for="name in categoryOptions" :key="name" :value="name" />
          </datalist>
        </label>
        <label class="bv-row bv-rules__field">
          <input v-model="form.enabled" type="checkbox" />
          <span class="bv-hint">{{ t('fieldEnabled') }}</span>
        </label>
      </div>
      <div class="bv-row">
        <span class="bv-spacer" />
        <button class="bv-btn" type="button" @click="cancelEdit">{{ t('actionCancel') }}</button>
        <button class="bv-btn bv-btn--primary" type="submit">{{ t('actionSave') }}</button>
      </div>
    </form>

    <div v-for="group in grouped" :key="group.type" class="bv-card bv-rules__group">
      <h3 class="bv-rules__group-title">
        {{ t(typeLabels[group.type]) }}
        <span class="bv-chip">{{ group.rules.length }}</span>
      </h3>
      <p v-if="group.rules.length === 0" class="bv-hint">{{ t('rulesGroupEmpty') }}</p>
      <ul v-else class="bv-rules__list">
        <li
          v-for="rule in group.rules"
          :key="rule.id"
          class="bv-rules__row"
          :class="{ 'is-disabled': !rule.enabled }"
          draggable="true"
          @dragstart="onDragStart(rule)"
          @dragover.prevent
          @drop.prevent="onDrop(rule)"
        >
          <span class="bv-rules__handle" :title="t('rulesDragHint')">⠿</span>
          <span class="bv-rules__pattern" :title="rule.pattern">{{ rule.pattern }}</span>
          <span class="bv-chip bv-chip--primary">{{ rule.category }}</span>
          <span class="bv-hint">#{{ rule.order }}</span>
          <span class="bv-spacer" />
          <button class="bv-btn bv-btn--sm" type="button" @click="toggleEnabled(rule)">
            {{ rule.enabled ? t('actionDisable') : t('actionEnable') }}
          </button>
          <button class="bv-btn bv-btn--sm" type="button" @click="startEdit(rule)">
            {{ t('actionEdit') }}
          </button>
          <button class="bv-btn bv-btn--sm bv-btn--danger" type="button" @click="removeRule(rule)">
            {{ t('actionDelete') }}
          </button>
        </li>
      </ul>
    </div>

    <div class="bv-card">
      <div class="bv-row">
        <h3 class="bv-section-title" style="margin: 0">{{ t('classifyPreviewTitle') }}</h3>
        <span class="bv-spacer" />
        <button class="bv-btn" type="button" @click="generatePreview">
          {{ t('actionGeneratePreview') }}
        </button>
        <button
          class="bv-btn bv-btn--primary"
          type="button"
          :disabled="!preview || preview.length === 0"
          @click="applyPreview"
        >
          {{ t('actionApplyClassify') }}
        </button>
      </div>

      <p class="bv-hint">{{ t('classifyPreviewHint') }}</p>

      <p v-if="preview && impact" class="bv-rules__impact">
        {{ t('classifyImpact', { total: preview.length, folders: impact.removedFolders }) }}
      </p>

      <div v-if="preview" class="bv-rules__preview">
        <div
          v-for="group in previewGroups"
          :key="group.category"
          class="bv-rules__bucket"
          @dragover.prevent
          @drop.prevent="onDropToCategory(group.category)"
        >
          <header class="bv-rules__bucket-head">
            <span>{{ group.category }}</span>
            <span class="bv-chip">{{ group.items.length }}</span>
          </header>
          <ul class="bv-rules__bucket-list">
            <li
              v-for="item in group.items"
              :key="item.bookmarkId"
              class="bv-rules__item"
              :class="{ 'is-manual': item.manual }"
              draggable="true"
              :title="`${ruleName(item.ruleId)}`"
              @dragstart="onItemDragStart(item)"
            >
              <span class="bv-rules__item-title">{{ item.title }}</span>
              <span v-if="item.manual" class="bv-chip bv-chip--suspect">{{ t('classifyManual') }}</span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.bv-rules {
  display: flex;
  flex-direction: column;
  gap: var(--bv-space-3);
  padding: var(--bv-space-4);
  height: 100%;
  overflow: auto;
}

.bv-rules__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.bv-rules__form {
  display: flex;
  flex-direction: column;
  gap: var(--bv-space-3);
}

.bv-rules__field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 140px;
}

.bv-rules__field--grow {
  flex: 1;
}

.bv-rules__group-title {
  display: flex;
  gap: var(--bv-space-2);
  align-items: center;
  margin-bottom: var(--bv-space-2);
  font-size: var(--bv-font-size-sm);
  font-weight: 600;
}

.bv-rules__list {
  padding: 0;
  margin: 0;
  list-style: none;
}

.bv-rules__row {
  display: flex;
  gap: var(--bv-space-2);
  align-items: center;
  padding: 5px var(--bv-space-1);
  border-bottom: 1px solid var(--bv-border);
}

.bv-rules__row.is-disabled {
  opacity: 0.55;
}

.bv-rules__handle {
  color: var(--bv-text-tertiary);
  cursor: grab;
  user-select: none;
}

.bv-rules__pattern {
  overflow: hidden;
  max-width: 320px;
  font-family: var(--bv-font-mono);
  font-size: var(--bv-font-size-xs);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bv-rules__impact {
  margin-top: var(--bv-space-2);
  color: var(--bv-suspect);
  font-size: var(--bv-font-size-sm);
}

.bv-rules__preview {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--bv-space-2);
  margin-top: var(--bv-space-3);
}

.bv-rules__bucket {
  min-height: 80px;
  border: 1px dashed var(--bv-border-strong);
  border-radius: var(--bv-radius-sm);
}

.bv-rules__bucket-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px var(--bv-space-2);
  font-size: var(--bv-font-size-sm);
  background: var(--bv-surface-sunken);
  border-bottom: 1px solid var(--bv-border);
}

.bv-rules__bucket-list {
  max-height: 200px;
  padding: var(--bv-space-1);
  margin: 0;
  overflow: auto;
  list-style: none;
}

.bv-rules__item {
  display: flex;
  gap: var(--bv-space-1);
  align-items: center;
  justify-content: space-between;
  padding: 3px var(--bv-space-1);
  font-size: var(--bv-font-size-xs);
  cursor: grab;
  border-radius: var(--bv-radius-sm);
}

.bv-rules__item:hover {
  background: var(--bv-surface-hover);
}

.bv-rules__item.is-manual {
  background: var(--bv-suspect-soft);
}

.bv-rules__item-title {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
