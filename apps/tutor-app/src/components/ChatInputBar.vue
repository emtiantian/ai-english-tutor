<template>
  <div class="input-bar-container">
    <!-- 场景状态条（v2：三段进度 + 换场景 + 目标词抽屉入口） -->
    <ScenarioStatusStrip
      v-if="scenario"
      :level="scenario.level"
      :turns-count="scenario.turnsCount ?? 0"
      :max-turns="scenario.maxTurns ?? 20"
      :words-learned="scenario.wordsLearned"
      :target-words-total="scenario.targetWordsTotal"
      :coverage-rate="scenario.coverageRate"
      @show-target-words="showTargetWords = true"
      @switch-scenario="showSwitchConfirm = true"
    />

    <!-- 💡 学生回复提示（下一回合学习者可以说的话） -->
    <div v-if="scenario && suggestedPhrase" class="scenario-hint">
      <div class="suggested-phrase">💡 {{ suggestedPhrase }}</div>
    </div>

    <!-- 输入栏 -->
    <div class="glass flex items-center gap-8px px-12px py-8px">
      <!-- 模式切换按钮（左侧） -->
      <button
        class="mode-toggle-btn"
        :aria-label="inputMode === 'voice' ? '切换到键盘输入' : '切换到语音输入'"
        @click="toggleInputMode"
      >
        <span class="mode-toggle-icon">{{ inputMode === 'voice' ? '⌨️' : '🎙️' }}</span>
      </button>

      <!-- 语音模式：按住说话按钮 -->
      <button
        v-if="inputMode === 'voice'"
        class="voice-talk-btn"
        :class="{
          'recording': isRecordingLocal,
          'cancelled': isCancelled,
        }"
        aria-label="按住说话"
        :disabled="isEncoding"
        @mousedown="onPointerDown"
        @mousemove="onPointerMove"
        @mouseup="onPointerUp"
        @mouseleave="onPointerLeave"
        @touchstart.prevent="onPointerDown"
        @touchmove="onPointerMove"
        @touchend.prevent="onPointerUp"
        @touchcancel.prevent="onPointerUp"
      >
        {{ isRecordingLocal ? (isCancelled ? '松开 取消发送' : '松开 结束') : '按住 说话' }}
      </button>

      <!-- 键盘模式：文本输入 + 发送按钮 -->
      <template v-else>
        <input
          ref="inputRef"
          v-model="inputText"
          class="input-pill"
          :placeholder="inputPlaceholder"
          inputmode="text"
          enterkeyhint="send"
          autocorrect="off"
          autocomplete="off"
          spellcheck="false"
          @keydown.enter="sendText"
        />

        <button
          class="btn-primary"
          :disabled="!inputText.trim()"
          @click="sendText"
        >
          发送
        </button>
      </template>
    </div>

    <!-- 录音浮层 -->
    <Teleport to="body">
      <div
        v-if="isRecordingLocal"
        class="recording-overlay"
        :class="{ 'cancelled': isCancelled }"
        role="status"
        aria-live="polite"
      >
        <!-- 音量条 -->
        <div class="volume-bars">
          <div
            v-for="i in 5"
            :key="i"
            class="volume-bar"
            :style="{ animationDelay: `${(i - 1) * 0.1}s` }"
          ></div>
        </div>

        <!-- 倒计时文案 -->
        <div class="recording-text">
          录音中... ({{ recordingDuration }}s)
        </div>

        <!-- 提示文案 -->
        <div class="recording-hint">
          {{ isCancelled ? '松开 取消发送' : '上滑取消发送' }}
        </div>
      </div>
    </Teleport>

    <!-- 编码指示器 -->
    <Teleport to="body">
      <div v-if="isEncoding" class="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 px-32px py-16px bg-primary-90 text-white rounded-12px text-16px flex items-center gap-10px animate-fade-in">
        <span class="w-12px h-12px bg-white rounded-full animate-blink"></span>
        处理中...
      </div>
    </Teleport>

    <!-- 目标词抽屉 -->
    <Teleport to="body">
      <TargetWordsPanel
        v-if="showTargetWords && scenario"
        :target-words="scenario.targetWords"
        :words-learned="scenario.wordsLearned"
        :level="scenario.level"
        @close="showTargetWords = false"
      />
    </Teleport>

    <!-- 切换场景确认 -->
    <Teleport to="body">
      <SwitchScenarioConfirm
        v-if="showSwitchConfirm && scenario"
        :turns-count="scenario.turnsCount ?? 0"
        @confirm="handleSwitchScenario"
        @cancel="showSwitchConfirm = false"
      />
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import type { ScenarioProgress } from '../client/types'
import { pickBestStudentHint } from '../lib/hint-picker'
import ScenarioStatusStrip from './ScenarioStatusStrip.vue'
import TargetWordsPanel from './TargetWordsPanel.vue'
import SwitchScenarioConfirm from './SwitchScenarioConfirm.vue'

