<template>
  <div class="level-result">
    <!-- Background overlay -->
    <div class="overlay" />

    <!-- Result card -->
    <div class="result-card">
      <h2 class="title">选择你的英语水平</h2>

      <!-- Level display -->
      <div class="level-display animate-scale">
        <span class="level-number">{{ selectedLevel }}</span>
        <span class="level-label">{{ levelName }}</span>
      </div>

      <!-- Level description -->
      <p class="description animate-fade-1">
        {{ levelDescription }}
      </p>

      <!-- Manual adjustment -->
      <div class="adjustment animate-fade-2">
        <div class="level-buttons">
          <button
            v-for="l in 5"
            :key="l"
            class="level-btn"
            :class="{ 'selected': selectedLevel === l }"
            @click="selectedLevel = l"
          >
            {{ levelNames[l] }}
          </button>
        </div>
      </div>

      <!-- Confirm button -->
      <button class="confirm-btn animate-fade-3" @click="handleConfirm">
        开始学习
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  level: number
  reason?: string
}>()

const emit = defineEmits<{
  confirm: [level: number]
}>()

const levelNames: Record<number, string> = {
  1: 'A1',
  2: 'A2',
  3: 'B1',
  4: 'B2',
  5: 'C1',
}

const levelFullNames: Record<number, string> = {
  1: 'Beginner',
  2: 'Elementary',
  3: 'Intermediate',
  4: 'Upper-Intermediate',
  5: 'Advanced',
}

const levelDescriptions: Record<number, string> = {
  1: '能理解和使用日常表达，进行简单的交流',
  2: '能完成简单的日常任务，描述周围环境',
  3: '能应对大部分旅行场景，表达个人观点',
  4: '能流利地与人交流，讨论较复杂的话题',
  5: '能灵活运用于社交、学术和职场场景',
}

const selectedLevel = ref(props.level)

const levelName = computed(() => levelFullNames[selectedLevel.value])
const levelDescription = computed(() => levelDescriptions[selectedLevel.value])

function handleConfirm() {
  emit('confirm', selectedLevel.value)
}
</script>

<style scoped>
.level-result {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
}

.overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(12px);
}

.result-card {
  position: relative;
  z-index: 1;
  background: rgba(15, 15, 20, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  padding: 40px 32px;
  max-width: 360px;
  width: 90%;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.title {
  color: rgba(255, 255, 255, 0.9);
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 24px;
}

.level-display {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-bottom: 24px;
}

.level-number {
  font-size: 72px;
  font-weight: 800;
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  line-height: 1;
}

.level-label {
  font-size: 20px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  letter-spacing: 2px;
  text-transform: uppercase;
}

.description {
  color: rgba(255, 255, 255, 0.8);
  font-size: 15px;
  line-height: 1.6;
  margin-bottom: 12px;
}

.adjustment {
  margin-bottom: 28px;
}

.adjustment-label {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
  margin-bottom: 12px;
}

.level-buttons {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.level-btn {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.level-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.level-btn.selected {
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  border-color: transparent;
  color: white;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
}

.confirm-btn {
  width: 100%;
  padding: 14px 24px;
  border-radius: 12px;
  border: none;
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  color: white;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.confirm-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4);
}

.confirm-btn:active {
  transform: translateY(0);
}

/* Animations */
.animate-scale {
  animation: scaleIn 0.5s ease-out;
}

.animate-fade-1 {
  animation: fadeIn 0.5s ease-out 0.3s both;
}

.animate-fade-2 {
  animation: fadeIn 0.5s ease-out 0.5s both;
}

.animate-fade-3 {
  animation: fadeIn 0.5s ease-out 0.7s both;
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.5);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
