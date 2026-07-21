import type { CEFRLevel, Scenario, ScenarioLevelProfile } from '@ai-english-tutor/shared'
import { getVocabularyByLevel } from '../vocab/loader.js'

const CEFR_ORDER: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
export const DEFAULT_TARGET_COUNT = 30
const BORROW_RATIO = 0.3

/** 70/20/10 混合比例：本档 / 复习 / 挑战 */
const MIX_RATIOS = { primary: 0.7, review: 0.2, challenge: 0.1 }

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
 * 为单幕按主题抽词，使用 70% 本档 + 20% 复习 + 10% 挑战的混合策略。
 * 若某档同主题词不足，优先从本档全局补齐，保证返回 count 个唯一词。
 * globalUsed 用于跨幕去重；传入后本函数不会返回其中已存在的词。
 */
function pickWordsForAct(
  targetLevel: CEFRLevel,
  themes: string[],
  count: number,
  globalUsed?: Set<string>
): string[] {
  const themeSet = new Set(themes.map(t => t.toLowerCase()))
  const primaryLevel = targetLevel
  const reviewLevel = prevLevel(targetLevel)
  const challengeLevel = nextLevel(targetLevel)

  const primaryTarget = Math.ceil(count * MIX_RATIOS.primary)
  const reviewTarget = Math.ceil(count * MIX_RATIOS.review)
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

  // 4) 还不足则 fallback：本档全部词随机补齐
  if (picked.length < count) {
    const allPrimary = shuffleArray(getVocabularyByLevel(primaryLevel).words.map(w => w.word))
    addUnique(allPrimary, count)
  }

  return picked.slice(0, count)
}

/**
 * 传统全局 topic 过滤抽词（无 levelProfile 时回退使用）。
 */
function pickVocabularyByGlobalTopics(
  scenario: Scenario,
  targetLevel: CEFRLevel,
  targetCount: number
): string[] {
  const topics = new Set((scenario.topics ?? []).map(t => t.toLowerCase()))

  function wordsForLevel(level: CEFRLevel): string[] {
    const vocab = getVocabularyByLevel(level)
    if (topics.size === 0) return vocab.words.map(w => w.word)
    return vocab.words.filter(w => topics.has(w.topic.toLowerCase())).map(w => w.word)
  }

  const picked: string[] = []
  const used = new Set<string>()

  function addUnique(words: string[], max: number): void {
    for (const word of words) {
      if (used.has(word.toLowerCase())) continue
      if (picked.length >= max) return
      used.add(word.toLowerCase())
      picked.push(word)
    }
  }

  // 1. 本档按 topic 抽
  addUnique(shuffleArray(wordsForLevel(targetLevel)), targetCount)

  // 2. 从下一档借 30%
  if (picked.length < targetCount) {
    const nxt = nextLevel(targetLevel)
    if (nxt) {
      const borrowCount = Math.ceil(targetCount * BORROW_RATIO)
      addUnique(
        shuffleArray(wordsForLevel(nxt)),
        Math.min(targetCount, picked.length + borrowCount)
      )
    }
  }

  // 3. fallback：本档全部词随机补齐
  if (picked.length < targetCount) {
    const allLevelWords = shuffleArray(getVocabularyByLevel(targetLevel).words.map(w => w.word))
    addUnique(allLevelWords, targetCount)
  }

  return picked.slice(0, targetCount)
}

/**
 * 按 levelProfile 的 acts 逐幕抽词，返回按幕分组排序的目标词数组。
 */
function pickVocabularyByActs(
  scenario: Scenario,
  targetLevel: CEFRLevel,
  profile: ScenarioLevelProfile,
  targetCount: number
): string[] {
  const acts = profile.acts ?? []
  if (acts.length === 0) {
    return pickVocabularyByGlobalTopics(scenario, targetLevel, targetCount)
  }

  const perActCount = Math.ceil(targetCount / acts.length)
  const used = new Set<string>()
  const result: string[] = []

  for (const act of acts) {
    const themes = act.vocabThemes ?? scenario.topics ?? []
    const words = pickWordsForAct(targetLevel, themes, perActCount, used)
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
      targetCount - result.length
    )
    for (const word of remaining) {
      if (used.has(word.toLowerCase())) continue
      used.add(word.toLowerCase())
      result.push(word)
      if (result.length >= targetCount) break
    }
  }

  // 最后保险：仍不足则直接从本档全部词随机补齐
  if (result.length < targetCount) {
    const allWords = shuffleArray(getVocabularyByLevel(targetLevel).words.map(w => w.word))
    for (const word of allWords) {
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
 *    每幕内部使用 70% 本档 + 20% 低一档复习 + 10% 高一档挑战的混合策略，
 *    返回的数组按幕顺序排列。
 * 2. 否则回退到旧逻辑：从 targetLevel 的 config/vocab/{level}.json 中按 scenario.topics 过滤，
 *    不足时从下一档借 30%，再不足则用本档全部词补齐。
 */
export function pickScenarioVocabulary(
  scenario: Scenario,
  targetLevel: CEFRLevel,
  targetCount: number = DEFAULT_TARGET_COUNT
): string[] {
  const profile = scenario.levelProfiles?.[targetLevel]
  if (profile?.acts?.some(act => act.vocabThemes && act.vocabThemes.length > 0)) {
    return pickVocabularyByActs(scenario, targetLevel, profile, targetCount)
  }

  return pickVocabularyByGlobalTopics(scenario, targetLevel, targetCount)
}
