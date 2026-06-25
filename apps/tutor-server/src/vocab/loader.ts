import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { homedir } from 'os'
import { logger } from '../logger.js'
import { config, IS_DEPLOY } from '../config.js'
import {
  scenarios as sharedScenarios,
  getScenariosForLevel as sharedGetScenariosForLevel,
  getScenarioById as sharedGetScenarioById,
  LUNA_PERSONA,
  personaFromJson,
  type Scenario as SharedScenario,
  type ScenarioObjective as SharedScenarioObjective,
  type CharacterPersona,
  type PersonaJson,
  type OpeningStyle,
} from '@ai-english-tutor/shared'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ── Config directory resolution ──
// Priority:
//   CONFIG_DIR env var > DATA_DIR (when populated)
//   > ~/.ai-english-tutor/ (deploy-only legacy fallback) > compiled defaults
function resolveConfigDir(): string | null {
  const envDir = process.env.CONFIG_DIR
  if (envDir && existsSync(envDir)) return envDir

  // Canonical: DATA_DIR (deploy → ~/.ai-english-tutor/data, dev → <repo>/.dev-data)
  const dataDir = config.DATA_DIR
  if (existsSync(dataDir)) return dataDir

  // Legacy deploy fallback: ~/.ai-english-tutor/ (persona.json/scenarios.json/vocab/
  // sometimes live one level up from data/). Skipped in dev mode so local development
  // is never affected by stray files in the user's home directory.
  if (IS_DEPLOY) {
    const legacyDir = join(homedir(), '.ai-english-tutor')
    if (existsSync(legacyDir)) return legacyDir
  }

  // Final fallback: <repo>/config/ shipped with the source tree.
  const defaultDir = join(__dirname, '..', '..', '..', 'config')
  if (existsSync(defaultDir)) return defaultDir

  return null
}

export interface VocabWord {
  word: string
  meaning: string
  pos: string
  topic: string
}

export interface VocabLevel {
  level: string
  levelNum: number
  description: string
  wordCount: number
  words: VocabWord[]
}

/** In-memory vocabulary store */
const vocabCache = new Map<string, VocabLevel>()

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const

/**
 * Load all vocabulary levels into memory
 */
export function loadAllVocabulary(): void {
  for (const level of LEVELS) {
    loadVocabularyLevel(level)
  }
  logger.info(
    { levels: LEVELS.length, totalWords: getTotalWordCount() },
    'Vocabulary loaded',
  )
}

/**
 * Load a single vocabulary level
 */
function loadVocabularyLevel(level: string): VocabLevel {
  if (vocabCache.has(level)) {
    return vocabCache.get(level)!
  }

  const candidates = [
    join(config.CONFIG_DIR, 'vocab', `${level}.json`),
    join(__dirname, 'lists', `${level}.json`),
  ]

  for (const filePath of candidates) {
    try {
      if (!existsSync(filePath)) continue
      const data = readFileSync(filePath, 'utf-8')
      const vocab: VocabLevel = JSON.parse(data)
      vocabCache.set(level, vocab)
      return vocab
    } catch {
      // try next candidate
    }
  }

  logger.error({ level }, `Failed to load vocabulary level ${level}`)
  return {
    level,
    levelNum: LEVELS.indexOf(level as typeof LEVELS[number]) + 1,
    description: '',
    wordCount: 0,
    words: [],
  }
}

/**
 * Get vocabulary for a specific CEFR level
 */
export function getVocabularyByLevel(level: string): VocabLevel {
  return vocabCache.get(level) ?? loadVocabularyLevel(level)
}

/**
 * Get words for a specific CEFR level (1-6 → A1-C2)
 */
export function getVocabularyByLevelNum(levelNum: number): VocabLevel {
  const level = LEVELS[Math.min(Math.max(levelNum - 1, 0), 5)]
  return getVocabularyByLevel(level)
}

/**
 * Get all words across all levels up to a given level
 */
export function getVocabularyUpToLevel(levelNum: number): VocabWord[] {
  const words: VocabWord[] = []
  for (let i = 1; i <= Math.min(levelNum, 6); i++) {
    const vocab = getVocabularyByLevelNum(i)
    words.push(...vocab.words)
  }
  return words
}

/**
 * Look up a word across all levels
 */
export function lookupWord(word: string): { level: string; data: VocabWord } | undefined {
  const normalized = word.toLowerCase().trim()
  for (const level of LEVELS) {
    const vocab = getVocabularyByLevel(level)
    const found = vocab.words.find((w) => w.word.toLowerCase() === normalized)
    if (found) {
      return { level, data: found }
    }
  }
  return undefined
}

