<template>
  <div class="switch-confirm-overlay" @click.self="$emit('cancel')">
    <div class="switch-confirm-dialog">
      <div class="dialog-icon">🔄</div>
      <h3 class="dialog-title">切换场景？</h3>

      <p class="dialog-message">
        {{ message }}
      </p>

      <div class="dialog-actions">
        <button class="btn-cancel" @click="$emit('cancel')">取消</button>
        <button class="btn-confirm" @click="$emit('confirm')">确认切换</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    turnsCount: number
    minTurnsForPause?: number
  }>(),
  {
    minTurnsForPause: 6
  }
)

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const willPause = computed(() => props.turnsCount >= props.minTurnsForPause)

const message = computed(() => {
  if (willPause.value) {
    return `当前已进行 ${props.turnsCount} 轮，切换场景会保存进度到浏览器（24 小时内可随时续玩）。`
  }
  return `当前只进行了 ${props.turnsCount} 轮，切换场景将放弃本次进度。`
})
</script>

<style scoped>
.switch-confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
}

.switch-confirm-dialog {
  width: 100%;
  max-width: 320px;
  background: rgba(20, 20, 28, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 20px;
  padding: 24px;
  text-align: center;
  animation: scaleIn 0.2s ease-out;
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

.dialog-icon {
  font-size: 40px;
  margin-bottom: 12px;
}

.dialog-title {
  color: white;
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 12px;
}

.dialog-message {
  color: rgba(255, 255, 255, 0.7);
  font-size: 14px;
  line-height: 1.6;
  margin: 0 0 20px;
}

.dialog-actions {
  display: flex;
  gap: 10px;
}

.btn-cancel,
.btn-confirm {
  flex: 1;
  padding: 11px 16px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.8);
}

.btn-cancel:hover {
  background: rgba(255, 255, 255, 0.12);
}

.btn-confirm {
  background: linear-gradient(135deg, #f59e0b, #ef4444);
  border: none;
  color: white;
}

.btn-confirm:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(239, 68, 68, 0.35);
}
</style>
