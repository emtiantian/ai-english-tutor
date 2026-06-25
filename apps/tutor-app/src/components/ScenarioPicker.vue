<template>
  <div class="scenario-picker">
    <div class="scenario-header">
      <h2 class="scenario-title">选择一个场景开始练习 🎯</h2>
      <p class="scenario-subtitle">在真实情境中练习英语，通关后解锁更高难度</p>
    </div>

    <!-- Style Selector -->
    <div class="style-section">
      <span class="style-label">选择语音风格</span>
      <select v-model="localStyle" class="style-select">
        <option value="">🎲 随机风格</option>
        <option value="cheeky-cute">😜 俏皮可爱</option>
        <option value="gentle-warm">🥰 温柔知性</option>
        <option value="energetic-dynamic">💪 元气满满</option>
        <option value="mysterious-curious">🔮 神秘好奇</option>
        <option value="serious-study-buddy">📚 高效利落</option>
        <option value="coach-encouraging">🔥 信念教练</option>
        <option value="surprise-reunion">🎉 惊喜重逢</option>
        <option value="poetic-artistic">🌸 诗意文艺</option>
        <option value="cool-casual">😎 随性自然</option>
        <option value="lazy-mature">🍷 慵懒御姐</option>
        <option value="funny-goofy">🤡 搞笑喜剧</option>
      </select>
    </div>

    <!-- Scenario Grid -->
    <div class="scenario-grid">
      <div
        v-for="scenario in visibleScenarios"
        :key="scenario.id"
        class="scenario-card"
        :class="{ 'selected': selectedScenarioId === scenario.id }"
        @click="handleCardClick(scenario)"
      >
        <!-- Pause badge -->
        <span v-if="pausedSnapshots.get(scenario.id)" class="pause-badge">
          ⏸ 可续玩
        </span>

        <span class="scenario-icon">{{ scenario.icon }}</span>
        <span class="scenario-name">{{ scenario.name }}</span>
        <span class="scenario-name-en">{{ scenario.nameEn }}</span>

        <!-- CEFR progress dots -->
        <div class="level-dots">
          <div
            v-for="level in CEFR_ORDER"
            :key="level"
            class="level-dot-wrapper"
            @click.stop="handleLevelClick(scenario, level)"
          >
            <span
              class="level-dot"
              :class="dotClass(scenario.id, level)"
              :title="dotTitle(scenario.id, level)"
            >
              <span v-if="dotStars(scenario.id, level)" class="dot-star">★</span>
              <span v-if="dotStarCount(scenario.id, level)" class="dot-star-count">
                {{ dotStarCount(scenario.id, level) }}
              </span>
            </span>
            <span class="level-label" :class="{ 'active': isNextLevel(scenario.id, level) }">{{ level }}</span>
          </div>
        </div>

        <!-- Start / Confirm button -->
        <button
          class="enter-button"
          :class="buttonState(scenario.id).variant"
          @click.stop="handleStart(scenario)"
        >
          {{ buttonState(scenario.id).text }}
        </button>
      </div>
    </div>

    <button
      v-if="scenarios.length > INITIAL_COUNT"
      class="btn-toggle"
      @click="showAll = !showAll"
    >
      {{ showAll ? '收起' : `更多场景 (${scenarios.length - INITIAL_COUNT})` }}
      <span class="toggle-arrow" :class="{ 'arrow-up': showAll }">▼</span>
    </button>

    <button class="btn-free-chat" @click="$emit('free-chat', localStyle || undefined)">
      💬 自由对话模式
    </button>

    <!-- Resume dialog -->
    <ScenarioResumeDialog
      v-if="showResumeDialog && activeScenario && activeSnapshot"
      :scenario="activeScenario"
      :snapshot="activeSnapshot"
      @resume="handleResume"
      @restart="handleRestart"
      @cancel="showResumeDialog = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { CEFRLevel } from '@ai-english-tutor/shared'
import type { UserScenarioProgress } from '../client/types'
import type { ScenarioPausedSnapshot } from '../lib/scenario-paused-db'
import ScenarioResumeDialog from './ScenarioResumeDialog.vue'

interface ScenarioInfo {
  id: string
  name: string
  nameEn: string
  icon: string
}

const props = defineProps<{
  scenarios: ScenarioInfo[]
  styleName?: string
  /** 用户的 CEFR 基准档（从 store.currentLevel 映射而来） */
  userLevel: CEFRLevel
  pausedSnapshots: Map<string, ScenarioPausedSnapshot>
  userScenarioProgress: Map<string, UserScenarioProgress>
}>()

const emit = defineEmits<{
  select: [scenarioId: string, options: { styleName?: string; level: CEFRLevel }]
  resume: [snapshot: ScenarioPausedSnapshot, styleName?: string]
  'free-chat': [styleName?: string]
}>()

