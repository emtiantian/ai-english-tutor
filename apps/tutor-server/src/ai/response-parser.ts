import { logger } from '../logger.js'
import { defaultMotionAnalyzer, isMotionId, isExpressionId, normalizeMotionId, normalizeExpressionId } from '@ai-english-tutor/shared'

export interface ParsedResponse {
  text: string
  textZh?: string
  motionId: string
  expressionId: string
  vocabulary?: string[]
  vocabularySentences?: string[]
  /** Learner-voiced reply suggestions (powers 💡 hint). Per-turn ephemeral; not persisted. */
  studentReplyHints?: string[]
  intent: string
}

/**
 * Parse teaching response from LLM output and determine motion/expression.
 *
 * Motion/expression are LLM-driven when the model emits valid `motionId` /
 * `expressionId` in its JSON (clamped to the semantic vocabulary). When absent
 * or invalid, we fall back to the deterministic keyword analyzer so older
 * prompts and non-JSON replies still animate.
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
      // Only adopt LLM motion/expression when they are valid semantic IDs.
      if (isMotionId(parsed.motionId)) llmMotionId = parsed.motionId
      if (isExpressionId(parsed.expressionId)) llmExpressionId = parsed.expressionId
      logger.debug(
        { hasText: !!parsed.text, hasTextZh: !!parsed.textZh, textZhPreview: textZh?.slice(0, 30) },
        'Parsed LLM response',
      )
    }
  } catch (err) {
    logger.warn(
      { content: content.slice(0, 100), err },
      'Failed to parse LLM response as JSON',
    )
  }

  // If JSON parsing failed, try to extract trailing analysis fields from literal text
  // (e.g. 'vocabulary: ["word"] vocabularySentences: [...] studentReplyHints: [...]')
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

  // Prefer LLM-chosen motion/expression; fall back to the keyword analyzer.
  const analyzed = defaultMotionAnalyzer.analyze(text)
  const motionId = llmMotionId ?? normalizeMotionId(analyzed.motionId)
  const expressionId = llmExpressionId ?? normalizeExpressionId(analyzed.expressionId)
  const intent = llmMotionId ? 'llm' : analyzed.intent

  logger.debug({ intent, motionId, expressionId, source: llmMotionId ? 'llm' : 'analyzer' }, 'Motion determined')

  return { text, textZh, motionId, expressionId, vocabulary, vocabularySentences, studentReplyHints, intent }
}

/**
 * Extract the first top-level JSON object from text using brace balancing.
 * Ignores braces inside double-quoted strings so nested JSON or text containing
 * braces does not confuse the matcher.
 */
function extractFirstJson(text: string): string | null {
  let depth = 0
  let start = -1
  let inString = false
  let escape = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (char === '\\') {
        escape = true
        continue
      }
      if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      if (depth === 0) start = i
      depth++
    } else if (char === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1)
      }
    }
  }

  return null
}

/**
 * Extract trailing analysis fields that the LLM may emit as literal text
 * when it fails to produce valid JSON. Matches patterns like:
 *   vocabulary: ["word1", "word2"]
 *   vocabularySentences: ["sentence1"]
 *   studentReplyHints: ["hint1"]
 * at the end of the text (with optional leading whitespace).
 *
 * Returns the stripped text plus parsed field values (undefined if not found).
 */
function extractLiteralFields(text: string): {
  stripped: string
  vocabulary?: string[]
  vocabularySentences?: string[]
  studentReplyHints?: string[]
} {
  // Match all trailing field blocks in one pass
  const fieldPattern =
    /(?:\s+(vocabulary|vocabularySentences|studentReplyHints)\s*:\s*(\[[\s\S]*?\]))+$/

  const match = text.match(fieldPattern)
  if (!match) return { stripped: text }

  // Extract the full trailing block and parse individual fields
  const trailingBlock = match[0]
  const stripped = text.slice(0, text.length - trailingBlock.length).trimEnd()

  let vocabulary: string[] | undefined
  let vocabularySentences: string[] | undefined
  let studentReplyHints: string[] | undefined

  // Parse each field from the trailing block
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
      // Skip fields that can't be parsed
    }
  }

  return { stripped, vocabulary, vocabularySentences, studentReplyHints }
}
