import type { LLMMessage } from '../../llm.js'
import { LUNA_PERSONA, type CharacterPersona, type OpeningStyle } from '@ai-english-tutor/shared'
import { pickOpeningStyle } from '../shared/persona.js'

/**
 * 为课程开始构建消息。
 */
export function buildLessonStartMessages(
  level: number,
  style?: OpeningStyle,
  persona: CharacterPersona = LUNA_PERSONA,
): { messages: LLMMessage[]; style: OpeningStyle } {
  const chosen = style ?? pickOpeningStyle(persona)

  // 提示词：建议模型在开场时使用与风格匹配的动作
  const motionBlock = chosen.motionHint
    ? `MOTION HINT: For this opening greeting, prefer the "${chosen.motionHint}" motion if it feels natural.`
    : undefined
  // 提示词：建议模型在开场时使用与风格匹配的表情
  const expressionBlock = chosen.expressionHint
    ? `EXPRESSION HINT: For this opening greeting, prefer the "${chosen.expressionHint}" expression.`
    : undefined

  // 提示词：触发课程开场 —— 告诉模型学生刚刚开始一节自由对话英语课，要求用角色身份热情问候、自然开启对话，并简要提及一个练习话题
  const openingUserPrompt =
    `The student has just started a Level ${level} free-form English lesson. ` +
    `Greet them warmly in character, and open the conversation naturally. ` +
    `Keep your greeting to 1-2 sentences. Briefly mention one light topic or skill we can practice today.`

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: persona.buildSystemPrompt(level, chosen.persona, motionBlock, expressionBlock),
    },
    { role: 'user', content: openingUserPrompt },
  ]

  return { messages, style: chosen }
}
