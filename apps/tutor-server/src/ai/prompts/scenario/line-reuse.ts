import { type CEFRLevel, type Scenario } from '@ai-english-tutor/shared'

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
  const list = reusableLines.map((l) => `- ${JSON.stringify(l)}`).join('\n')
  return `

台词复用（合适时原样说出）—— 以下是你在当前这个场景和 CEFR 等级中已经说过的台词。如果其中某一句在当前情境下自然且符合角色，请逐字复用（包括标点完全一致）作为你的 "text" 字段内容。仅当没有合适台词时才撰写新的 "text"。这能保持你的声线一致。此规则仅适用于 "text" 字段；"textZh"、"vocabularySentences" 和 "studentReplyHints" 仍需遵循各自规则。

已说过的台词：
${list}`
}
