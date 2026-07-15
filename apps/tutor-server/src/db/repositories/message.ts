import { getDb } from '../index.js'
import { ConversationHistoryTable } from '../schema/tables.js'
import { parseJsonColumn, stringifyJsonColumn } from '../schema/helpers.js'

const C = ConversationHistoryTable.columns

export interface Message {
  id: number
  sessionId: string
  role: 'user' | 'assistant'
  content: string
  motionId?: string
  expressionId?: string
  vocabulary?: string[]
  vocabularySentences?: string[]
}

export function getSessionMessages(sessionId: string): Message[] {
  const db = getDb()
  const rows = db.prepare(
    `SELECT ${C.id.name}, ${C.session_id.name}, ${C.role.name}, ${C.content.name},
            ${C.motion_id.name}, ${C.expression_id.name}, ${C.vocabulary.name},
            ${C.vocabulary_sentences.name}
     FROM ${ConversationHistoryTable.name}
     WHERE ${C.session_id.name} = ?
     ORDER BY ${C.created_at.name} ASC, ${C.id.name} ASC`,
  ).all(sessionId) as Array<{
    id: number
    session_id: string
    role: string
    content: string
    motion_id: string | null
    expression_id: string | null
    vocabulary: string | null
    vocabulary_sentences: string | null
  }>

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    role: row.role as 'user' | 'assistant',
    content: row.content,
    motionId: row.motion_id ?? undefined,
    expressionId: row.expression_id ?? undefined,
    vocabulary: parseJsonColumn<string[]>(row.vocabulary),
    vocabularySentences: parseJsonColumn<string[]>(row.vocabulary_sentences),
  }))
}

export function saveMessage(message: Omit<Message, 'id'>): Message {
  const db = getDb()
  const result = db.prepare(
    `INSERT INTO ${ConversationHistoryTable.name} (
       ${C.session_id.name}, ${C.role.name}, ${C.content.name},
       ${C.motion_id.name}, ${C.expression_id.name}, ${C.vocabulary.name},
       ${C.vocabulary_sentences.name}
     )
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    message.sessionId,
    message.role,
    message.content,
    message.motionId ?? null,
    message.expressionId ?? null,
    stringifyJsonColumn(message.vocabulary),
    stringifyJsonColumn(message.vocabularySentences),
  )

  return {
    id: Number(result.lastInsertRowid),
    ...message,
  }
}