const CEFR_ORDER: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const INITIAL_COUNT = 4

const showAll = ref(false)
const localStyle = ref(props.styleName ?? 'lazy-mature')
const showResumeDialog = ref(false)
const activeScenario = ref<ScenarioInfo | null>(null)
const activeSnapshot = ref<ScenarioPausedSnapshot | null>(null)

/** 当前选中的场景与难度（先选后确认） */
const selectedScenarioId = ref<string | null>(null)
const selectedLevel = ref<CEFRLevel | null>(null)

const visibleScenarios = computed(() =>
  showAll.value ? props.scenarios : props.scenarios.slice(0, INITIAL_COUNT),
)

function getProgress(scenarioId: string): UserScenarioProgress | undefined {
  return props.userScenarioProgress.get(scenarioId)
}

function getNextLevel(scenarioId: string): CEFRLevel | null {
  const progress = getProgress(scenarioId)
  if (!progress || !progress.highestClearedLevel) return props.userLevel
  const idx = CEFR_ORDER.indexOf(progress.highestClearedLevel)
  if (idx < 0 || idx >= CEFR_ORDER.length - 1) return null
  return CEFR_ORDER[idx + 1]
}

function getEntryLevel(scenarioId: string): CEFRLevel {
  return getNextLevel(scenarioId) ?? 'C2'
}

function isNextLevel(scenarioId: string, level: CEFRLevel): boolean {
  return getNextLevel(scenarioId) === level
}

function isCleared(scenarioId: string, level: CEFRLevel): boolean {
  const stars = getProgress(scenarioId)?.starsByLevel[level]
  return stars !== undefined
}

function dotClass(scenarioId: string, level: CEFRLevel): Record<string, boolean> {
  const next = isNextLevel(scenarioId, level)
  const cleared = isCleared(scenarioId, level)
  const selected = selectedScenarioId.value === scenarioId && selectedLevel.value === level
  return {
    'cleared': cleared,
    'next': next,
    'selected': selected,
  }
}

function dotTitle(scenarioId: string, level: CEFRLevel): string {
  const stars = getProgress(scenarioId)?.starsByLevel[level]
  if (stars) return `${level}：已通关，${stars} 星`
  if (isNextLevel(scenarioId, level)) return `${level}：下一挑战`
  return `${level}：可选`
}

function dotStars(scenarioId: string, level: CEFRLevel): boolean {
  return isCleared(scenarioId, level)
}

function dotStarCount(scenarioId: string, level: CEFRLevel): number | null {
  const stars = getProgress(scenarioId)?.starsByLevel[level]
  if (!stars || stars <= 3) return null
  return stars
}

interface ButtonState {
  text: string
  variant: 'primary' | 'success' | 'completed'
}

function buttonState(scenarioId: string): ButtonState {
  if (props.pausedSnapshots.has(scenarioId)) {
    return { text: '继续', variant: 'success' }
  }
  const progress = getProgress(scenarioId)
  const next = getNextLevel(scenarioId)
  if (selectedScenarioId.value === scenarioId) {
    const level = selectedLevel.value ?? next ?? 'C2'
    if (isCleared(scenarioId, level)) {
      return { text: `开始 ${level}`, variant: 'primary' }
    }
    if (isNextLevel(scenarioId, level)) {
      const isFirst = !progress || !progress.highestClearedLevel
      return {
        text: isFirst ? `开始 ${level}` : `挑战 ${level}`,
        variant: 'primary',
      }
    }
    return { text: `开始 ${level}`, variant: 'primary' }
  }
  if (next) {
    const isFirst = !progress || !progress.highestClearedLevel
    return {
      text: isFirst ? `开始 ${next}` : `挑战 ${next}`,
      variant: 'primary',
    }
  }
  return { text: '重玩 C2', variant: 'completed' }
}

function handleCardClick(scenario: ScenarioInfo) {
  const snapshot = props.pausedSnapshots.get(scenario.id)
  if (snapshot) {
    activeScenario.value = scenario
    activeSnapshot.value = snapshot
    showResumeDialog.value = true
    return
  }
  // 没有暂停快照时，点击卡片只是「选中」，不直接进入
  selectedScenarioId.value = scenario.id
  selectedLevel.value = getEntryLevel(scenario.id)
}

function handleLevelClick(scenario: ScenarioInfo, level: CEFRLevel) {
  // 暂不限制只能选已通关/下一挑战难度，所有 CEFR 档均可点选
  // if (!isCleared(scenario.id, level) && !isNextLevel(scenario.id, level)) return
  selectedScenarioId.value = scenario.id
  selectedLevel.value = level
}

function handleStart(scenario: ScenarioInfo) {
  const level = selectedScenarioId.value === scenario.id
    ? (selectedLevel.value ?? getEntryLevel(scenario.id))
    : getEntryLevel(scenario.id)
  emit('select', scenario.id, { styleName: localStyle.value || undefined, level })
}

