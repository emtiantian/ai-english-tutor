<template>
  <!-- DEV-only 动作/表情调试面板;放在角色下拉框左侧 -->
  <div
    class="absolute top-10px right-220px z-25"
    :class="{ 'top-50px': showAtLowerPosition }"
  >
    <button
      ref="triggerRef"
      type="button"
      class="glass-sm h-30px px-12px rounded-15px text-white/85 text-12px font-500 flex items-center gap-6px border-none cursor-pointer hover:(bg-white/15) transition-background-300"
      title="动作/表情调试面板(仅开发环境)"
      @click="toggleOpen"
    >
      <span>🐛</span>
      <span class="hidden sm:inline">动作</span>
      <span class="text-10px opacity-70">▾</span>
    </button>

    <Transition name="fade">
      <div
        v-if="isOpen"
        ref="panelRef"
        class="absolute top-36px right-0 w-300px max-h-70vh overflow-y-auto rounded-12px backdrop-blur-12px bg-black/75 border border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.4)] p-10px"
      >
        <div class="flex items-center justify-between mb-6px">
          <span class="text-white/60 text-11px uppercase tracking-wider">动作 / 表情调试</span>
          <button
            type="button"
            class="text-white/50 text-11px bg-transparent border-none cursor-pointer hover:text-white/80"
            @click="refresh"
          >↻ 刷新</button>
        </div>

        <!-- 原始动画 -->
        <div class="text-white/45 text-10px mb-4px">原始动画(点击预览 → 告诉我语义)</div>
        <div class="grid grid-cols-3 gap-6px mb-10px">
          <button
            v-for="key in motionKeys"
            :key="key"
            type="button"
            class="px-6px py-8px rounded-8px text-12px border cursor-pointer transition-all-150 truncate"
            :class="lastMotion === key
              ? 'bg-primary-80/40 border-primary-80 text-white'
              : 'bg-white/8 border-white/10 text-white/85 hover:(bg-white/16)'"
            @click="playRaw(key)"
          >{{ key }}</button>
        </div>

        <!-- 语义动作 -->
        <div class="text-white/45 text-10px mb-4px">语义动作(验证当前映射)</div>
        <div class="grid grid-cols-3 gap-6px mb-10px">
          <button
            v-for="m in semanticMotions"
            :key="m"
            type="button"
            class="px-6px py-8px rounded-8px text-12px border cursor-pointer transition-all-150 truncate bg-white/8 border-white/10 text-white/85 hover:(bg-white/16)"
            @click="playSemantic(m)"
          >{{ m }}</button>
        </div>

        <!-- 表情 -->
        <div class="text-white/45 text-10px mb-4px">表情</div>
        <div class="grid grid-cols-3 gap-6px">
          <button
            v-for="e in expressionKeys"
            :key="e"
            type="button"
            class="px-6px py-8px rounded-8px text-12px border cursor-pointer transition-all-150 truncate"
            :class="lastExpression === e
              ? 'bg-primary-80/40 border-primary-80 text-white'
              : 'bg-white/8 border-white/10 text-white/85 hover:(bg-white/16)'"
            @click="setExpr(e)"
          >{{ e }}</button>
        </div>

        <div v-if="lastMotion || lastExpression" class="text-white/55 text-10px mt-8px pt-6px border-t border-white/10">
          <span v-if="lastMotion">动作: <b class="text-white/80">{{ lastMotion }}</b></span>
          <span v-if="lastExpression" class="ml-8px">表情: <b class="text-white/80">{{ lastExpression }}</b></span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { AVAILABLE_MOTIONS, type CharacterProvider } from '@ai-english-tutor/shared'

defineProps<{
  /** 教学态下右上有其他控件,下移避免重叠 */
  showAtLowerPosition?: boolean
}>()

const characterProvider = inject<Ref<CharacterProvider | null>>('characterProvider')

/** Live2D provider 上的调试方法不在 CharacterProvider 接口里,用 loose 类型访问 */
interface DebugProvider {
  listMotionKeys?: () => string[]
  listExpressionKeys?: () => string[]
  playMotion?: (id: string) => void
  setEmotion?: (id: string) => void
}
function provider(): DebugProvider | null {
  return characterProvider?.value as unknown as DebugProvider | null
}

const semanticMotions = AVAILABLE_MOTIONS
const motionKeys = ref<string[]>([])
const expressionKeys = ref<string[]>([])
const lastMotion = ref('')
const lastExpression = ref('')

function refresh() {
  const p = provider()
  motionKeys.value = p?.listMotionKeys?.() ?? []
  expressionKeys.value = p?.listExpressionKeys?.() ?? []
}

function playRaw(key: string) {
  lastMotion.value = key
  provider()?.playMotion?.(key)
}
function playSemantic(m: string) {
  lastMotion.value = `语义:${m}`
  provider()?.playMotion?.(m)
}
function setExpr(e: string) {
  lastExpression.value = e
  provider()?.setEmotion?.(e)
}

const isOpen = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)
const panelRef: Ref<HTMLDivElement | null> = ref(null)

function toggleOpen() {
  isOpen.value = !isOpen.value
  if (isOpen.value) refresh()
}

function onDocumentClick(ev: MouseEvent) {
  if (!isOpen.value) return
  const target = ev.target as Node
  if (panelRef.value?.contains(target)) return
  if (triggerRef.value?.contains(target)) return
  isOpen.value = false
}

onMounted(() => document.addEventListener('click', onDocumentClick, true))
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick, true))
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
