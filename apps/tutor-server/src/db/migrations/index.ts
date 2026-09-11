import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface Migration {
  version: number
  name: string
  sql: string
}

function load(version: number, name: string): Migration {
  return {
    version,
    name,
    sql: readFileSync(join(__dirname, `${String(version).padStart(4, '0')}_${name}.sql`), 'utf-8')
  }
}

export const allMigrations: Migration[] = [
  load(1, 'init'),
  load(2, 'add_missing_columns'),
  load(3, 'vocab_sync_operations')
]
