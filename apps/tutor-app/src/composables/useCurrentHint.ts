import { computed, unref } from 'vue'
import type { MaybeRef } from 'vue'
import type { ChatMessage } from '../stores/tutor.js'
import { pickBestStudentHint } from '../lib/hint-picker.js'
import { findLastAssistantMessage } from '../lib/message-utils.js'

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
    const currentAssistantMessage = findLastAssistantMessage(messages)

    // 提示必须属于当前对话轮次。新一轮 assistant 流式消息创建后还没有提示时，
    // 应先清空上一轮提示，而不是继续向历史记录回退并展示旧内容。
    if (!currentAssistantMessage?.studentReplyHints?.length) return []

    const picked = pickBestStudentHint(currentAssistantMessage.studentReplyHints, hintOptions)
    const rest = currentAssistantMessage.studentReplyHints.filter(hint => hint !== picked)
    return [picked, ...rest].filter((hint): hint is string => Boolean(hint)).slice(0, 3)
  })

  return { suggestedPhrases }
}
