import { getDb } from './index.js'

export interface Session {
  id: string
  level: number
  styleName?: string
  voiceDesign?: string
  /** 当前场景状态的序列化 JSON */
  scenarioState?: string
  createdAt: number
}

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

export function saveSession(session: Session): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO sessions (id, level, style_name, voice_design, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       level = excluded.level,
       style_name = excluded.style_name,
       voice_design = excluded.voice_design,
       updated_at = excluded.updated_at`
  ).run(
    session.id,
    session.level,
    session.styleName ?? null,
    session.voiceDesign ?? null,
    session.createdAt,
    Math.floor(Date.now() / 1000)
  )
}

export function getSession(sessionId: string): Session | undefined {
  const db = getDb()
  const row = db.prepare(
    `SELECT id, level, style_name, voice_design, scenario_state, created_at FROM sessions WHERE id = ?`
  ).get(sessionId) as
    | { id: string; level: number; style_name: string | null; voice_design: string | null; scenario_state: string | null; created_at: number }
    | undefined

  if (!row) return undefined

  return {
    id: row.id,
    level: row.level,
    styleName: row.style_name ?? undefined,
    voiceDesign: row.voice_design ?? undefined,
    scenarioState: row.scenario_state ?? undefined,
    createdAt: row.created_at,
  }
}

export function saveScenarioState(sessionId: string, scenarioState: string): void {
  const db = getDb()
  db.prepare(
    `UPDATE sessions
     SET scenario_state = ?, updated_at = ?
     WHERE id = ?`
  ).run(scenarioState, Math.floor(Date.now() / 1000), sessionId)
}

export function getSessionMessages(sessionId: string): Message[] {
  const db = getDb()
  const rows = db.prepare(
    `SELECT id, session_id, role, content, motion_id, expression_id, vocabulary, vocabulary_sentences
     FROM conversation_history
     WHERE session_id = ?
     ORDER BY created_at ASC, id ASC`
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
    vocabulary: row.vocabulary ? JSON.parse(row.vocabulary) : undefined,
    vocabularySentences: row.vocabulary_sentences ? JSON.parse(row.vocabulary_sentences) : undefined,
  }))
}

export function saveMessage(message: Omit<Message, 'id'>): Message {
  const db = getDb()
  const result = db.prepare(
    `INSERT INTO conversation_history (session_id, role, content, motion_id, expression_id, vocabulary, vocabulary_sentences)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    message.sessionId,
    message.role,
    message.content,
    message.motionId ?? null,
    message.expressionId ?? null,
    message.vocabulary ? JSON.stringify(message.vocabulary) : null,
    message.vocabularySentences ? JSON.stringify(message.vocabularySentences) : null
  )

  return {
    id: Number(result.lastInsertRowid),
    ...message,
  }
}

export function deleteSession(sessionId: string): void {
  const db = getDb()
  db.prepare(`DELETE FROM conversation_history WHERE session_id = ?`).run(sessionId)
  db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId)
}
