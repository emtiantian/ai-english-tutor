import type { CEFRLevel, Scenario, ScenarioLevelProfile } from '@ai-english-tutor/shared'
import type { LLMMessage } from '../../llm.js'
import { buildScenarioOpeningContext } from './context-builder.js'

export function buildScenarioStartMessages(
  scenario: Scenario,
  _level: number,
  targetLevel: CEFRLevel,
  levelProfile?: ScenarioLevelProfile
): { messages: LLMMessage[] } {
  const systemPrompt = buildScenarioOpeningContext(scenario, targetLevel, levelProfile)
  const activeSetting = levelProfile?.setting ?? scenario.setting

  return {
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content:
          `Open the "${scenario.nameEn}" scene naturally in JSON format. ` +
          `The situation is: ${activeSetting} Begin directly as your assigned scene role.`
      }
    ]
  }
}
