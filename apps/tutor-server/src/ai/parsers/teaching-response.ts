import { logger } from '../../logger.js'
import {
  defaultMotionAnalyzer,
  isMotionId,
  isExpressionId,
  normalizeMotionId,
  normalizeExpressionId
} from '@ai-english-tutor/shared'
import { extractFirstJson } from './shared/json-extractor.js'

export interface ParsedResponse {
  text: string
  textZh?: string
  motionId: string
  expressionId: string
  vocabulary?: string[]
  vocabularySentences?: string[]
  /** 学习者视角的回复建议（驱动 💡 提示）。每轮临时生成，不持久化。 */
  studentReplyHints?: string[]
  intent: string
}

/**
 * 从 LLM 输出解析教学响应，并确定动作/表情。
 *
 * 当模型在 JSON 中输出有效的 `motionId` / `expressionId` 时，动作/表情由 LLM 驱动（限制在语义词汇表内）。
 * 缺失或无效时，回退到确定性关键词分析器，使旧 prompt 和非 JSON 回复仍能播放动画。
 */
export function parseTeachingResponse(content: string): ParsedResponse {
  let text = content
  let vocabulary: string[] | undefined
  let vocabularySentences: string[] | undefined
  let studentReplyHints: string[] | undefined
  let llmMotionId: string | undefined
  let llmExpressionId: string | undefined

  let textZh: string | undefined

  try {
    const jsonText = extractFirstJson(content)
    if (jsonText) {
      const parsed = JSON.parse(jsonText)
      text = parsed.text || content
      textZh = typeof parsed.textZh === 'string' ? parsed.textZh : undefined
      vocabulary = Array.isArray(parsed.vocabulary) ? parsed.vocabulary : undefined
      vocabularySentences = Array.isArray(parsed.vocabularySentences)
        ? parsed.vocabularySentences.filter((s: unknown) => typeof s === 'string' && s.length > 0)
        : undefined
      studentReplyHints = Array.isArray(parsed.studentReplyHints)
        ? parsed.studentReplyHints.filter((s: unknown) => typeof s === 'string' && s.length > 0)
        : undefined
      // 仅在它们是有效语义 ID 时才采用 LLM 的动作/表情。
      if (isMotionId(parsed.motionId)) llmMotionId = parsed.motionId
      if (isExpressionId(parsed.expressionId)) llmExpressionId = parsed.expressionId
      logger.debug(
        { hasText: !!parsed.text, hasTextZh: !!parsed.textZh, textZhPreview: textZh?.slice(0, 30) },
        'Parsed LLM response'
      )
    }
  } catch (err) {
    logger.warn({ content: content.slice(0, 100), err }, 'Failed to parse LLM response as JSON')
  }

  // 若 JSON 解析失败，尝试从纯文本中提取尾部分析字段
  // （例如 'vocabulary: ["word"] vocabularySentences: [...] studentReplyHints: [...]'）
  if (!vocabulary && !vocabularySentences && !studentReplyHints) {
    const result = extractLiteralFields(text)
    if (result.stripped !== text) {
      logger.info('Extracted trailing analysis fields from non-JSON LLM response')
      text = result.stripped
      vocabulary = result.vocabulary
      vocabularySentences = result.vocabularySentences
      studentReplyHints = result.studentReplyHints
    }
  }

  // 优先使用 LLM 选择的动作/表情；否则回退到关键词分析器。
  const analyzed = defaultMotionAnalyzer.analyze(text)
  const motionId = llmMotionId ?? normalizeMotionId(analyzed.motionId)
  const expressionId = llmExpressionId ?? normalizeExpressionId(analyzed.expressionId)
  const intent = llmMotionId ? 'llm' : analyzed.intent

  logger.debug(
    { intent, motionId, expressionId, source: llmMotionId ? 'llm' : 'analyzer' },
    'Motion determined'
  )

  return {
    text,
    textZh,
    motionId,
    expressionId,
    vocabulary,
    vocabularySentences,
    studentReplyHints,
    intent
  }
}

/**
 * 提取 LLM 无法生成有效 JSON 时可能以纯文本形式输出的尾部分析字段。
 * 匹配如下模式：
 *   vocabulary: ["word1", "word2"]
 *   vocabularySentences: ["sentence1"]
 *   studentReplyHints: ["hint1"]
 * 位于文本末尾（前导空白可选）。
 *
 * 返回去除尾部后的文本以及解析出的字段值（未找到则为 undefined）。
 */
function extractLiteralFields(text: string): {
  stripped: string
  vocabulary?: string[]
  vocabularySentences?: string[]
  studentReplyHints?: string[]
} {
  // 一次性匹配所有尾部分段
  const fieldPattern =
    /(?:\s+(vocabulary|vocabularySentences|studentReplyHints)\s*:\s*(\[[\s\S]*?\]))+$/

  const match = text.match(fieldPattern)
  if (!match) return { stripped: text }

  // 提取完整尾部分段并解析各个字段
  const trailingBlock = match[0]
  const stripped = text.slice(0, text.length - trailingBlock.length).trimEnd()

  let vocabulary: string[] | undefined
  let vocabularySentences: string[] | undefined
  let studentReplyHints: string[] | undefined

  // 从尾部分段解析每个字段
  const fieldRegex = /(vocabulary|vocabularySentences|studentReplyHints)\s*:\s*(\[[\s\S]*?\])/g
  let fieldMatch: RegExpExecArray | null
  while ((fieldMatch = fieldRegex.exec(trailingBlock)) !== null) {
    const key = fieldMatch[1]
    const rawArray = fieldMatch[2]
    try {
      const arr = JSON.parse(rawArray)
      if (!Array.isArray(arr)) continue
      const strings = arr.filter((s: unknown) => typeof s === 'string' && s.length > 0)
      if (strings.length === 0) continue
      if (key === 'vocabulary') vocabulary = strings
      else if (key === 'vocabularySentences') vocabularySentences = strings
      else if (key === 'studentReplyHints') studentReplyHints = strings
    } catch {
      // 跳过无法解析的字段
    }
  }

  return { stripped, vocabulary, vocabularySentences, studentReplyHints }
}
