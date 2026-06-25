<template>
  <!-- 容器位于右上角；非 live2d 时整个不渲染 -->
  <div
    v-if="providerIsLive2D"
    class="absolute top-10px right-115px z-25"
    :class="{ 'top-50px': showAtLowerPosition }"
  >
    <button
      ref="triggerRef"
      type="button"
      class="glass-sm h-30px px-12px rounded-15px text-white/85 text-12px font-500 flex items-center gap-6px border-none cursor-pointer hover:(bg-white/15) transition-background-300"
      :class="{ 'opacity-60 cursor-wait': isSwitching }"
      :disabled="isSwitching"
      :title="`当前形象: ${currentModel?.displayName ?? currentModelId}`"
      @click="toggleOpen"
    >
      <span>🎭</span>
      <span class="hidden sm:inline">{{ currentModel?.displayName ?? '形象' }}</span>
      <span v-if="isSwitching" class="ml-2px animate-spin">⟳</span>
      <span v-else class="text-10px opacity-70">▾</span>
    </button>

    <!-- 下拉面板 -->
    <Transition name="fade">
      <div
        v-if="isOpen"
        ref="panelRef"
        class="absolute top-36px right-0 w-260px max-h-340px overflow-y-auto rounded-12px backdrop-blur-12px bg-black/65 border border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.4)] p-8px"
      >
        <div class="text-white/60 text-11px px-8px py-4px mb-4px uppercase tracking-wider">
          切换 Live2D 形象
        </div>
        <button
          v-for="model in availableModels"
          :key="model.id"
          type="button"
          class="w-full text-left p-10px rounded-8px bg-transparent border-none cursor-pointer flex items-start gap-10px transition-background-200 hover:(bg-white/10)"
          :class="{ 'bg-primary-80/30 hover:(bg-primary-80/40)': model.id === currentModelId }"
          :disabled="isSwitching"
          @click="onPick(model.id)"
        >
          <span
            class="w-18px h-18px shrink-0 rounded-full border-2 flex items-center justify-center mt-2px"
            :class="model.id === currentModelId ? 'border-primary-80 bg-primary-80' : 'border-white/30'"
          >
            <span
              v-if="model.id === currentModelId"
              class="w-6px h-6px rounded-full bg-white"
            ></span>
          </span>
          <div class="flex-1 min-w-0">
            <div class="text-white text-13px font-500">{{ model.displayName }}</div>
            <div class="text-white/55 text-11px mt-2px truncate">
              {{ model.credit.author }} · {{ shortLicense(model.credit.license) }}
            </div>
          </div>
        </button>
        <div class="text-white/40 text-10px px-8px py-6px mt-4px leading-relaxed border-t border-white/10">
          素材遵循 Live2D Free Material License,仅供个人学习使用。
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { AVAILABLE_LIVE2D_MODELS } from '@ai-english-tutor/shared'

const props = defineProps<{
  /** 当前选中的模型 ID */
  currentModelId: string
  /** 切换中标志 — 切换期间禁用按钮 + 显示 spinner */
  isSwitching: boolean
  /** 显示位置偏移 — 教学态下右上有其他控件,可下移以避免重叠 */
  showAtLowerPosition?: boolean
}>()

const emit = defineEmits<{
  (e: 'switch', modelId: string): void
}>()

/**
 * 当 VITE_CHARACTER_PROVIDER 不是 live2d 时,整个 switcher 隐藏 —
 * spine / rive / svg 不在本计划范围内,后续多 provider 支持时再扩展。
 */
const providerIsLive2D = computed(
  () => (import.meta.env.VITE_CHARACTER_PROVIDER ?? 'live2d') === 'live2d',
)

const availableModels = AVAILABLE_LIVE2D_MODELS

const currentModel = computed(() =>
  availableModels.find((m) => m.id === props.currentModelId),
)

const isOpen = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)
const panelRef: Ref<HTMLDivElement | null> = ref(null)

function toggleOpen() {
  if (props.isSwitching) return
  isOpen.value = !isOpen.value
}

function onPick(modelId: string) {
  isOpen.value = false
  if (modelId === props.currentModelId) return
  emit('switch', modelId)
}

/** 协议名太长会撑爆 UI,只显示简短形式 */
function shortLicense(license: string): string {
  if (license.includes('Live2D Free')) return 'Live2D Free Material'
  return license
}

/** 点击面板外面关闭 */
function onDocumentClick(ev: MouseEvent) {
  if (!isOpen.value) return
  const target = ev.target as Node
  if (panelRef.value?.contains(target)) return
  if (triggerRef.value?.contains(target)) return
  isOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick, true)
})
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
