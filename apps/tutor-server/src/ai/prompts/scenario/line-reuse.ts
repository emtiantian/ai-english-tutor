/**
 * 剥离基础角色人设的 OUTPUT FORMAT 段落，使场景自己的
 * OUTPUT FORMAT 成为唯一格式。
 */
export function stripBaseOutputFormat(prompt: string): string {
  // 移除从 "OUTPUT FORMAT" 到 prompt 末尾的所有内容
  return prompt.replace(/\nOUTPUT FORMAT[\s\S]*$/, '')
}

/**
 * 构建注入场景上下文之后的可复用台词块。
 *
 * 这些台词是 Luna 在当前这个场景 + 等级 + 音色下已经说过的。
 * 逐字复用其中一句可保证命中 TTS 缓存（零合成成本），因此我们会
 * 让模型在合适时优先使用——但仅用于 "text" 字段，且只在自然时复用，
 * 避免对话显得生硬。没有可用台词时返回 ''（冷启动），随着场景反复进行，
 * 节省的成本会越来越高。
 */
export function buildLineReuseBlock(reusableLines?: string[]): string {
  if (!reusableLines || reusableLines.length === 0) return ''
  const list = reusableLines.map(l => `- ${JSON.stringify(l)}`).join('\n')
  // 提示词：台词复用规则 —— 让模型在自然且符合角色时，逐字复用已说过的台词以命中 TTS 缓存
  const lineReuseRule = `

LINE REUSE (reuse verbatim when appropriate) — Below are lines you have already spoken in this scenario and CEFR level. If one of them fits the current situation naturally and in character, reuse it word-for-word (including identical punctuation) as your "text" field. Only write a new "text" when none of the lines fit. This keeps your voice consistent. This rule applies ONLY to the "text" field; "textZh", "vocabularySentences", and "studentReplyHints" still follow their own rules.`
  // 提示词：可复用台词列表 —— 列出模型可以选择逐字复用的具体台词
  const lineReuseList = `

Lines you have already spoken:
${list}`
  const lineReuseBlock = lineReuseRule + lineReuseList
  return lineReuseBlock
}
