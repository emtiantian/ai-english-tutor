import type { LLMMessage } from '../llm.js'

/**
 * Word detail / dictionary explanation
 *
 * Generates a structured, dictionary-style Chinese explanation for a single
 * English word, optionally grounded in the sentence it appeared in. The LLM is
 * the primary source (covers any contextual word); the static vocab list only
 * provides optional hints (level / known gloss) folded into the prompt.
 */

/** One sense (词义条目) of the word. */
export interface WordSense {
  /** 词性，如 n. / v. / adj. / adv. / phrase */
  pos: string
  /** 中文释义 */
  meaningZh: string
  /** 英文例句 */
  exampleEn?: string
  /** 例句中文翻译 */
  exampleZh?: string
}

/** Structured dictionary entry returned to the client. */
export interface WordExplanation {
  /** 单词原形 */
  word: string
  /** 音标（IPA，含两侧斜杠），如 /əˈbændən/ */
  phonetic?: string
  /** CEFR 等级（若已知） */
  level?: string
  /** 多义项 */
  senses: WordSense[]
  /** 近义词 */
  synonyms?: string[]
  /** 用法/搭配笔记（中文） */
  usageNoteZh?: string
}

/**
 * Build the LLM messages that request a dictionary-style explanation.
 *
 * @param word     The word to explain.
 * @param sentence Optional sentence the word appeared in (gives the LLM the
 *                 contextual sense to prioritise).
 * @param hint     Optional static-dictionary hints (level / known gloss).
 */
export function buildVocabExplainMessages(
  word: string,
  sentence?: string,
  hint?: { level?: string; meaning?: string; pos?: string },
): LLMMessage[] {
  const contextLines: string[] = []
  if (sentence) {
    contextLines.push(`The word appeared in this sentence: "${sentence}". Put the sense that fits this context FIRST.`)
  }
  if (hint?.level) contextLines.push(`Known CEFR level: ${hint.level}.`)
  if (hint?.meaning) contextLines.push(`A rough known Chinese gloss (refine, do not blindly copy): ${hint.meaning}.`)
  if (hint?.pos) contextLines.push(`Likely part of speech: ${hint.pos}.`)

  const system = [
    'You are a bilingual (English–Chinese) dictionary for Chinese learners of English.',
    'Given an English word, produce a concise but complete dictionary entry.',
    'All explanations and example translations MUST be in Simplified Chinese (简体中文).',
    'Example sentences themselves stay in natural English.',
    '',
    'Respond with ONLY a single JSON object, no markdown, no code fence, with this exact shape:',
    '{',
    '  "word": "<the word, lower-cased base form>",',
    '  "phonetic": "<IPA with surrounding slashes, e.g. /əˈbændən/>",',
    '  "senses": [',
    '    {',
    '      "pos": "<n. | v. | adj. | adv. | phrase | ...>",',
    '      "meaningZh": "<简体中文释义>",',
    '      "exampleEn": "<a natural English example sentence>",',
    '      "exampleZh": "<该例句的中文翻译>"',
    '    }',
    '  ],',
    '  "synonyms": ["<近义词1>", "<近义词2>"],',
    '  "usageNoteZh": "<中文用法/搭配/辨析笔记，1-2 句；没有则省略>"',
    '}',
    '',
    'Rules:',
    '- Provide 1-3 of the most common senses. Do not pad with rare meanings.',
    '- Every sense MUST have an English example and its Chinese translation.',
    '- synonyms: 0-4 items; omit the field if there are none.',
    '- Keep it compact; this is shown in a small mobile popup.',
  ].join('\n')

  const userParts = [`Explain the English word: "${word}".`]
  if (contextLines.length) userParts.push(contextLines.join('\n'))

  return [
    { role: 'system', content: system },
    { role: 'user', content: userParts.join('\n\n') },
  ]
}

/**
 * Extract the first balanced top-level JSON object from text.
 * Ignores braces inside double-quoted strings.
 */
function extractFirstJson(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (ch === '\\') {
        escaped = true
      } else if (ch === '"') {
        inString = false
      }
      continue
    }
    if (ch === '"') {
      inString = true
    } else if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined
}

/**
 * Parse the LLM output into a {@link WordExplanation}.
 *
 * Tolerates code fences and trailing prose by extracting the first balanced
 * JSON object. Falls back to `null` when nothing parseable is found, so the
 * caller can degrade to static dictionary data.
 */
export function parseVocabExplainResponse(
  content: string,
  fallbackWord: string,
): WordExplanation | null {
  const jsonText = extractFirstJson(content)
  if (!jsonText) return null

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return null
  }

  const rawSenses = Array.isArray(parsed.senses) ? parsed.senses : []
  const senses: WordSense[] = rawSenses
    .map((s): WordSense | null => {
      if (typeof s !== 'object' || s === null) return null
      const obj = s as Record<string, unknown>
      const meaningZh = asString(obj.meaningZh)
      if (!meaningZh) return null
      return {
        pos: asString(obj.pos) ?? '',
        meaningZh,
        exampleEn: asString(obj.exampleEn),
        exampleZh: asString(obj.exampleZh),
      }
    })
    .filter((s): s is WordSense => s !== null)

  if (senses.length === 0) return null

  const synonyms = Array.isArray(parsed.synonyms)
    ? (parsed.synonyms.filter((w) => typeof w === 'string' && w.trim().length > 0) as string[]).map((w) => w.trim())
    : undefined

  return {
    word: asString(parsed.word) ?? fallbackWord,
    phonetic: asString(parsed.phonetic),
    level: asString(parsed.level),
    senses,
    synonyms: synonyms && synonyms.length > 0 ? synonyms : undefined,
    usageNoteZh: asString(parsed.usageNoteZh),
  }
}
