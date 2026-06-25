import type { CEFRLevel, Scenario } from '@ai-english-tutor/shared'
import { getVocabularyByLevel } from '../vocab/loader.js'

const CEFR_ORDER: CEFRLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
const DEFAULT_TARGET_COUNT = 30
const BORROW_RATIO = 0.3

function nextLevel(level: CEFRLevel): CEFRLevel | undefined {
  const idx = CEFR_ORDER.indexOf(level)
  if (idx < 0 || idx >= CEFR_ORDER.length - 1) return undefined
  return CEFR_ORDER[idx + 1]
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
 * 为场景按目标 CEFR 档抽取目标词。
 *
 * 规则：
 * 1. 优先从 targetLevel 的 vocab/lists/{level}.json 中按 scenario.topics 过滤。
 * 2. 如果数量不足 30，从下一档借 30%（向上取整），仍按 topics 过滤。
 * 3. 还不足则 fallback 到 targetLevel 全量随机补齐。
 * 4. 最终去重并截取 30 个。
 */
export function pickScenarioVocabulary(
  scenario: Scenario,
  targetLevel: CEFRLevel,
  targetCount: number = DEFAULT_TARGET_COUNT,
): string[] {
  const topics = new Set((scenario.topics ?? []).map((t) => t.toLowerCase()))

  function wordsForLevel(level: CEFRLevel): string[] {
    const vocab = getVocabularyByLevel(level)
    if (topics.size === 0) return vocab.words.map((w) => w.word)
    return vocab.words
      .filter((w) => topics.has(w.topic.toLowerCase()))
      .map((w) => w.word)
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
  const levelWords = shuffleArray(wordsForLevel(targetLevel))
  addUnique(levelWords, targetCount)

  // 2. 从下一档借 30%
  if (picked.length < targetCount) {
    const nxt = nextLevel(targetLevel)
    if (nxt) {
      const borrowCount = Math.ceil(targetCount * BORROW_RATIO)
      const nextWords = shuffleArray(wordsForLevel(nxt))
      addUnique(nextWords, Math.min(targetCount, picked.length + borrowCount))
    }
  }

  // 3. fallback：本档全部词随机补齐
  if (picked.length < targetCount) {
    const allLevelWords = shuffleArray(
      getVocabularyByLevel(targetLevel).words.map((w) => w.word),
    )
    addUnique(allLevelWords, targetCount)
  }

  return picked.slice(0, targetCount)
}
