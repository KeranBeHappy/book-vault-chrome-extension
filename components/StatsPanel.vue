<script setup lang="ts">
import { computed } from 'vue';

import { t } from '@/modules/i18n';
import type { StatsSummary } from '@/shared/types';

const props = defineProps<{
  stats: StatsSummary | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (event: 'refresh'): void;
}>();

/** 未检测时对应指标显示「—」（A7） */
function metric(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : String(value);
}

const maxCategory = computed(() => {
  const list = props.stats?.categories ?? [];
  return list.reduce((max, item) => Math.max(max, item.count), 0);
});

function barWidth(count: number): string {
  if (maxCategory.value <= 0) return '0%';
  return `${Math.max(4, Math.round((count / maxCategory.value) * 100))}%`;
}
</script>

<template>
  <section class="bv-stats bv-scroll">
    <header class="bv-stats__head">
      <h2 class="bv-section-title">{{ t('statsTitle') }}</h2>
      <button class="bv-btn" type="button" :disabled="loading" @click="emit('refresh')">
        {{ t('actionRecompute') }}
      </button>
    </header>

    <div v-if="!stats" class="bv-empty">{{ t('loading') }}</div>

    <template v-else>
      <div class="bv-stats__grid">
        <div class="bv-card bv-stats__card">
          <span class="bv-stats__value">{{ metric(stats.total) }}</span>
          <span class="bv-stats__label">{{ t('statsTotal') }}</span>
        </div>
        <div class="bv-card bv-stats__card">
          <span class="bv-stats__value">{{ metric(stats.duplicateGroups) }}</span>
          <span class="bv-stats__label">{{ t('statsDuplicates') }}</span>
        </div>
        <div class="bv-card bv-stats__card">
          <span class="bv-stats__value bv-stats__value--danger">{{ metric(stats.dead) }}</span>
          <span class="bv-stats__label">{{ t('statsDead') }}</span>
        </div>
        <div class="bv-card bv-stats__card">
          <span class="bv-stats__value bv-stats__value--suspect">{{ metric(stats.suspect) }}</span>
          <span class="bv-stats__label">{{ t('statsSuspect') }}</span>
        </div>
        <div class="bv-card bv-stats__card">
          <span class="bv-stats__value">{{ metric(stats.emptyFolders) }}</span>
          <span class="bv-stats__label">{{ t('statsEmptyFolders') }}</span>
        </div>
        <div class="bv-card bv-stats__card">
          <span class="bv-stats__value">{{ metric(stats.tagCount) }}</span>
          <span class="bv-stats__label">{{ t('statsTags') }}</span>
        </div>
      </div>

      <div class="bv-card">
        <h3 class="bv-section-title">{{ t('statsCategories') }}</h3>
        <p v-if="stats.categories.length === 0" class="bv-hint">{{ t('statsNoCategories') }}</p>
        <ul v-else class="bv-stats__bars">
          <li v-for="item in stats.categories" :key="item.name" class="bv-stats__bar-row">
            <span class="bv-stats__bar-name" :title="item.name">{{ item.name }}</span>
            <span class="bv-stats__bar-track">
              <span class="bv-stats__bar-fill" :style="{ width: barWidth(item.count) }" />
            </span>
            <span class="bv-stats__bar-count">{{ item.count }}</span>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

<style scoped>
.bv-stats {
  display: flex;
  flex-direction: column;
  gap: var(--bv-space-4);
  padding: var(--bv-space-4);
  height: 100%;
  overflow: auto;
}

.bv-stats__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.bv-stats__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--bv-space-3);
}

.bv-stats__card {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bv-stats__value {
  color: var(--bv-primary);
  font-size: 26px;
  font-weight: 600;
  line-height: 1.2;
  font-variant-numeric: tabular-nums;
}

.bv-stats__value--danger {
  color: var(--bv-danger);
}

.bv-stats__value--suspect {
  color: var(--bv-suspect);
}

.bv-stats__label {
  color: var(--bv-text-secondary);
  font-size: var(--bv-font-size-xs);
}

.bv-stats__bars {
  display: flex;
  flex-direction: column;
  gap: var(--bv-space-2);
  padding: 0;
  margin: 0;
  list-style: none;
}

.bv-stats__bar-row {
  display: grid;
  grid-template-columns: 120px 1fr 48px;
  gap: var(--bv-space-2);
  align-items: center;
}

.bv-stats__bar-name {
  overflow: hidden;
  color: var(--bv-text);
  font-size: var(--bv-font-size-sm);
  white-space: nowrap;
  text-overflow: ellipsis;
}

.bv-stats__bar-track {
  height: 8px;
  background: var(--bv-surface-sunken);
  border-radius: var(--bv-radius-sm);
}

.bv-stats__bar-fill {
  display: block;
  height: 100%;
  background: var(--bv-accent);
  border-radius: var(--bv-radius-sm);
}

.bv-stats__bar-count {
  color: var(--bv-text-secondary);
  font-size: var(--bv-font-size-xs);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
