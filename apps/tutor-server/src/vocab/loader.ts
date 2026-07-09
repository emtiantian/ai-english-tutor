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

// ── 配置目录解析 ──
// 优先级：
//   CONFIG_DIR 环境变量 > DATA_DIR（当已填充时）
//   > ~/.ai-english-tutor/（仅部署模式下的旧版兼容）> 编译内置默认值
function resolveConfigDir(): string | null {
  const envDir = process.env.CONFIG_DIR
  if (envDir && existsSync(envDir)) return envDir

  // 规范路径：DATA_DIR（部署 → ~/.ai-english-tutor/data，开发 → <repo>/.dev-data）
  const dataDir = config.DATA_DIR
  if (existsSync(dataDir)) return dataDir

  // 旧版部署回退：~/.ai-english-tutor/（persona.json/scenarios.json/vocab/
  // 有时位于 data/ 的上一级）。开发模式跳过，以免本地开发受用户主目录中
  // 随意文件的影响。
  if (IS_DEPLOY) {
    const legacyDir = join(homedir(), '.ai-english-tutor')
    if (existsSync(legacyDir)) return legacyDir
  }

  // 最终回退：源码树自带的 <repo>/config/
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

/** 内存中的词汇存储 */
const vocabCache = new Map<string, VocabLevel>()

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const

/**
 * 将所有 CEFR 等级词汇加载到内存。
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
 * 加载单个 CEFR 等级词汇。
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
      // 尝试下一个候选
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
 * 获取指定 CEFR 等级的词汇。
 */
export function getVocabularyByLevel(level: string): VocabLevel {
  return vocabCache.get(level) ?? loadVocabularyLevel(level)
}

/**
 * 按等级数字获取词汇（1-6 → A1-C2）。
 */
export function getVocabularyByLevelNum(levelNum: number): VocabLevel {
  const level = LEVELS[Math.min(Math.max(levelNum - 1, 0), 5)]
  return getVocabularyByLevel(level)
}

/**
 * 获取到指定等级为止的所有单词。
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
 * 跨所有等级查找某个单词。
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
 * 获取指定等级下某主题的所有单词。
 */
export function getWordsByTopic(levelNum: number, topic: string): VocabWord[] {
  const vocab = getVocabularyByLevelNum(levelNum)
  return vocab.words.filter((w) => w.topic === topic)
}

/**
 * 获取某等级的所有主题。
 */
export function getTopicsForLevel(levelNum: number): string[] {
  const vocab = getVocabularyByLevelNum(levelNum)
  const topics = new Set(vocab.words.map((w) => w.topic))
  return Array.from(topics).sort()
}

/**
 * 获取所有等级的单词总数。
 */
export function getTotalWordCount(): number {
  let count = 0
  for (const level of LEVELS) {
    count += vocabCache.get(level)?.wordCount ?? 0
  }
  return count
}

/**
 * 从某等级随机获取单词。
 */
export function getRandomWords(levelNum: number, count: number): VocabWord[] {
  const vocab = getVocabularyByLevelNum(levelNum)
  const words = [...vocab.words]
  // 洗牌
  for (let i = words.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[words[i], words[j]] = [words[j], words[i]]
  }
  return words.slice(0, Math.min(count, words.length))
}

/**
 * 获取所有等级信息。
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

// ── 场景系统 ──────────────────────────────────────
export type Scenario = SharedScenario
export type ScenarioObjective = SharedScenarioObjective

/** 运行时加载的场景（来自 JSON 文件或编译内置默认值） */
let runtimeScenarios: Scenario[] | null = null

/**
 * 从 JSON 文件加载场景，回退到编译内置默认值。
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
  // 回退到编译内置默认值
  runtimeScenarios = [...sharedScenarios]
  logger.info({ count: runtimeScenarios.length }, 'Scenarios loaded from compiled defaults')
}

function ensureScenarios(): Scenario[] {
  if (!runtimeScenarios) loadAllScenarios()
  return runtimeScenarios!
}

/**
 * 获取指定等级的所有场景。
 */
export function getScenariosForLevel(levelNum: number): Scenario[] {
  return ensureScenarios().filter((s) => s.level === levelNum)
}

/**
 * 按 ID 获取场景。
 */
export function getScenarioById(id: string): Scenario | undefined {
  return ensureScenarios().find((s) => s.id === id)
}

/**
 * 获取所有可用场景。
 */
export function getAllScenarios(): Scenario[] {
  return [...ensureScenarios()]
}

// ── 人设系统 ──────────────────────────────────────

/** 运行时加载的人设（来自 JSON 文件或编译内置默认值） */
let runtimePersona: CharacterPersona | null = null

/**
 * 从 JSON 文件加载人设，回退到编译内置默认值（Luna）。
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

  // 回退到编译内置默认值
  runtimePersona = LUNA_PERSONA
  logger.info({ name: LUNA_PERSONA.name }, 'Persona loaded from compiled default')
  return runtimePersona
}
