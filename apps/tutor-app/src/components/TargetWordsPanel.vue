<template>
  <div class="target-words-overlay" @click.self="$emit('close')">
    <div class="target-words-panel">
      <div class="panel-header">
        <div class="panel-title">
          <span class="title-icon">🎯</span>
          <div class="title-text">
            <span class="main-title">本场景目标词</span>
            <span v-if="level" class="level-badge">{{ level }}</span>
          </div>
        </div>
        <button class="close-btn" aria-label="关闭" @click="$emit('close')">✕</button>
      </div>

      <div class="panel-stats">
        <span class="stat"
          >已掌握 <strong>{{ wordsLearned.length }}</strong> / {{ targetWords.length }}</span
        >
        <span class="stat"
          >覆盖率 <strong>{{ coveragePercent }}%</strong></span
        >
      </div>

      <div class="words-grid">
        <span
          v-for="word in targetWords"
          :key="word"
          class="word-chip"
          :class="{ learned: isLearned(word) }"
        >
          {{ isLearned(word) ? `✓ ${word}` : word }}
        </span>
      </div>

      <div v-if="wordsLearned.length === 0" class="empty-tip">
        还没有命中目标词，试着在对话里用上它们吧～
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CEFRLevel } from '@ai-english-tutor/shared'

const props = defineProps<{
  targetWords: string[]
  wordsLearned: string[]
  level?: CEFRLevel
}>()

const emit = defineEmits<{
  close: []
}>()

const learnedSet = computed(() => new Set(props.wordsLearned.map(w => w.toLowerCase())))

const coveragePercent = computed(() => {
  if (!props.targetWords.length) return 0
  return Math.round((props.wordsLearned.length / props.targetWords.length) * 100)
})

function isLearned(word: string): boolean {
  return learnedSet.value.has(word.toLowerCase())
}
</script>

<style scoped>
.target-words-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.target-words-panel {
  width: 100%;
  max-width: 600px;
  max-height: 75vh;
  overflow-y: auto;
  background: rgba(20, 20, 28, 0.98);
  border-radius: 20px 20px 0 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-bottom: none;
  padding: 20px 16px 24px;
  animation: slideUp 0.25s ease-out;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-icon {
  font-size: 24px;
}

.title-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.main-title {
  color: white;
  font-size: 17px;
  font-weight: 600;
}

.level-badge {
  align-self: flex-start;
  padding: 2px 8px;
  background: rgba(99, 102, 241, 0.2);
  border: 1px solid rgba(99, 102, 241, 0.35);
  border-radius: 6px;
  color: #a5b4fc;
  font-size: 11px;
  font-weight: 700;
}

.close-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 50%;
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.14);
  color: white;
}

.panel-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.stat {
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
}

.stat strong {
  color: rgba(255, 255, 255, 0.9);
  font-weight: 600;
}

.words-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.word-chip {
  padding: 6px 12px;
  border-radius: 14px;
  font-size: 13px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: all 0.2s;
}

.word-chip.learned {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  border-color: transparent;
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.35);
}

.empty-tip {
  margin-top: 16px;
  text-align: center;
  color: rgba(255, 255, 255, 0.45);
  font-size: 13px;
}
</style>
