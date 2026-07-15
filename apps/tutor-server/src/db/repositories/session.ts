import { getDb } from '../index.js'
import { ConversationHistoryTable, SessionsTable } from '../schema/tables.js'

const C = SessionsTable.columns
const MsgC = ConversationHistoryTable.columns

export interface Session {
  id: string
  level: number
  styleName?: string
  voiceDesign?: string
  /** 当前场景状态的序列化 JSON */
  scenarioState?: string
  createdAt: number
}

export function saveSession(session: Session): void {
  const db = getDb()
  db.prepare(
    `INSERT INTO ${SessionsTable.name} (
       ${C.id.name}, ${C.level.name}, ${C.style_name.name},
       ${C.voice_design.name}, ${C.created_at.name}, ${C.updated_at.name}
     )
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(${C.id.name}) DO UPDATE SET
       ${C.level.name} = excluded.${C.level.name},
       ${C.style_name.name} = excluded.${C.style_name.name},
       ${C.voice_design.name} = excluded.${C.voice_design.name},
       ${C.updated_at.name} = excluded.${C.updated_at.name}`,
  ).run(
    session.id,
    session.level,
    session.styleName ?? null,
    session.voiceDesign ?? null,
    session.createdAt,
    Math.floor(Date.now() / 1000),
  )
}

export function getSession(sessionId: string): Session | undefined {
  const db = getDb()
  const row = db.prepare(
    `SELECT ${C.id.name}, ${C.level.name}, ${C.style_name.name},
            ${C.voice_design.name}, ${C.scenario_state.name}, ${C.created_at.name}
     FROM ${SessionsTable.name}
     WHERE ${C.id.name} = ?`,
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
    `UPDATE ${SessionsTable.name}
     SET ${C.scenario_state.name} = ?, ${C.updated_at.name} = ?
     WHERE ${C.id.name} = ?`,
  ).run(scenarioState, Math.floor(Date.now() / 1000), sessionId)
}

export function deleteSession(sessionId: string): void {
  const db = getDb()
  db.prepare(
    `DELETE FROM ${ConversationHistoryTable.name} WHERE ${MsgC.session_id.name} = ?`,
  ).run(sessionId)
  db.prepare(`DELETE FROM ${SessionsTable.name} WHERE ${C.id.name} = ?`).run(sessionId)
}
