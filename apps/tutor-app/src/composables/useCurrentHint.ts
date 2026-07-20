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
 * 获取当前最佳学生回复提示。
 *
 * 退化顺序：
 * 1. 最近助教消息中的 studentReplyHints（学生口吻、贴合当前对话）
 * 2. 最近助教消息中的 vocabularySentences（教学例句）
 * 3. 最近助教消息中的 vocabulary（词列表）
 * 4. 空字符串
 */
export function useCurrentHint(options: UseCurrentHintOptions) {
  const suggestedPhrase = computed(() => {
    const messages = unref(options.messages)
    const targetWords = unref(options.targetWords)
    const wordsLearned = unref(options.wordsLearned)
    const hintOptions = { targetWords, wordsLearned }

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if (msg.role !== 'assistant') continue

      if (msg.studentReplyHints?.length) {
        const picked = pickBestStudentHint(msg.studentReplyHints, hintOptions)
        if (picked) return picked
      }

      if (msg.vocabularySentences?.length) {
        const picked = pickBestStudentHint(msg.vocabularySentences, hintOptions)
        if (picked) return picked
      }

      if (msg.vocabulary?.length) {
        return msg.vocabulary.join(', ')
      }
    }

    return undefined
  })

  return { suggestedPhrase }
}
