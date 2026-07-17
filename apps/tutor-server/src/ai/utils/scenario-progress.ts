import type { CEFRLevel } from '@ai-english-tutor/shared'
import { logger } from '../../logger.js'
import type { ScenarioState } from '../session-manager.js'
import { levelNumToCEFR } from './cefr.js'

export const DEFAULT_MAX_TURNS = 20

export function computeCoverage(wordsUsed: number, total: number): number {
  if (!total) return 0
  return Math.min(1, wordsUsed / total)
}

export function computeStars(coverage: number): 0 | 3 | 4 | 5 {
  if (coverage >= 0.9) return 5
  if (coverage >= 0.75) return 4
  if (coverage >= 0.6) return 3
  return 0
}

export function isScenarioComplete(turnsCount: number, coverage: number): boolean {
  return turnsCount >= DEFAULT_MAX_TURNS || (turnsCount >= 6 && coverage >= 0.6)
}

/**
 * 判断场景对话当前处于哪一幕。
 *
 * 目标词汇被按幕主题分配到各幕中。每一幕至少要使用一半以上词汇才会进入下一幕，
 * 这样每轮都能让 LLM 专注于一小批可执行的词汇。
 */
export function computeCurrentActIndex(scenarioState: ScenarioState): number {
  // v2: 优先使用恢复时保存的 actThemes 长度作为幕数；未保存则默认 3。
  const actsCount = scenarioState.actThemes?.length ?? 3
  const bucketSize = Math.ceil(scenarioState.targetWords.length / actsCount)
  if (bucketSize <= 0) return 0

  const usedSet = scenarioState.wordsUsed
  for (let i = 0; i < actsCount - 1; i++) {
    const bucket = scenarioState.targetWords.slice(i * bucketSize, (i + 1) * bucketSize)
    const usedInBucket = bucket.filter((w) => usedSet.has(w.toLowerCase())).length
    if (usedInBucket / bucket.length < 0.5) return i
  }
  return actsCount - 1
}

/**
 * 构建场景进度响应（v2: 覆盖率 + 轮数 + 最大轮数 + 星级）
 */
export function buildScenarioProgress(session: { scenario?: ScenarioState }) {
  if (!session.scenario) return undefined

  const scenario = session.scenario
  const wordsLearned = Array.from(scenario.wordsUsed)
  const coverage = computeCoverage(wordsLearned.length, scenario.targetWords.length)
  const stars = computeStars(coverage)
  const completed = isScenarioComplete(scenario.turnsCount, coverage)

  const result: {
    id: string
    name: string
    icon: string
    targetWords: string[]
    targetWordsTotal: number
    wordsLearned: string[]
    level?: CEFRLevel
    turnsCount?: number
    maxTurns?: number
    coverageRate?: number
    stars?: 0 | 3 | 4 | 5
    completed?: boolean
    summary?: { wordsUsed: string[]; wordsTotal: number; turnsCount: number }
  } = {
    id: scenario.id,
    name: scenario.name,
    icon: scenario.icon,
    targetWords: scenario.targetWords,
    targetWordsTotal: scenario.targetWords.length,
    wordsLearned,
    level: scenario.level,
    turnsCount: scenario.turnsCount,
    maxTurns: scenario.maxTurns,
    coverageRate: coverage,
    stars,
    completed,
  }

  if (completed) {
    result.summary = {
      wordsUsed: wordsLearned,
      wordsTotal: scenario.targetWords.length,
      turnsCount: scenario.turnsCount,
    }
    logger.info({ scenarioId: scenario.id, turnsCount: scenario.turnsCount, coverage, stars }, '场景完成！')
  }

  return result
}
