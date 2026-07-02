<template>
  <div class="word-modal-overlay" @click.self="$emit('close')">
    <div class="word-modal-card" role="dialog" aria-modal="true">
      <!-- Close -->
      <button class="word-modal-close" @click="$emit('close')" title="关闭">×</button>

      <!-- Header -->
      <div class="word-modal-header">
        <div class="word-modal-title-row">
          <span class="word-modal-word">{{ word }}</span>
          <button class="word-modal-speak" @click="$emit('speak')" title="朗读单词">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 5L6 9H2v6h4l5 4V5z"/>
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
            </svg>
          </button>
          <span v-if="explanation?.level" class="word-modal-level">{{ explanation.level }}</span>
        </div>
        <div v-if="explanation?.phonetic" class="word-modal-phonetic">/{{ explanation.phonetic }}/</div>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="word-modal-body">
        <div class="word-skeleton" />
        <div class="word-skeleton word-skeleton--short" />
        <div class="word-skeleton" />
      </div>

      <!-- Error -->
      <div v-else-if="error" class="word-modal-error">
        {{ error }}
      </div>

      <!-- Content -->
      <div v-else-if="explanation" class="word-modal-body">
        <div v-for="(sense, i) in explanation.senses" :key="i" class="word-sense">
          <span class="word-sense-pos">{{ sense.pos }}</span>
          <span class="word-sense-meaning">{{ sense.meaningZh }}</span>
          <div v-if="sense.exampleEn" class="word-sense-example">
            <div class="word-sense-example-en">{{ sense.exampleEn }}</div>
            <div v-if="sense.exampleZh" class="word-sense-example-zh">{{ sense.exampleZh }}</div>
          </div>
        </div>

        <div v-if="explanation.synonyms?.length" class="word-synonyms">
          <span class="word-section-label">近义词</span>
          <span v-for="syn in explanation.synonyms" :key="syn" class="word-synonym-chip">{{ syn }}</span>
        </div>

        <div v-if="explanation.usageNoteZh" class="word-usage-note">
          <span class="word-section-label">用法笔记</span>
          <p>{{ explanation.usageNoteZh }}</p>
        </div>
      </div>

      <!-- Empty fallback -->
      <div v-else class="word-modal-error">
        暂无该词的详细说明。
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WordExplanation } from '../client/types'

defineProps<{
  word: string
  explanation: WordExplanation | null
  loading: boolean
  error: string | null
}>()

defineEmits<{
  close: []
  speak: []
}>()
</script>

<style scoped>
.word-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
}

.word-modal-card {
  position: relative;
  width: 100%;
  max-width: 420px;
  max-height: 80vh;
  overflow-y: auto;
  padding: 24px;
  border-radius: 20px;
  background: linear-gradient(160deg, rgba(30, 41, 59, 0.96), rgba(15, 23, 42, 0.96));
  border: 1px solid rgba(59, 130, 246, 0.35);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  color: rgba(255, 255, 255, 0.92);
}

.word-modal-close {
  position: absolute;
  top: 12px;
  right: 14px;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s ease;
}
.word-modal-close:hover {
  background: rgba(255, 255, 255, 0.18);
  color: white;
}

.word-modal-header {
  margin-bottom: 16px;
  padding-right: 32px;
}

.word-modal-title-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.word-modal-word {
  font-size: 26px;
  font-weight: 700;
  color: white;
  word-break: break-word;
}

.word-modal-speak {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: rgba(59, 130, 246, 0.25);
  color: rgba(255, 255, 255, 0.9);
  cursor: pointer;
  transition: all 0.2s ease;
}
.word-modal-speak:hover {
  background: rgba(59, 130, 246, 0.5);
  transform: scale(1.08);
}
.word-modal-speak svg {
  width: 18px;
  height: 18px;
}

.word-modal-level {
  padding: 2px 10px;
  border-radius: 999px;
  background: rgba(59, 130, 246, 0.3);
  border: 1px solid rgba(59, 130, 246, 0.5);
  font-size: 12px;
  font-weight: 600;
}

.word-modal-phonetic {
  margin-top: 6px;
  font-size: 15px;
  color: rgba(255, 255, 255, 0.6);
}

.word-modal-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.word-sense {
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.word-sense-pos {
  display: inline-block;
  margin-right: 8px;
  padding: 1px 8px;
  border-radius: 6px;
  background: rgba(59, 130, 246, 0.25);
  font-size: 12px;
  font-style: italic;
  color: rgba(191, 219, 254, 0.95);
}

.word-sense-meaning {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.95);
}

.word-sense-example {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed rgba(255, 255, 255, 0.12);
}

.word-sense-example-en {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.85);
  line-height: 1.5;
}

.word-sense-example-zh {
  margin-top: 3px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  line-height: 1.5;
}

.word-section-label {
  display: block;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.45);
}

.word-synonyms {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.word-synonyms .word-section-label {
  width: 100%;
  margin-bottom: 2px;
}

.word-synonym-chip {
  padding: 3px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
}

.word-usage-note p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.75);
}

.word-modal-error {
  padding: 20px 0;
  text-align: center;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
}

.word-skeleton {
  height: 16px;
  border-radius: 6px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.06));
  background-size: 200% 100%;
  animation: word-shimmer 1.4s ease-in-out infinite;
}
.word-skeleton--short {
  width: 60%;
}

@keyframes word-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
</style>
