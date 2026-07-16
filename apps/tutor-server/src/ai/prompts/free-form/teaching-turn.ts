import type { LLMMessage } from '../../llm.js'
import { LUNA_PERSONA, type CharacterPersona, type OpeningStyle } from '@ai-english-tutor/shared'
import type { ReviewWord } from '../../vocab-tracker.js'

/**
 * 为教学对话构建消息。
 *
 * @param reviewWords - 待复习的单词（注入到 system prompt 中）
 */
export function buildTeachingMessages(
  userMessage: string,
  level: number,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  style?: OpeningStyle,
  persona: CharacterPersona = LUNA_PERSONA,
  reviewWords?: ReviewWord[],
): LLMMessage[] {
  const personality = style?.persona
  let systemPrompt = persona.buildSystemPrompt(level, personality)

  if (reviewWords && reviewWords.length > 0) {
    const wordList = reviewWords.map((w) => `"${w.word}"`).join(', ')
    // 提示词：复习指令标题 —— 告诉模型这些单词需要复习，要求自然融入，不要生硬插入
    const reviewHeader = `

Vocabulary review — the student needs practice with these words. Weave them into your response naturally in a fresh context (different from previous turns); do not force them if they do not fit the current situation.`
    // 提示词：复习单词列表 —— 列出具体需要复习的单词
    const reviewWordList = `

Words to review: ${wordList}`
    // 提示词：复习单词输出要求 —— 要求将使用的复习词纳入 vocabulary，并为每个词提供包含该词的例句
    const reviewOutputRequirement = `

When you use a review word, include it in the JSON "vocabulary" field, and provide one example sentence per review word in "vocabularySentences". Each sentence must naturally contain at least one of the words above.`
    const reviewBlock = reviewHeader + reviewWordList + reviewOutputRequirement
    systemPrompt += reviewBlock
  }

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
  ]

  // 添加对话历史（取最近 10 条以控制上下文长度）
  for (const h of history.slice(-10)) {
    messages.push({ role: h.role, content: h.content })
  }

  // 添加当前用户消息
  messages.push({ role: 'user', content: userMessage })

  return messages
}
