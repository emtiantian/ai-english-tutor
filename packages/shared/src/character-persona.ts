import type { MotionId, ExpressionId } from './types.js'
import defaultPersonaJsonRaw from './persona-default.json' with { type: 'json' }

/**
 * 开场风格 —— 一种人格预设，让老师拥有鲜明的个性风味。
 *
 * 每种风格定义老师如何组织语言以及符合该调性的动作/表情。
 */
export interface OpeningStyle {
  /** 风格标识符，用于日志和持久化 */
  name: string
  /** 提示词片段，告诉 AI 如何扮演 */
  persona: string
  /** 开场问候建议使用的动作 */
  motionHint: MotionId
  /** 开场问候建议使用的表情 */
  expressionHint: ExpressionId
}

/**
 * CharacterPersona —— 汇总定义虚拟角色所需的一切。
 *
 * 实现该接口即可创建新角色（不同名字、声音、人格预设、提示词风格）。
 * 默认的 `LUNA_PERSONA` 是一位英语对话伙伴的完整参考实现。
 *
 * 设计说明：
 * - `buildSystemPrompt` 掌握完整提示词模板，使每个角色可拥有
 *   不同的规则、语气和输出格式。
 * - `styles` 使用数组，方便服务器随机选择或让用户自行挑选。
 */
export interface CharacterPersona {
  /** 角色显示名（如 "Luna"） */
  readonly name: string

  /** 该角色可用的人格预设 */
  readonly styles: OpeningStyle[]

  /**
   * 构建教学对话的系统提示词。
   *
   * @param level - 学生英语水平（1-5）
   * @param personality - 可选，要注入的人格/风格文本
   * @param motionBlock - 可选，要注入的动作指令块
   * @param expressionBlock - 可选，要注入的表情指令块
   */
  buildSystemPrompt(
    level: number,
    personality?: string,
    motionBlock?: string,
    expressionBlock?: string
  ): string
}

// ────────────────────────────────────────────────────────────
// 默认实现：Luna（数据源自 persona-default.json，消除双份维护）
// ────────────────────────────────────────────────────────────

/**
 * 可 JSON 序列化的人设数据结构。
 * 用于运行时从 persona.json 文件加载。
 */
export interface PersonaJson {
  name: string
  levelDescriptions: Record<string, string>
  systemPromptTemplate: string
  styles: OpeningStyle[]
}

/** 默认人设 JSON 的强类型视图 */
const defaultPersonaJson: PersonaJson = defaultPersonaJsonRaw as PersonaJson

/**
 * CEFR 等级描述，从默认人设 JSON 派生。
 */
export const LEVEL_DESCRIPTIONS: Record<number, string> = Object.fromEntries(
  Object.entries(defaultPersonaJson.levelDescriptions).map(([level, description]) => [
    Number(level),
    description
  ])
) as Record<number, string>

/**
 * Luna 的默认开场风格列表，直接取自默认人设 JSON。
 */
export const LUNA_STYLES: OpeningStyle[] = defaultPersonaJson.styles

/**
 * 根据模板字符串和数据构建系统提示词。
 * 占位符：{name}、{personaBlock}、{level}、{levelDescription}、{motionBlock}、{expressionBlock}
 *
 * motionBlock / expressionBlock 仅在传入非空值时才会以两个换行符为前缀插入模板，
 * 从而与旧版硬编码提示词的排版行为保持一致。
 */
export function buildSystemPromptFromTemplate(
  template: string,
  data: {
    name: string
    level: number
    personality?: string
    levelDescriptions: Record<string, string>
    motionBlock?: string
    expressionBlock?: string
  }
): string {
  const personaBlock = data.personality
    ? `\nPERSONALITY (stay in character for the entire session):\n${data.personality}\n`
    : ''
  const levelDescription =
    data.levelDescriptions[String(data.level)] ?? data.levelDescriptions['3'] ?? ''
  const motionBlock = data.motionBlock ? `\n\n${data.motionBlock}` : ''
  const expressionBlock = data.expressionBlock ? `\n\n${data.expressionBlock}` : ''

  return template
    .replace(/\{name\}/g, data.name)
    .replace(/\{personaBlock\}/g, personaBlock)
    .replace(/\{level\}/g, String(data.level))
    .replace(/\{levelDescription\}/g, levelDescription)
    .replace(/\{motionBlock\}/g, motionBlock)
    .replace(/\{expressionBlock\}/g, expressionBlock)
}

/**
 * 从 JSON 配置对象创建 CharacterPersona。
 * 返回的对象满足 CharacterPersona 接口。
 */
export function personaFromJson(json: PersonaJson): CharacterPersona {
  return {
    name: json.name,
    styles: json.styles,

    buildSystemPrompt(
      level: number,
      personality?: string,
      motionBlock?: string,
      expressionBlock?: string
    ): string {
      return buildSystemPromptFromTemplate(json.systemPromptTemplate, {
        name: json.name,
        level,
        personality,
        levelDescriptions: json.levelDescriptions,
        motionBlock,
        expressionBlock
      })
    }
  }
}

/**
 * 默认人设：Luna —— 一位友好、有耐心的英语对话伙伴。
 * 直接由 persona-default.json 生成，确保 JSON 与 TS 源码永远一致。
 */
export const LUNA_PERSONA: CharacterPersona = personaFromJson(defaultPersonaJson)
