import type { ColumnDef, IndexDef, TableSchema } from './types.js'

/**
 * 根据 schema registry 生成 SQLite DDL。
 */

export function buildCreateTableSql(table: TableSchema): string {
  const columnDefs = Object.entries(table.columns).map(([name, column]) =>
    buildColumnDefSql(name, column),
  )

  const uniqueDefs = (table.uniques ?? []).map(
    (columns) => `UNIQUE(${columns.join(', ')})`,
  )

  const body = [...columnDefs, ...uniqueDefs].join(',\n  ')

  return `CREATE TABLE IF NOT EXISTS ${table.name} (\n  ${body}\n)`
}

function buildColumnDefSql(name: string, column: ColumnDef): string {
  let def = `${name} ${column.type}`

  if (column.primaryKey) {
    def += ' PRIMARY KEY'
  }
  if (column.autoIncrement) {
    def += ' AUTOINCREMENT'
  }
  if (column.unique && !column.primaryKey) {
    def += ' UNIQUE'
  }
  if (column.nullable === false || column.primaryKey) {
    def += ' NOT NULL'
  }
  if (column.default !== undefined) {
    def += ` DEFAULT ${column.default}`
  }
  if (column.references) {
    def += ` REFERENCES ${column.references.table}(${column.references.column})`
  }

  return def
}

export function buildCreateIndexSql(tableName: string, index: IndexDef): string {
  const unique = index.unique ? 'UNIQUE ' : ''
  return `CREATE ${unique}INDEX IF NOT EXISTS ${index.name} ON ${tableName}(${index.columns.join(', ')})`
}

/**
 * 命名风格转换。
 */

export function toCamelCase(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

export function toSnakeCase(camel: string): string {
  return camel.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

/**
 * JSON 列转换辅助函数。
 */

export function parseJsonColumn<T>(value: string | null | undefined): T | undefined {
  if (!value) return undefined
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

export function stringifyJsonColumn(value: unknown): string | null {
  if (value === undefined || value === null) return null
  return JSON.stringify(value)
}

/**
 * 时间戳转换辅助函数。
 */

export function dateToUnixepoch(date: Date): number {
  return Math.floor(date.getTime() / 1000)
}

export function unixepochToDate(ts: number | null | undefined): Date | null {
  if (ts === null || ts === undefined) return null
  return new Date(ts * 1000)
}

/**
 * 按表名查找表声明。
 */

export function findTableByName(
  tables: readonly TableSchema[],
  name: string,
): TableSchema | undefined {
  return tables.find((t) => t.name === name)
}

/**
 * 生成某张表的所有 CREATE INDEX 语句。
 */

export function buildTableIndexSql(table: TableSchema): string[] {
  return (table.indexes ?? []).map((idx) => buildCreateIndexSql(table.name, idx))
}
