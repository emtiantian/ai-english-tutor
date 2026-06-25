<template>
  <div class="scenario-complete">
    <div class="complete-content">
      <div class="celebration-icon">{{ resultIcon }}</div>
      <h2 class="complete-title">{{ resultTitle }}</h2>

      <div class="scenario-info">
        <span class="scenario-icon">{{ scenario.icon }}</span>
        <div class="scenario-titles">
          <span class="scenario-name">{{ scenario.name }}</span>
          <span class="scenario-level">难度 {{ scenario.level ?? 'A1' }}</span>
        </div>
      </div>

      <!-- Star rating -->
      <div class="stars-row" :title="`${displayStars} / 5 星`">
        <span
          v-for="i in 5"
          :key="i"
          class="star"
          :class="{ 'filled': i <= displayStars, 'empty': i > displayStars }"
        >
          ★
        </span>
      </div>

      <div class="stats-grid">
        <div class="stat-item">
          <span class="stat-value">{{ scenario.turnsCount ?? 0 }}</span>
          <span class="stat-label">对话轮次</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">{{ wordsUsedCount }}/{{ scenario.targetWordsTotal }}</span>
          <span class="stat-label">掌握词汇</span>
        </div>
      </div>

      <div class="words-section">
        <h3 class="words-title">本场景学到的词汇</h3>
        <div class="words-list">
          <span
            v-for="word in wordsUsed"
            :key="word"
            class="word-tag"
          >
            {{ word }}
          </span>
          <span v-if="wordsUsed.length === 0" class="words-empty">暂无</span>
        </div>
      </div>

      <div class="action-buttons">
        <!-- 未达标：重试当前档 -->
        <button
          v-if="resultState === 'retry'"
          class="btn-retry"
          @click="$emit('retry')"
        >
          🔄 重试当前档
        </button>

        <!-- 已达标且未封顶：挑战下一档 -->
        <button
          v-else-if="resultState === 'challenge'"
          class="btn-challenge"
          @click="$emit('challenge')"
        >
          ⚡ 挑战下一档
        </button>

        <!-- 已封顶 -->
        <button
          v-else-if="resultState === 'capped'"
          class="btn-capped"
          disabled
        >
          🏆 已封顶
        </button>

        <button class="btn-next" @click="$emit('next')">
          返回场景列表 →
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ScenarioProgress } from '../client/types'

const props = defineProps<{
  scenario: ScenarioProgress
  /** 是否已经通关最高档（C2），由调用方根据 store 进度计算 */
  isCapped?: boolean
}>()

const emit = defineEmits<{
  retry: []
  challenge: []
  next: []
}>()

type ResultState = 'retry' | 'challenge' | 'capped'

const stars = computed(() => props.scenario.stars ?? 0)

const displayStars = computed(() => {
  // stars 字段只有 0/3/4/5 四种合法值；0 星显示 0 颗点亮
  return stars.value
})

const resultState = computed<ResultState>(() => {
  if (stars.value < 3) return 'retry'
  return props.isCapped ? 'capped' : 'challenge'
})

const resultTitle = computed(() => {
  if (resultState.value === 'retry') return '还差一点点'
  if (resultState.value === 'capped') return '恭喜通关！'
  return '场景完成！'
})

const resultIcon = computed(() => {
  if (resultState.value === 'retry') return '💪'
  if (resultState.value === 'capped') return '🏆'
  return '🎉'
})

const wordsUsed = computed(() =>
  props.scenario.summary?.wordsUsed ?? props.scenario.wordsLearned ?? [],
)

const wordsUsedCount = computed(() => wordsUsed.value.length)
</script>

<style scoped>
.scenario-complete {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(16px);
}

.complete-content {
  text-align: center;
  max-width: 360px;
  width: 100%;
}

.celebration-icon {
  font-size: 48px;
  margin-bottom: 12px;
  animation: bounce 0.6s ease;
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-12px); }
}

.complete-title {
  color: white;
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 16px;
}

.scenario-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 16px;
}

.scenario-icon {
  font-size: 32px;
}

.scenario-titles {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.scenario-name {
  color: rgba(255, 255, 255, 0.9);
  font-size: 18px;
  font-weight: 500;
}

.scenario-level {
  color: #a5b4fc;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 8px;
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.25);
  border-radius: 6px;
}

.stars-row {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-bottom: 20px;
}

.star {
  font-size: 32px;
  line-height: 1;
  transition: all 0.3s ease;
}

.star.filled {
  color: #fbbf24;
  text-shadow: 0 0 10px rgba(251, 191, 36, 0.5);
}

.star.empty {
  color: rgba(255, 255, 255, 0.15);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 12px;
}

.stat-value {
  color: white;
  font-size: 20px;
  font-weight: 600;
}

.stat-label {
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
}

.words-section {
  margin-bottom: 24px;
}

.words-title {
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  font-weight: 500;
  margin: 0 0 12px;
}

.words-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
}

.word-tag {
  padding: 4px 12px;
  background: rgba(74, 222, 128, 0.2);
  border: 1px solid rgba(74, 222, 128, 0.3);
  border-radius: 16px;
  color: #4ade80;
  font-size: 13px;
}

.words-empty {
  color: rgba(255, 255, 255, 0.4);
  font-size: 13px;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.btn-retry,
.btn-challenge,
.btn-capped,
.btn-next {
  width: 100%;
  padding: 13px 24px;
  border-radius: 24px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-retry {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.9);
}

.btn-retry:hover {
  background: rgba(255, 255, 255, 0.15);
}

.btn-challenge {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  border: none;
  color: white;
}

.btn-challenge:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(251, 191, 36, 0.35);
}

.btn-capped {
  background: linear-gradient(135deg, #4ade80, #22d3ee);
  border: none;
  color: white;
  cursor: default;
}

.btn-next {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.8);
}

.btn-next:hover {
  background: rgba(255, 255, 255, 0.12);
}
</style>
