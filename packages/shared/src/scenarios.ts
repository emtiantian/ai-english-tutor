/**
 * 场景化教学的场景定义
 *
 * 场景是真实世界中的角色扮演情境，学生与扮演特定角色的 AI 老师
 * 一起练习英语。
 */

import scenariosDefault from './scenarios-default.json' with { type: 'json' }

/** CEFR 等级标识符，用于场景 v2 的难度分级 */
export type CEFRLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'

/**
 * 场景 v2：Act = 三幕故事（开场 / 主线 / 收尾）中的一个阶段。
 * goal 会作为该幕的专属目标注入 LLM 提示词。
 */
export interface ActDef {
  /** Act 在 UI 中显示的中文名，如 "开场" / "主线" / "收尾" */
  name: string
  /**
   * 注入提示词的目标 —— 该幕应完成什么。
   * 支持 string 或 string[]，避免多个子目标被拼接成一句话。
   */
  goal: string | string[]
  /**
   * 这一幕优先使用的词汇主题（对应 config/vocab/{level}.json 里的 topic）。
   * 用于将目标词按幕主题自然分布。
   */
  vocabThemes?: string[]
}

/**
 * 某个场景在特定 CEFR 等级下的变体配置。
 * 若存在，则优先使用本配置中的 setting/role/acts；否则回退到场景顶层字段。
 */
export interface ScenarioLevelProfile {
  /** 该等级下的场景设定 */
  setting?: string
  /** 该等级下的角色身份 */
  role?: { student: string; teacher: string }
  /** 该等级下自然发生的转折 / 冲突，用于让高级词自然出现 */
  twist?: string
  /** 该等级下的硬上限轮次 */
  maxTurns?: number
  /** 该等级下目标词数量（默认 30） */
  targetWordCount?: number
  /** 该等级下的三幕结构 */
  acts?: ActDef[]
}

/**
 * @deprecated v2 起场景不再用 phase 级 objective；改用顶层 acts 描述剧情骨架，
 * 并由运行时按用户 CEFR 档从 config/vocab/{level}.json 自动抽 30 个目标词。
 * 该类型保留仅为向后兼容旧 scenarios-default.json。
 */
export interface ScenarioObjective {
  id: string
  description: string
  descriptionEn: string
  keywords: string[]
  /** 学生在该阶段应学习的单词 */
  targetWords?: string[]
}

export interface Scenario {
  id: string
  name: string
  nameEn: string
  description: string
  icon: string
  /**
   * v2 新增：不同 CEFR 等级下的场景变体。
   * 存在时，引擎会按当前等级选取对应的 setting/role/acts/twist。
   */
  levelProfiles?: Partial<Record<CEFRLevel, ScenarioLevelProfile>>
  /**
   * @deprecated v2: 场景不再有固定 level，每个场景都能从 A1 → C2 闯关。
   * 仅为向后兼容旧 scenarios-default.json 保留。
   */
  level: number
  /** 主题标签，v2 用作 config/vocab/{level}.json 的抽词锚点 */
  topics: string[]
  /**
   * @deprecated v2 起目标词不再静态写在场景里，改由运行时按
   * (用户CEFR档, scenario.topics) 自动从 config/vocab/{level}.json 抽 30 个。
   * 仅为向后兼容旧 scenarios-default.json 保留。
   */
  targetWords: string[]
  role: {
    student: string
    teacher: string
  }
  setting: string
  /**
   * @deprecated v2 用 acts 替代。仅为向后兼容旧 scenarios-default.json 保留。
   */
  objectives: ScenarioObjective[]
  /**
   * v2 新增：3 幕剧骨架（开场 / 主线 / 收尾），注入 LLM prompt。
   * 可选——存在则用 v2 流程，缺失则回退旧 objectives。
   */
  acts?: ActDef[]
}

/** 所有可用场景 */
export const scenarios: Scenario[] = scenariosDefault as Scenario[]


/**
 * 获取场景在指定 CEFR 等级下的变体配置。
 * 若该等级没有配置，则返回 undefined（调用方应回退到顶层字段）。
 */
export function getScenarioProfile(
  scenario: Scenario,
  level: CEFRLevel,
): ScenarioLevelProfile | undefined {
  return scenario.levelProfiles?.[level]
}

/**
 * 获取场景在指定 CEFR 等级下应使用的 Act 列表。
 * 优先使用 levelProfiles[level].acts，否则回退到顶层 acts，最后回退到 objectives。
 */
export function getScenarioActs(
  scenario: Scenario,
  level: CEFRLevel,
): ActDef[] {
  const profile = getScenarioProfile(scenario, level)
  if (profile?.acts && profile.acts.length > 0) return profile.acts
  if (scenario.acts && scenario.acts.length > 0) return scenario.acts
  return (scenario.objectives ?? []).map((obj) => ({
    name: obj.description,
    goal: obj.descriptionEn,
  }))
}

/** 获取指定等级的场景 */
export function getScenariosForLevel(levelNum: number): Scenario[] {
  return scenarios.filter((s) => s.level === levelNum)
}

/** 按 ID 获取场景 */
export function getScenarioById(id: string): Scenario | undefined {
  return scenarios.find((s) => s.id === id)
}

/** 获取所有可用场景 */
export function getAllScenarios(): Scenario[] {
  return [...scenarios]
}
