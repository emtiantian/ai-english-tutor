<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-20px backdrop-blur-6px"
    role="dialog"
    aria-modal="true"
    aria-labelledby="login-required-title"
    @click.self="$emit('close')"
  >
    <section class="glass w-full max-w-380px p-24px text-center text-white">
      <div
        class="mx-auto mb-16px flex h-52px w-52px items-center justify-center rounded-full bg-primary-20 text-26px"
      >
        🔐
      </div>
      <h2 id="login-required-title" class="m-0 text-20px font-600">登录后继续练习</h2>
      <p class="mb-22px mt-10px text-14px leading-22px text-white/70">
        你已完成 {{ limit }} 轮免费英语练习。登录后可以继续本次对话并保存学习记录。
      </p>
      <button
        type="button"
        class="btn-primary w-full cursor-not-allowed justify-center opacity-60"
        disabled
      >
        登录功能即将开放
      </button>
      <button
        type="button"
        class="mt-12px border-0 bg-transparent px-12px py-6px text-13px text-white/60 hover:text-white"
        @click="$emit('close')"
      >
        稍后再说
      </button>
    </section>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ limit?: number }>(), { limit: 5 })
defineEmits<{ close: [] }>()
</script>
