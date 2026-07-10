import type { LLMMessage } from '../../llm.js'
import { LUNA_PERSONA, type CharacterPersona, type OpeningStyle } from '@ai-english-tutor/shared'
import { pickOpeningStyle } from '../shared/persona.js'

/**
 * 为课程开始构建消息。
 *
 * 使用传入的风格（或从角色中固定挑选默认风格）并将人格注入 system prompt。
 */
export function buildLessonStartMessages(
  level: number,
  style?: OpeningStyle,
  persona: CharacterPersona = LUNA_PERSONA,
): { messages: LLMMessage[]; style: OpeningStyle } {
  const chosen = style ?? pickOpeningStyle(persona)

  const messages: LLMMessage[] = [
    { role: 'system', content: persona.buildSystemPrompt(level, chosen.persona) },
    {
      role: 'user',
      content:
        `学生刚刚开始了一节 Level ${level} 的课程。` +
        `${chosen.persona} ` +
        `请用符合该人格的语气热情地欢迎学生（1-2 句话），然后简要介绍今天会学习什么。`,
    },
  ]

  return { messages, style: chosen }
}
