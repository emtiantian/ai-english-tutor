import type { LLMMessage } from '../../llm.js'

/**
 * 单词详情 / 词典释义
 *
 * 为单个英文单词生成结构化、词典风格的中文释义，可选地基于它出现的句子。
 * LLM 是主要来源（覆盖任何上下文词）；静态词汇表只提供可选提示（等级 / 已知释义），
 * 将其融入 prompt。
 */

/**
 * 构建请求词典风格释义的 LLM 消息。
 *
 * @param word     要解释的单词。
 * @param sentence 单词出现的可选句子（让 LLM 优先处理该上下文义项）。
 * @param hint     可选的静态词典提示（等级 / 已知释义 / 词性）。
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