function handleResume() {
  if (activeSnapshot.value) {
    emit('resume', activeSnapshot.value, localStyle.value || undefined)
  }
  closeDialog()
}

function handleRestart() {
  if (activeScenario.value && activeSnapshot.value) {
    // 重新开始时保持快照原来的 CEFR 档，避免从暂停的 A2 掉回 A1
    emit('select', activeScenario.value.id, {
      styleName: localStyle.value || undefined,
      level: activeSnapshot.value.level,
    })
  }
  closeDialog()
}

function closeDialog() {
  showResumeDialog.value = false
  activeScenario.value = null
  activeSnapshot.value = null
}
</script>

<style scoped>
.scenario-picker {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(12px);
  overflow-y: auto;
}

.scenario-header {
  text-align: center;
  margin-bottom: 16px;
}

.scenario-title {
  color: white;
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 8px;
}

.scenario-subtitle {
  color: rgba(255, 255, 255, 0.6);
  font-size: 14px;
  margin: 0;
}

.style-section {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
}

.style-label {
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  white-space: nowrap;
}

.style-select {
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  padding: 6px 28px 6px 12px;
  font-size: 14px;
  outline: none;
  backdrop-filter: blur(4px);
  cursor: pointer;
  appearance: none;
  background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12"><path fill="white" d="M6 8L1 3h10z"/></svg>');
  background-repeat: no-repeat;
  background-position: right 8px center;
}

.style-select option {
  background: #1a1a2e;
  color: white;
}

.scenario-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  max-width: 380px;
  width: 100%;
  margin-bottom: 20px;
}

.scenario-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 10px 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.scenario-card:hover {
  background: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.25);
}

.scenario-card.selected {
  background: rgba(99, 102, 241, 0.15);
  border-color: #818cf8;
  box-shadow: 0 0 16px rgba(129, 140, 248, 0.25);
}

.pause-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 3px 7px;
  background: rgba(251, 191, 36, 0.18);
  border: 1px solid rgba(251, 191, 36, 0.35);
  border-radius: 10px;
  color: #fbbf24;
  font-size: 10px;
  font-weight: 600;
}

.scenario-icon {
  font-size: 28px;
  margin-bottom: 2px;
}

.scenario-name {
  color: white;
  font-size: 14px;
  font-weight: 500;
}

.scenario-name-en {
  color: rgba(255, 255, 255, 0.45);
  font-size: 10px;
  margin-bottom: 4px;
}

.level-dots {
  display: flex;
  justify-content: center;
  gap: 6px;
  margin-bottom: 8px;
}

.level-dot-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  cursor: pointer;
}

.level-dot {
  position: relative;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  transition: all 0.2s;
}

.level-dot.next {
  background: rgba(99, 102, 241, 0.12);
  border: 2px solid #818cf8;
  box-shadow: 0 0 8px rgba(129, 140, 248, 0.35);
}

.level-dot.cleared {
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  border: none;
  box-shadow: 0 2px 6px rgba(251, 191, 36, 0.35);
}

.level-dot.selected {
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.6);
  transform: scale(1.1);
}

.dot-star {
  color: white;
  font-size: 12px;
  line-height: 1;
}

.dot-star-count {
  position: absolute;
  bottom: -2px;
  right: -3px;
  min-width: 12px;
  padding: 0 2px;
  background: rgba(0, 0, 0, 0.6);
  border-radius: 6px;
  color: #fbbf24;
  font-size: 8px;
  font-weight: 700;
}

.level-label {
  color: rgba(255, 255, 255, 0.4);
  font-size: 9px;
  font-weight: 600;
}

.level-label.active {
  color: #a5b4fc;
}

.enter-button {
  margin-top: 2px;
  padding: 6px 14px;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: white;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.enter-button.primary {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
}

.enter-button.success {
  background: linear-gradient(135deg, #22c55e, #4ade80);
  color: white;
}

.enter-button.completed {
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.9);
}

.scenario-card:hover .enter-button.primary {
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
}

.scenario-card:hover .enter-button.success {
  box-shadow: 0 4px 12px rgba(34, 197, 94, 0.35);
}

.btn-free-chat {
  padding: 12px 32px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 24px;
  color: rgba(255, 255, 255, 0.8);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-free-chat:hover {
  background: rgba(255, 255, 255, 0.12);
}

.btn-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  margin-bottom: 16px;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 13px;
  cursor: pointer;
  transition: color 0.2s;
}

.btn-toggle:hover {
  color: rgba(255, 255, 255, 0.8);
}

.toggle-arrow {
  font-size: 10px;
  transition: transform 0.3s;
}

.arrow-up {
  transform: rotate(180deg);
}
</style>
