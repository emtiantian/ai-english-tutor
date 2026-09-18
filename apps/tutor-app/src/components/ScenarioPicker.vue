<template>
  <main
    class="absolute inset-0 z-30 flex flex-col items-center justify-safe-center overflow-y-auto bg-black/70 px-16px py-24px backdrop-blur-12px"
  >
    <header class="mb-20px text-center">
      <h1 class="m-0 mb-8px text-22px font-600 text-white">选择一个场景开始练习</h1>
      <p class="m-0 text-14px text-white/60">在真实情境中，用英语完成一段对话</p>
    </header>

    <div class="mb-16px grid w-full max-w-380px grid-cols-2 gap-12px">
      <label class="flex min-w-0 flex-col gap-6px text-13px text-white/70">
        对话难度
        <select
          aria-label="对话难度"
          class="min-w-0 rounded-10px border border-white/15 bg-black/50 px-10px py-9px text-14px text-white outline-none"
          :value="level"
          @change="emit('update:level', Number(($event.target as HTMLSelectElement).value))"
        >
          <option v-for="option in levels" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label class="flex min-w-0 flex-col gap-6px text-13px text-white/70">
        老师音色
        <select
          aria-label="老师音色"
          class="min-w-0 rounded-10px border border-white/15 bg-black/50 px-10px py-9px text-14px text-white outline-none"
          :value="voiceDesign"
          @change="emit('update:voiceDesign', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="voice in voices" :key="voice.value" :value="voice.value">
            {{ voice.label }}
          </option>
        </select>
      </label>
    </div>

    <section class="grid w-full max-w-380px grid-cols-2 gap-12px" aria-label="英语练习场景">
      <button
        v-for="scenario in visibleScenarios"
        :key="scenario.id"
        class="flex min-w-0 cursor-pointer flex-col items-center gap-4px rounded-14px border border-white/15 bg-white/10 px-10px py-14px text-center transition duration-200 hover:(-translate-y-2px border-white/25 bg-white/15)"
        type="button"
        @click="emit('select', scenario.id)"
      >
        <span class="mb-2px text-28px" aria-hidden="true">{{ scenario.icon }}</span>
        <span class="text-15px font-600 text-white">{{ scenario.name }}</span>
        <span class="text-12px text-white/55">{{ scenario.nameEn }}</span>
        <span class="mt-8px rounded-8px bg-primary-80 px-16px py-7px text-13px font-600 text-white">
          开始对话
        </span>
      </button>
    </section>

    <button
      v-if="scenarios.length > INITIAL_COUNT"
      class="mt-16px cursor-pointer border-0 bg-transparent px-12px py-8px text-13px text-white/70"
      type="button"
      @click="showAll = !showAll"
    >
      {{ showAll ? '收起' : `更多场景 (${scenarios.length - INITIAL_COUNT})` }}
    </button>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { ScenarioSummary } from '../client/types.js'

const props = defineProps<{ scenarios: ScenarioSummary[]; voiceDesign: string; level: number }>()
const emit = defineEmits<{
  ready: []
  select: [scenarioId: string]
  'update:voiceDesign': [value: string]
  'update:level': [value: number]
}>()

const levels = [
  { label: 'A1 入门', value: 1 },
  { label: 'A2 初级', value: 2 },
  { label: 'B1 中级', value: 3 },
  { label: 'B2 中高级', value: 4 },
  { label: 'C1-C2 高级', value: 5 }
]

const voices = [
  { label: '温柔清晰', value: '温柔、清晰、自然的成年女性英语教师，语速适中，发音清楚' },
  { label: '活泼明亮', value: '活泼明亮的年轻女性声音，节奏轻快，英语发音清晰自然' },
  { label: '沉稳知性', value: '沉稳知性的成年女性声音，语速稍慢，音色温暖有力量' }
]

const INITIAL_COUNT = 4
const showAll = ref(false)
const visibleScenarios = computed(() =>
  showAll.value ? props.scenarios : props.scenarios.slice(0, INITIAL_COUNT)
)

onMounted(() => emit('ready'))
</script>
