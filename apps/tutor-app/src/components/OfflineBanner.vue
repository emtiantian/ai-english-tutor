<template>
  <Transition name="slide">
    <div v-if="!isOnline" class="offline-banner">
      <span class="offline-icon">📡</span>
      <span class="offline-text">离线模式 — 可复习已学单词，对话需要网络</span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useOnlineStatus } from '../composables/useOnlineStatus'

const { isOnline } = useOnlineStatus()
</script>

<style scoped>
.offline-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(234, 179, 8, 0.9);
  backdrop-filter: blur(8px);
  color: #1a1a2e;
  font-size: 13px;
  font-weight: 500;
  padding-top: calc(8px + env(safe-area-inset-top, 0px));
}

.offline-icon {
  font-size: 14px;
}

.offline-text {
  font-size: 12px;
}

.slide-enter-active,
.slide-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.slide-enter-from,
.slide-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
