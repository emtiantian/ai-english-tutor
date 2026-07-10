import type { LLMMessage, TextContent } from './types.js'

/**
 * 从消息中提取文本内容（支持字符串和多模态内容）
 */
export function extractTextContent(message: LLMMessage | undefined): string {
  if (!message) return ''

  if (typeof message.content === 'string') {
    return message.content
  }

  // 多模态内容：提取文本部分
  return message.content
    .filter((c): c is TextContent => c.type === 'text')
    .map((c) => c.text)
    .join('\n')
}

/**
 * 将消息内容归一化为字符串，供不支持多模态的 Provider 使用
 */
export function normalizeToString(message: LLMMessage): LLMMessage {
  if (typeof message.content === 'string') {
    return message
  }

  return {
    ...message,
    content: extractTextContent(message),
  }
}
