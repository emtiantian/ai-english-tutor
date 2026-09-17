import type { CEFRLevel, Scenario, ScenarioLevelProfile } from '@ai-english-tutor/shared'
import type { LLMMessage } from '../../llm.js'
import { buildScenarioContext } from './context-builder.js'

export function buildScenarioTeachingMessages(
  userMessage: string,
  scenario: Scenario,
  _level: number,
  targetLevel: CEFRLevel,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  targetWords?: string[],
  vocabState?: { wordsUsed?: string[] },
  levelProfile?: ScenarioLevelProfile
): LLMMessage[] {
  const words = targetWords?.length ? targetWords : scenario.targetWords
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: buildScenarioContext(scenario, targetLevel, words, vocabState, levelProfile)
    }
  ]

  for (const item of history.slice(-10)) messages.push(item)
  messages.push({
    role: 'user',
    content: `Continue the scene from this message and return the required JSON object:\n${userMessage}`
  })
  return messages
}
