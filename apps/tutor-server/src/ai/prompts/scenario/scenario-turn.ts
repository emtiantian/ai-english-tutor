import type { LLMMessage } from '../../llm.js'
import {
  LUNA_PERSONA,
  type CharacterPersona,
  type CEFRLevel,
  type OpeningStyle,
  type Scenario,
  type ScenarioLevelProfile
} from '@ai-english-tutor/shared'
import { stripBaseOutputFormat } from './line-reuse.js'
import { buildScenarioContext } from './context-builder.js'

/**
 * 为进行中的场景对话构建消息。
 *
 * 包含场景上下文、当前目标和复习单词。
 */
export function buildScenarioTeachingMessages(
  userMessage: string,
  scenario: Scenario,
  level: number,
  targetLevel: CEFRLevel,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  style?: OpeningStyle,
  persona: CharacterPersona = LUNA_PERSONA,
  targetWords?: string[],
  vocabState?: {
    currentActIndex?: number
    wordsUsed?: string[]
  },
  levelProfile?: ScenarioLevelProfile
): LLMMessage[] {
  const personality = style?.persona
  // 剥离基础 OUTPUT FORMAT —— 场景上下文会提供自己的格式
  let systemPrompt = stripBaseOutputFormat(persona.buildSystemPrompt(level, personality))

  // v2：优先使用运行时目标词，回退到静态 scenario.targetWords
  const words = targetWords && targetWords.length > 0 ? targetWords : scenario.targetWords
  // 注入场景上下文（包含它自己的 OUTPUT FORMAT）
  systemPrompt += buildScenarioContext(scenario, targetLevel, words, vocabState, levelProfile)

  const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }]

  // 添加对话历史（最近 10 条）
  for (const h of history.slice(-10)) {
    messages.push({ role: h.role, content: h.content })
  }

  // 添加当前用户消息
  messages.push({ role: 'user', content: userMessage })

  return messages
}
