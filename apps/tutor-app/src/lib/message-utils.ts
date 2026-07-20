import type { ChatMessage } from '../stores/tutor.js'

let messageIdCounter = 0

/**
 * 生成唯一消息 ID。
 * 使用 Date.now() + 自增计数器，避免快速连续调用时冲突。
 */
export function createMessageId(): string {
  return `msg-${Date.now()}-${++messageIdCounter}`
}

/**
 * 从消息列表末尾开始查找第一条满足条件的助教消息。
 */
export function findLastAssistantMessage(
  messages: ChatMessage[],
  predicate?: (msg: ChatMessage) => boolean,
): ChatMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role === 'assistant' && (!predicate || predicate(msg))) {
      return msg
    }
  }
  return undefined
}
