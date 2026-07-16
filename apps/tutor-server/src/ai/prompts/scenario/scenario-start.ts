import type { LLMMessage } from '../../llm.js'
import {
  LUNA_PERSONA,
  type CharacterPersona,
  type CEFRLevel,
  type OpeningStyle,
  type Scenario,
} from '@ai-english-tutor/shared'
import { pickOpeningStyle } from '../shared/persona.js'
import { stripBaseOutputFormat } from './line-reuse.js'
import { buildScenarioContext } from './context-builder.js'
import { buildLineReuseBlock } from './line-reuse.js'

/**
 * 为启动场景化课程构建消息。
 *
 * 向 prompt 注入场景上下文、角色扮演设定和目标。
 */
export function buildScenarioStartMessages(
  scenario: Scenario,
  level: number,
  targetLevel: CEFRLevel,
  style?: OpeningStyle,
  persona: CharacterPersona = LUNA_PERSONA,
  reusableLines?: string[],
  targetWords?: string[],
): { messages: LLMMessage[]; style: OpeningStyle } {
  const chosen = style ?? pickOpeningStyle(persona)
  // 剥离基础 OUTPUT FORMAT —— 场景上下文会提供自己的格式
  let systemPrompt = stripBaseOutputFormat(persona.buildSystemPrompt(level, chosen.persona))

  // v2：优先使用运行时目标词；没有则回退到静态 scenario.targetWords
  const words = targetWords && targetWords.length > 0 ? targetWords : scenario.targetWords
  // 注入场景上下文（包含它自己的 OUTPUT FORMAT）
  systemPrompt += buildScenarioContext(scenario, targetLevel, words, { currentActIndex: 0 })
  systemPrompt += buildLineReuseBlock(reusableLines)

  // 提示词：场景开场触发 —— 告诉模型学生正在开始一个角色扮演场景，要求以角色身份自然开启场景、介绍背景和角色，不要解释学习目标
  const scenarioOpeningPrompt =
    `The student is starting a role-play scenario: "${scenario.nameEn}" at CEFR level ${targetLevel}. ` +
    `Setting: ${scenario.setting} ` +
    `Please open the scene naturally in character, introduce the background and the role you are playing. ` +
    `Do NOT explain learning objectives — start the conversation as if this is really happening.`

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: scenarioOpeningPrompt },
  ]

  return { messages, style: chosen }
}
