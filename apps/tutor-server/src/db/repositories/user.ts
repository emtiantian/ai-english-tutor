import { getDb } from '../index.js'

export interface User {
  id: string
  name: string | null
  level: number
  totalStudyTime: number
  totalWordsLearned: number
  createdAt: Date
  updatedAt: Date
}

export interface CreateUserInput {
  id?: string
  name?: string
  level?: number
}

export interface UpdateUserInput {
  name?: string
  level?: number
  totalStudyTime?: number
  totalWordsLearned?: number
}

export const userRepo = {
  create(input: CreateUserInput): User {
    const db = getDb()
    const id = input.id ?? `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const now = Math.floor(Date.now() / 1000)

    db.prepare(
      `INSERT INTO users (id, name, level, total_study_time, total_words_learned, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, input.name ?? null, input.level ?? 1, 0, 0, now, now)

    return this.findById(id)!
  },

  findById(id: string): User | undefined {
    const db = getDb()
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined
    return row ? mapRow(row) : undefined
  },

  update(id: string, input: UpdateUserInput): User {
    const db = getDb()
    const sets: string[] = []
    const values: unknown[] = []

    if (input.name !== undefined) {
      sets.push('name = ?')
      values.push(input.name)
    }
    if (input.level !== undefined) {
      sets.push('level = ?')
      values.push(input.level)
    }
    if (input.totalStudyTime !== undefined) {
      sets.push('total_study_time = ?')
      values.push(input.totalStudyTime)
    }
    if (input.totalWordsLearned !== undefined) {
      sets.push('total_words_learned = ?')
      values.push(input.totalWordsLearned)
    }

    if (sets.length === 0) {
      return this.findById(id)!
    }

    sets.push('updated_at = unixepoch()')
    values.push(id)

    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values)
    return this.findById(id)!
  },

  incrementStudyTime(id: string, minutes: number): void {
    const db = getDb()
    db.prepare(
      'UPDATE users SET total_study_time = total_study_time + ?, updated_at = unixepoch() WHERE id = ?',
    ).run(minutes, id)
  },
}

function mapRow(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    name: row.name ? String(row.name) : null,
    level: Number(row.level),
    totalStudyTime: Number(row.total_study_time),
    totalWordsLearned: Number(row.total_words_learned),
    createdAt: new Date(Number(row.created_at) * 1000),
    updatedAt: new Date(Number(row.updated_at) * 1000),
  }
}
