import { computed, unref } from 'vue'
import type { MaybeRef } from 'vue'
import type { ChatMessage } from '../stores/tutor.js'
import { pickBestStudentHint } from '../lib/hint-picker.js'

export interface UseCurrentHintOptions {
  messages: MaybeRef<ChatMessage[]>
  targetWords?: MaybeRef<string[] | undefined>
  wordsLearned?: MaybeRef<string[] | undefined>
}

/**
 * 获取最近一条助手消息提供的可选学生回复提示。
 */
export function useCurrentHint(options: UseCurrentHintOptions) {
  const suggestedPhrases = computed(() => {
    const messages = unref(options.messages)
    const targetWords = unref(options.targetWords)
    const wordsLearned = unref(options.wordsLearned)
    const hintOptions = { targetWords, wordsLearned }

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role !== 'assistant') continue

      if (!msg.studentReplyHints?.length) continue
      const picked = pickBestStudentHint(msg.studentReplyHints, hintOptions)
      const rest = msg.studentReplyHints.filter(hint => hint !== picked)
      return [picked, ...rest].filter((hint): hint is string => Boolean(hint)).slice(0, 3)
    }

    return []
  })

  return { suggestedPhrases }
}