const props = defineProps<{
  isRecording: boolean
  isEncoding: boolean
  recordingDuration: number
  scenario?: ScenarioProgress | null
  /** 💡 提示的主要来源：学习者口吻的下一句回复建议 */
  studentReplyHints?: string[]
  /** 没有回复提示时 💡 提示的兜底：教学例句 */
  vocabularySentences?: string[]
  lastVocabulary?: string[]
  recordError?: string | null
}>()

const emit = defineEmits<{
  'send-text': [text: string]
  'record-start': []
  'record-stop': []
  'record-cancel': []
  'switch-scenario': []
  'update:record-error': [error: string | null]
}>()

// --- 输入模式状态 ---
type InputMode = 'voice' | 'keyboard'
const inputMode = ref<InputMode>('voice')
const inputText = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

// --- 录音交互状态 ---
const isRecordingLocal = ref(false)
const isCancelled = ref(false)
const startY = ref(0)
const currentY = ref(0)
const CANCEL_THRESHOLD = -80

// --- v2：抽屉 / 确认状态 ---
const showTargetWords = ref(false)
const showSwitchConfirm = ref(false)

function toggleInputMode() {
  inputMode.value = inputMode.value === 'voice' ? 'keyboard' : 'voice'
  if (inputMode.value === 'keyboard') {
    nextTick(() => {
      inputRef.value?.focus()
    })
  }
}

function readClientY(e: MouseEvent | TouchEvent): number {
  if ('touches' in e) {
    return e.touches[0]?.clientY ?? e.changedTouches[0]?.clientY ?? 0
  }
  return e.clientY
}

function resetGestureState() {
  isRecordingLocal.value = false
  isCancelled.value = false
  startY.value = 0
  currentY.value = 0
}

function onPointerDown(e: MouseEvent | TouchEvent) {
  if (props.isEncoding) return
  isRecordingLocal.value = true
  isCancelled.value = false
  startY.value = readClientY(e)
  currentY.value = startY.value
  emit('record-start')
}

function onPointerMove(e: MouseEvent | TouchEvent) {
  if (!isRecordingLocal.value) return
  currentY.value = readClientY(e)
  const deltaY = currentY.value - startY.value
  isCancelled.value = deltaY < CANCEL_THRESHOLD
}

function onPointerUp() {
  if (!isRecordingLocal.value) return
  const wasCancelled = isCancelled.value
  resetGestureState()
  if (wasCancelled) {
    emit('record-cancel')
  } else {
    emit('record-stop')
  }
}

function onPointerLeave() {
  if (!isRecordingLocal.value) return
  // 桌面端：鼠标离开则取消录音
  resetGestureState()
  emit('record-cancel')
}

// --- 文本发送 ---
function sendText() {
  const text = inputText.value.trim()
  if (!text) return
  inputText.value = ''
  emit('send-text', text)
}

// --- 建议话术（💡 提示） ---
const suggestedPhrase = computed(() => {
  const hintOptions = {
    targetWords: props.scenario?.targetWords,
    wordsLearned: props.scenario?.wordsLearned,
  }

  // 主源：LLM 给的"学生下一句"建议（学生口吻、贴合当前对话）
  const hints = props.studentReplyHints
  if (hints && hints.length > 0) {
    const picked = pickBestStudentHint(hints, hintOptions)
    if (picked) return picked
  }

  // 退化 1：LLM 没给 reply hints，但给了 vocabularySentences（教学例句）→ 顶上用
  const sentences = props.vocabularySentences
  if (sentences && sentences.length > 0) {
    const picked = pickBestStudentHint(sentences, hintOptions)
    if (picked) return picked
  }

  // 退化 2：连例句都没有，但有 vocabulary 词列表 → 显示词
  const vocab = props.lastVocabulary
  if (vocab && vocab.length > 0) return vocab.join(', ')

  // 退化 3：什么都没有 → 隐藏（v-if 自动处理）
  return undefined
})

const inputPlaceholder = computed(() => {
  if (props.scenario && suggestedPhrase.value) {
    return '输入你的回复...'
  }
  return '输入英文...'
})

function handleSwitchScenario() {
  showSwitchConfirm.value = false
  emit('switch-scenario')
}

