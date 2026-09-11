export { buildScenarioStartMessages } from './scenario/scenario-start.js'
export { buildScenarioTeachingMessages } from './scenario/scenario-turn.js'
export {
  buildScenarioContext,
  bucketWordsForActs,
  buildActsBlock,
  buildObjectivesBlock
} from './scenario/context-builder.js'
export { buildLineReuseBlock, stripBaseOutputFormat } from './scenario/line-reuse.js'
export { pickOpeningStyle } from './shared/persona.js'
export type { OpeningStyle } from './shared/persona.js'