/**
 * Get words by topic for a specific level
 */
export function getWordsByTopic(levelNum: number, topic: string): VocabWord[] {
  const vocab = getVocabularyByLevelNum(levelNum)
  return vocab.words.filter((w) => w.topic === topic)
}

/**
 * Get all topics for a level
 */
export function getTopicsForLevel(levelNum: number): string[] {
  const vocab = getVocabularyByLevelNum(levelNum)
  const topics = new Set(vocab.words.map((w) => w.topic))
  return Array.from(topics).sort()
}

/**
 * Get total word count across all levels
 */
export function getTotalWordCount(): number {
  let count = 0
  for (const level of LEVELS) {
    count += vocabCache.get(level)?.wordCount ?? 0
  }
  return count
}

/**
 * Get random words from a level
 */
export function getRandomWords(levelNum: number, count: number): VocabWord[] {
  const vocab = getVocabularyByLevelNum(levelNum)
  const words = [...vocab.words]
  // Shuffle
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[words[i], words[j]] = [words[j], words[i]]
  }
  return words.slice(0, Math.min(count, words.length))
}

/**
 * Get all levels info
 */
export function getLevelsInfo(): Array<{ level: string; levelNum: number; wordCount: number; description: string }> {
  return LEVELS.map((level) => {
    const vocab = getVocabularyByLevel(level)
    return {
      level,
      levelNum: vocab.levelNum,
      wordCount: vocab.wordCount,
      description: vocab.description,
    }
  })
}

// ── Scenario System ──────────────────────────────────────
export type Scenario = SharedScenario
export type ScenarioObjective = SharedScenarioObjective

/** Runtime-loaded scenarios (from JSON file or compiled defaults) */
let runtimeScenarios: Scenario[] | null = null

/**
 * Load scenarios from JSON file, fallback to compiled defaults.
 */
export function loadAllScenarios(): void {
  const configDir = resolveConfigDir()
  if (configDir) {
    const filePath = join(configDir, 'scenarios.json')
    try {
      if (existsSync(filePath)) {
        const data = readFileSync(filePath, 'utf-8')
        runtimeScenarios = JSON.parse(data)
        logger.info({ count: runtimeScenarios!.length, source: filePath }, 'Scenarios loaded from JSON file')
        return
      }
    } catch (err) {
      logger.error({ err, filePath }, 'Failed to load scenarios.json, using compiled defaults')
    }
  }
  // Fallback to compiled defaults
  runtimeScenarios = [...sharedScenarios]
  logger.info({ count: runtimeScenarios.length }, 'Scenarios loaded from compiled defaults')
}

function ensureScenarios(): Scenario[] {
  if (!runtimeScenarios) loadAllScenarios()
  return runtimeScenarios!
}

/**
 * Get all scenarios for a specific level
 */
export function getScenariosForLevel(levelNum: number): Scenario[] {
  return ensureScenarios().filter((s) => s.level === levelNum)
}

/**
 * Get a scenario by ID
 */
export function getScenarioById(id: string): Scenario | undefined {
  return ensureScenarios().find((s) => s.id === id)
}

/**
 * Get all available scenarios
 */
export function getAllScenarios(): Scenario[] {
  return [...ensureScenarios()]
}

// ── Persona System ──────────────────────────────────────

/** Runtime-loaded persona (from JSON file or compiled default) */
let runtimePersona: CharacterPersona | null = null

/**
 * Load persona from JSON file, fallback to compiled default (Luna).
 */
export function loadPersona(): CharacterPersona {
  if (runtimePersona) return runtimePersona

  const configDir = resolveConfigDir()
  if (configDir) {
    const filePath = join(configDir, 'persona.json')
    try {
      if (existsSync(filePath)) {
        const data = readFileSync(filePath, 'utf-8')
        const json: PersonaJson = JSON.parse(data)
        runtimePersona = personaFromJson(json)
        logger.info({ name: json.name, source: filePath }, 'Persona loaded from JSON file')
        return runtimePersona
      }
    } catch (err) {
      logger.error({ err, filePath }, 'Failed to load persona.json, using compiled default')
    }
  }

  // Fallback to compiled default
  runtimePersona = LUNA_PERSONA
  logger.info({ name: LUNA_PERSONA.name }, 'Persona loaded from compiled default')
  return runtimePersona
}
