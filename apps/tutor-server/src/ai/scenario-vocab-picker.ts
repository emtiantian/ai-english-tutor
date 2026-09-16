import type { CEFRLevel, Scenario, ScenarioLevelProfile } from '@ai-english-tutor/shared'
import { getVocabularyByLevel } from '../vocab/loader.js'
import { DEFAULT_VOCABULARY_POLICY, type VocabularyPolicy } from './vocabulary-policy.js'

const CEFR_ORDER: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

function nextLevel(level: CEFRLevel): CEFRLevel | undefined {
  const idx = CEFR_ORDER.indexOf(level)
  if (idx < 0 || idx >= CEFR_ORDER.length - 1) return undefined
  return CEFR_ORDER[idx + 1]
}

function prevLevel(level: CEFRLevel): CEFRLevel | undefined {
  const idx = CEFR_ORDER.indexOf(level)
  if (idx <= 0) return undefined
  return CEFR_ORDER[idx - 1]
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * 从指定等级的指定主题中随机抽取候选词。
 */
function candidatesForLevelAndThemes(level: CEFRLevel | undefined, themes: Set<string>): string[] {
  if (!level) return []
  const vocab = getVocabularyByLevel(level)
  const words = vocab.words
    .filter(w => themes.size === 0 || themes.has(w.topic.toLowerCase()))
    .map(w => w.word)
  return shuffleArray(words)
}

/**
 * 为单幕按主题和策略配置抽词。
 * 某档同主题词不足时只从其他档的同主题词补充，最多返回 count 个唯一词。
 * globalUsed 用于跨幕去重；传入后本函数不会返回其中已存在的词。
 */
function pickWordsForAct(
  targetLevel: CEFRLevel,
  themes: string[],
  count: number,
  policy: VocabularyPolicy,
  globalUsed?: Set<string>
): string[] {
  const themeSet = new Set(themes.map(t => t.toLowerCase()))
  const primaryLevel = targetLevel
  const reviewLevel = prevLevel(targetLevel)
  const challengeLevel = nextLevel(targetLevel)

  const primaryTarget = Math.ceil(count * policy.levelMix.primary)
  const reviewTarget = Math.ceil(count * policy.levelMix.review)
  const challengeTarget = Math.max(0, count - primaryTarget - reviewTarget)

  const picked: string[] = []
  const localUsed = new Set<string>()

  function isFresh(word: string): boolean {
    const key = word.toLowerCase()
    return !localUsed.has(key) && !globalUsed?.has(key)
  }

  function addUnique(words: string[], max: number): void {
    for (const word of words) {
      if (!isFresh(word)) continue
      if (picked.length >= max) return
      localUsed.add(word.toLowerCase())
      picked.push(word)
    }
  }

  // 1) 本档主题词
  addUnique(candidatesForLevelAndThemes(primaryLevel, themeSet), primaryTarget)

  // 2) 复习档主题词
  addUnique(candidatesForLevelAndThemes(reviewLevel, themeSet), primaryTarget + reviewTarget)

  // 3) 挑战档主题词
  addUnique(
    candidatesForLevelAndThemes(challengeLevel, themeSet),
    primaryTarget + reviewTarget + challengeTarget
  )

  // 4) 配额不足时，只在同主题候选池中补齐；不引入与场景无关的词。
  if (picked.length < count) {
    addUnique(candidatesForLevelAndThemes(primaryLevel, themeSet), count)
    addUnique(candidatesForLevelAndThemes(reviewLevel, themeSet), count)
    addUnique(candidatesForLevelAndThemes(challengeLevel, themeSet), count)
  }

  return picked.slice(0, count)
}

/**
 * 全局 topic 过滤抽词（无 levelProfile 时回退使用）。
 */
function pickVocabularyByGlobalTopics(
  scenario: Scenario,
  targetLevel: CEFRLevel,
  targetCount: number,
  policy: VocabularyPolicy
): string[] {
  return pickWordsForAct(targetLevel, scenario.topics ?? [], targetCount, policy)
}

/**
 * 按 levelProfile 的 acts 逐幕抽词，返回按幕分组排序的目标词数组。
 */
function pickVocabularyByActs(
  scenario: Scenario,
  targetLevel: CEFRLevel,
  profile: ScenarioLevelProfile,
  targetCount: number,
  policy: VocabularyPolicy
): string[] {
  const acts = profile.acts ?? []
  if (acts.length === 0) {
    return pickVocabularyByGlobalTopics(scenario, targetLevel, targetCount, policy)
  }

  const perActCount = Math.ceil(targetCount / acts.length)
  const used = new Set<string>()
  const result: string[] = []

  for (const act of acts) {
    const themes = act.vocabThemes ?? scenario.topics ?? []
    const words = pickWordsForAct(targetLevel, themes, perActCount, policy, used)
    for (const word of words) {
      if (used.has(word.toLowerCase())) continue
      used.add(word.toLowerCase())
      result.push(word)
      if (result.length >= targetCount) break
    }
    if (result.length >= targetCount) break
  }

  // 若按幕抽完仍不足，用全局 topic 补齐
  if (result.length < targetCount) {
    const remaining = pickVocabularyByGlobalTopics(
      scenario,
      targetLevel,
      targetCount - result.length,
      policy
    )
    for (const word of remaining) {
      if (used.has(word.toLowerCase())) continue
      used.add(word.toLowerCase())
      result.push(word)
      if (result.length >= targetCount) break
    }
  }

  return result.slice(0, targetCount)
}

/**
 * 为场景按目标 CEFR 档抽取目标词。
 *
 * 规则：
 * 1. 若场景在当前等级存在 levelProfile.acts 且带 vocabThemes，则按幕逐幕抽词，
 *    每幕内部使用策略配置的等级混合比例，
 *    返回的数组按幕顺序排列。
 * 2. 否则按 scenario.topics 使用同一等级混合策略。
 * 3. 只返回主题相关词；相关词不足时允许少于上限，不使用无关词强行补齐。
 */
export function pickScenarioVocabulary(
  scenario: Scenario,
  targetLevel: CEFRLevel,
  targetCount: number = DEFAULT_VOCABULARY_POLICY.targetPoolSize,
  policy: VocabularyPolicy = DEFAULT_VOCABULARY_POLICY
): string[] {
  const profile = scenario.levelProfiles?.[targetLevel]
  if (profile?.acts?.some(act => act.vocabThemes && act.vocabThemes.length > 0)) {
    return pickVocabularyByActs(scenario, targetLevel, profile, targetCount, policy)
  }

  return pickVocabularyByGlobalTopics(scenario, targetLevel, targetCount, policy)
}
