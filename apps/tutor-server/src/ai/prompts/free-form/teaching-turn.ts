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

  // 如果有待复习单词，注入复习指令
  if (reviewWords && reviewWords.length > 0) {
    const wordList = reviewWords.map((w) => `"${w.word}"`).join(', ')
    systemPrompt += `

词汇复习 — 学生需要练习这些单词。请在全新语境（与之前对话不同）中自然地把它们融入回复；不要生硬插入，有机编织即可。若某个词不适合当前情境，可跳过。

需要复习的单词：${wordList}

使用复习词后，请将其纳入 JSON 响应的 "vocabulary" 字段；并在 "vocabularySentences" 中为每个复习词提供一句例句，每句例句必须自然包含至少一个上述复习词。`
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