// --- 录音错误处理 ---
watch(() => props.recordError, (err) => {
  if (err) {
    alert(err)
    nextTick(() => emit('update:record-error', null))
  }
})

// --- iOS 键盘处理 ---
function updateBottomOffset() {
  const vv = window.visualViewport
  if (!vv) return
  const offset = window.innerHeight - vv.height - vv.offsetTop
  document.documentElement.style.setProperty('--kb-offset', `${Math.max(0, offset)}px`)
}

onMounted(() => {
  window.visualViewport?.addEventListener('resize', updateBottomOffset)
  window.visualViewport?.addEventListener('scroll', updateBottomOffset)
})

onUnmounted(() => {
  window.visualViewport?.removeEventListener('resize', updateBottomOffset)
  window.visualViewport?.removeEventListener('scroll', updateBottomOffset)
})
</script>

<style scoped>
.input-bar-container {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  width: 92%;
  max-width: 600px;
  bottom: max(16px, calc(16px + var(--kb-offset, 0px)));
  padding-bottom: env(safe-area-inset-bottom, 0px);
}

/* 💡 学生回复提示条（位于状态条和输入栏之间） */
.scenario-hint {
  background: rgba(15, 15, 20, 0.92);
  backdrop-filter: blur(16px);
  padding: 6px 14px 8px;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.suggested-phrase {
  color: rgba(255, 255, 255, 0.45);
  font-size: 11px;
  font-style: italic;
  text-align: center;
  padding-left: 2px;
}

/* 输入栏玻璃效果 */
.glass {
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(12px);
  border-radius: 0 0 16px 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

/* 无场景时圆角处理所有角 */
.input-bar-container:not(:has(.scenario-status-strip)) .glass {
  border-radius: 16px;
}

/* 模式切换按钮 */
.mode-toggle-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: white;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.mode-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.mode-toggle-btn:active {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(0.95);
}

.mode-toggle-icon {
  line-height: 1;
}

/* 语音对讲按钮 */
.voice-talk-btn {
  flex: 1;
  height: 40px;
  border-radius: 20px;
  border: none;
  background: rgba(255, 255, 255, 0.12);
  color: white;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

.voice-talk-btn:hover {
  background: rgba(255, 255, 255, 0.18);
}

.voice-talk-btn:active {
  background: rgba(255, 255, 255, 0.25);
}

.voice-talk-btn.recording {
  background: rgba(239, 68, 68, 0.3);
  color: #fca5a5;
}

.voice-talk-btn.recording:active {
  background: rgba(239, 68, 68, 0.4);
}

.voice-talk-btn.cancelled {
  background: rgba(239, 68, 68, 0.5);
  color: #fecaca;
}

.voice-talk-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 键盘输入 */
.input-pill {
  flex: 1;
  height: 40px;
  padding: 0 16px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.08);
  color: white;
  font-size: 15px;
  outline: none;
}

.input-pill::placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.btn-primary {
  height: 40px;
  padding: 0 20px;
  border-radius: 20px;
  border: none;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
}

/* 录音浮层 */
.recording-overlay {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 20;
  padding: 32px 40px;
  background: rgba(30, 30, 40, 0.95);
  backdrop-filter: blur(16px);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  min-width: 180px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  animation: fadeIn 0.2s ease;
}

.recording-overlay.cancelled {
  background: rgba(60, 20, 20, 0.95);
  border-color: rgba(239, 68, 68, 0.3);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.9);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

/* 音量条 */
.volume-bars {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 4px;
  height: 40px;
}

.volume-bar {
  width: 6px;
  background: linear-gradient(to top, #6366f1, #8b5cf6);
  border-radius: 3px;
  animation: volumeBar 0.8s ease-in-out infinite alternate;
}

.recording-overlay.cancelled .volume-bar {
  background: linear-gradient(to top, #ef4444, #f87171);
  animation: none;
  height: 6px;
}

@keyframes volumeBar {
  0% {
    height: 8px;
  }
  100% {
    height: 36px;
  }
}

/* 音量条错开动画 */
.volume-bar:nth-child(1) { animation-delay: 0s; }
.volume-bar:nth-child(2) { animation-delay: 0.1s; }
.volume-bar:nth-child(3) { animation-delay: 0.2s; }
.volume-bar:nth-child(4) { animation-delay: 0.3s; }
.volume-bar:nth-child(5) { animation-delay: 0.4s; }

.recording-text {
  color: white;
  font-size: 16px;
  font-weight: 500;
}

.recording-hint {
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
}

.recording-overlay.cancelled .recording-hint {
  color: #fca5a5;
}
</style>
