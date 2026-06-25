<template>
  <div class="scenario-status-strip">
    <div class="progress-segments">
      <span class="segment level-badge" :title="`当前难度：${level ?? 'A1'}`">{{ level ?? 'A1' }}</span>
      <span class="segment-divider">·</span>
      <span class="segment" :title="`已进行 ${turnsCount} / ${maxTurns} 轮`">{{ turnsCount }} / {{ maxTurns }} 轮</span>
      <span class="segment-divider">·</span>
      <span class="segment" :title="`目标词覆盖 ${coveragePercent}%`">
        {{ coveragePercent }}% · {{ wordsLearned.length }} / {{ targetWordsTotal }} 词
      </span>
    </div>

    <div class="status-actions">
      <button
        class="status-btn"
        title="查看目标词"
        @click="$emit('show-target-words')"
      >
        📝 目标词
      </button>
      <button
        class="status-btn danger"
        title="切换场景"
        @click="$emit('switch-scenario')"
      >
        ↺ 换场景
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CEFRLevel } from '@ai-english-tutor/shared'

const props = defineProps<{
  level?: CEFRLevel
  turnsCount: number
  maxTurns: number
  wordsLearned: string[]
  targetWordsTotal: number
  coverageRate?: number
}>()

const emit = defineEmits<{
  'show-target-words': []
  'switch-scenario': []
}>()

const coveragePercent = computed(() => {
  if (typeof props.coverageRate === 'number') return Math.round(props.coverageRate * 100)
  if (!props.targetWordsTotal) return 0
  return Math.round((props.wordsLearned.length / props.targetWordsTotal) * 100)
})
</script>

<style scoped>
.scenario-status-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  background: rgba(15, 15, 20, 0.92);
  backdrop-filter: blur(16px);
  border-radius: 16px 16px 0 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: none;
}

.progress-segments {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  min-width: 0;
}

.segment {
  color: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.segment.level-badge {
  padding: 2px 8px;
  background: rgba(99, 102, 241, 0.2);
  border: 1px solid rgba(99, 102, 241, 0.35);
  border-radius: 6px;
  color: #a5b4fc;
  font-size: 11px;
  font-weight: 700;
}

.segment-divider {
  color: rgba(255, 255, 255, 0.3);
  font-size: 12px;
}

.status-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.status-btn {
  padding: 5px 9px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.75);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.status-btn:hover {
  background: rgba(255, 255, 255, 0.14);
}

.status-btn.danger:hover {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.25);
  color: #fca5a5;
}

@media (max-width: 380px) {
  .scenario-status-strip {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .status-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
