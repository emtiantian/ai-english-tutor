<template>
  <div class="resume-dialog-overlay" @click.self="$emit('cancel')">
    <div class="resume-dialog">
      <div class="scenario-header">
        <span class="scenario-icon">{{ scenario.icon }}</span>
        <div class="scenario-titles">
          <span class="scenario-name">{{ scenario.name }}</span>
          <span class="scenario-name-en">{{ scenario.nameEn }}</span>
        </div>
      </div>

      <div class="resume-badge">
        <span class="badge-icon">⏸️</span>
        <span>未完成的练习</span>
      </div>

      <div class="progress-stats">
        <div class="stat-row">
          <span class="stat-label">当前难度</span>
          <span class="stat-value level-badge">{{ snapshot.level }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">进行轮次</span>
          <span class="stat-value">{{ snapshot.turnsCount }} / {{ snapshot.maxTurns }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">目标词覆盖</span>
          <span class="stat-value">{{ coveragePercent }}</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">剩余时间</span>
          <span class="stat-value" :class="{ 'expiring-soon': hoursLeft <= 2 }">{{
            remainingTimeText
          }}</span>
        </div>
      </div>

      <div class="action-buttons">
        <button class="btn-resume" @click="$emit('resume')">▶️ 继续练习</button>
        <button class="btn-restart" @click="$emit('restart')">🔄 重新开始</button>
        <button class="btn-cancel" @click="$emit('cancel')">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ScenarioPausedSnapshot } from '../lib/scenario-paused-db'

interface ScenarioInfo {
  id: string
  name: string
  nameEn: string
  icon: string
}

const props = defineProps<{
  scenario: ScenarioInfo
  snapshot: ScenarioPausedSnapshot
}>()

defineEmits<{
  resume: []
  restart: []
  cancel: []
}>()

const coveragePercent = computed(() => {
  const total = props.snapshot.targetWords.length
  if (!total) return '0%'
  return `${Math.round((props.snapshot.wordsUsed.length / total) * 100)}%`
})

const hoursLeft = computed(() => {
  const ms = props.snapshot.expiresAt - Date.now()
  return Math.max(0, Math.ceil(ms / 3600000))
})

const remainingTimeText = computed(() => {
  if (hoursLeft.value <= 0) return '已过期'
  if (hoursLeft.value === 1) return '约 1 小时'
  return `约 ${hoursLeft.value} 小时`
})
</script>

<style scoped>
.resume-dialog-overlay {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(12px);
}

.resume-dialog {
  width: 100%;
  max-width: 340px;
  background: rgba(20, 20, 30, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  padding: 24px;
}

.scenario-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.scenario-icon {
  font-size: 40px;
}

.scenario-titles {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.scenario-name {
  color: white;
  font-size: 18px;
  font-weight: 600;
}

.scenario-name-en {
  color: rgba(255, 255, 255, 0.5);
  font-size: 12px;
}

.resume-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 16px;
  margin-bottom: 20px;
  background: rgba(251, 191, 36, 0.12);
  border: 1px solid rgba(251, 191, 36, 0.25);
  border-radius: 12px;
  color: #fbbf24;
  font-size: 14px;
  font-weight: 500;
}

.badge-icon {
  font-size: 16px;
}

.progress-stats {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.stat-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
}

.stat-label {
  color: rgba(255, 255, 255, 0.55);
}

.stat-value {
  color: rgba(255, 255, 255, 0.9);
  font-weight: 500;
}

.level-badge {
  padding: 2px 10px;
  background: rgba(99, 102, 241, 0.2);
  border: 1px solid rgba(99, 102, 241, 0.35);
  border-radius: 6px;
  color: #a5b4fc;
  font-size: 12px;
  font-weight: 700;
}

.expiring-soon {
  color: #fca5a5;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.btn-resume,
.btn-restart,
.btn-cancel {
  width: 100%;
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-resume {
  background: linear-gradient(135deg, #4ade80, #22d3ee);
  border: none;
  color: white;
}

.btn-resume:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(74, 222, 128, 0.35);
}

.btn-restart {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.85);
}

.btn-restart:hover {
  background: rgba(255, 255, 255, 0.12);
}

.btn-cancel {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 500;
}

.btn-cancel:hover {
  color: rgba(255, 255, 255, 0.8);
}
</style>
