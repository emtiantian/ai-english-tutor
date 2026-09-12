<template>
  <div ref="containerEl" class="chat-messages-container">
    <div
      v-for="msg in messages"
      v-show="msg.visible !== false"
      :key="msg.id"
      class="bubble-base animate-message-in"
      :class="msg.role === 'user' ? 'bubble-user' : 'bubble-assistant'"
    >
      <span>{{ msg.text }}</span>
      <span v-if="msg.isStreaming" class="animate-blink">▊</span>
      <!-- 语音转写 -->
      <div v-if="msg.transcript && msg.text === '[语音]'" class="voice-transcript">
        {{ msg.transcript }}
      </div>
      <!-- 中文翻译（由「中」按钮切换） -->
      <div v-if="msg.textZh && expandedZh.has(msg.id)" class="zh-translation">
        {{ msg.textZh }}
      </div>
      <!-- 重听按钮组 -->
      <div v-if="msg.role === 'assistant' && !msg.isStreaming" class="replay-group">
        <button
          class="replay-btn"
          :class="{ 'replay-btn--playing': isPlaying }"
          :disabled="isPlaying"
          title="重听英文"
          @click="$emit('replay', msg.id)"
        >
          <svg
            class="replay-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M11 5L6 9H2v6h4l5 4V5z" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        </button>
        <button
          v-if="msg.textZh"
          class="replay-btn replay-btn--zh"
          :class="{ 'replay-btn--zh-active': expandedZh.has(msg.id) }"
          :title="expandedZh.has(msg.id) ? '隐藏中文' : '显示中文翻译'"
          @click="toggleZh(msg.id)"
        >
          <span class="zh-text">中</span>
        </button>
      </div>
      <!-- 生词标签 -->
      <div v-if="msg.vocabulary?.length" class="vocab-tags">
        <span class="vocab-label">
          <svg
            class="vocab-label-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
          生词
        </span>
        <span v-for="(word, idx) in msg.vocabulary" :key="word" class="vocab-item">
          <button class="vocab-tag" title="点击朗读" @click="$emit('speak-word', word)">
            <svg
              class="vocab-speak-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M11 5L6 9H2v6h4l5 4V5z" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
            {{ word }}
          </button>
          <button
            class="vocab-detail-btn"
            title="查看详细说明"
            @click="$emit('word-detail', { word, sentence: msg.vocabularySentences?.[idx] })"
          >
            详细
          </button>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { ChatMessage } from '../stores/tutor'

const props = defineProps<{
  messages: ChatMessage[]
  isPlaying: boolean
}>()

defineEmits<{
  replay: [messageId: string]
  'speak-word': [word: string]
  'word-detail': [payload: { word: string; sentence?: string }]
}>()

const containerEl = ref<HTMLDivElement | null>(null)

// 中文按钮：在英文气泡下方显示/隐藏 textZh 翻译（不再走语音）
const expandedZh = ref<Set<string>>(new Set())
function toggleZh(messageId: string) {
  const next = new Set(expandedZh.value)
  if (next.has(messageId)) {
    next.delete(messageId)
  } else {
    next.add(messageId)
  }
  expandedZh.value = next
}

// 新消息到达时自动滚动到底部
watch(
  () => props.messages.length,
  async () => {
    await nextTick()
    if (containerEl.value) {
      containerEl.value.scrollTop = containerEl.value.scrollHeight
    }
  }
)
</script>

<style scoped>
.chat-messages-container {
  position: absolute;
  top: 20px;
  left: 20px;
  right: 20px;
  bottom: 0;
  max-height: calc(100% - 40px);
  overflow-y: auto;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none; /* Allow clicks to pass through to canvas below */
  scrollbar-width: none;
  -ms-overflow-style: none;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  min-height: 0;
  /* 为底部固定输入栏预留空间。
     输入栏：约 64px 基础 + 场景区约 90px + 生词区约 50px + 安全区约 34px
     最坏情况下约 240px。用 padding-bottom 让消息滚动到输入栏上方。 */
  padding-bottom: 240px;
  box-sizing: border-box;
}
.chat-messages-container::-webkit-scrollbar {
  display: none;
}

/* 气泡基础样式 */
.bubble-base {
  max-width: 80%;
  min-width: 0;
  padding: 10px 14px;
  border-radius: 16px;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
  overflow-wrap: break-word;
  color: white;
  pointer-events: auto; /* Re-enable pointer events for bubbles (replay buttons etc.) */
  flex: none;
}

.voice-transcript {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.55);
  word-break: break-word;
}

/* 显示在英文下方的中文翻译 */
.zh-translation {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed rgba(255, 255, 255, 0.15);
  font-size: 13px;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.75);
  word-break: break-word;
}

.bubble-user {
  align-self: flex-end;
  background: rgba(59, 130, 246, 0.55);
  border-bottom-right-radius: 4px;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.2);
}

.bubble-assistant {
  align-self: flex-start;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-bottom-left-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

@media (max-width: 768px) {
  .chat-messages-container {
    max-height: calc(100% - 40px);
    padding-bottom: 200px;
    left: 12px;
    right: 12px;
  }
  .bubble-base {
    max-width: 85%;
  }
}

/* 重听按钮组 */
.replay-group {
  display: inline-flex;
  gap: 6px;
  margin-left: 8px;
  vertical-align: middle;
}

.replay-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.2s ease;
  color: rgba(255, 255, 255, 0.7);
  pointer-events: auto;
}

.replay-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  transform: scale(1.1);
}

.replay-btn:active {
  transform: scale(0.95);
}

.replay-btn--playing {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}

/* 中文翻译切换按钮 */
.replay-btn--zh {
  background: rgba(255, 100, 100, 0.15);
  font-size: 12px;
  font-weight: 600;
}

.replay-btn--zh:hover {
  background: rgba(255, 100, 100, 0.3);
}

.replay-btn--zh-active {
  background: rgba(255, 100, 100, 0.45);
  color: white;
}

.replay-btn--zh .zh-text {
  font-size: 13px;
  line-height: 1;
}

.replay-icon {
  width: 16px;
  height: 16px;
}

/* 生词标签 */
.vocab-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.vocab-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 500;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.vocab-label-icon {
  width: 12px;
  height: 12px;
}

.vocab-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.vocab-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(59, 130, 246, 0.2));
  color: rgba(255, 255, 255, 0.95);
  font-size: 13px;
  font-weight: 500;
  border: 1px solid rgba(59, 130, 246, 0.4);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  pointer-events: auto;
}

.vocab-tag:hover {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.4), rgba(59, 130, 246, 0.3));
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
}

.vocab-speak-icon {
  width: 12px;
  height: 12px;
  opacity: 0.75;
}

.vocab-detail-btn {
  padding: 3px 8px;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  pointer-events: auto;
}

.vocab-detail-btn:hover {
  background: rgba(255, 255, 255, 0.18);
  color: white;
}
</style>
