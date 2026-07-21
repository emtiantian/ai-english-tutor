/**
 * Schema registry 类型系统。
 *
 * 通过 `defineTable` 声明表结构，再用 `InferRow` 从声明中推导数据库行类型，
 * 使 SQL 列名、类型与 TypeScript 类型共享同一个事实来源。
 */

export type SqlType = 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB'

export interface ForeignKeyDef {
  table: string
  column: string
}

export interface ColumnDef {
  /** SQLite 存储类型 */
  type: SqlType
  /** 是否允许 NULL；不指定时按 SQLite 默认视为允许 NULL */
  nullable?: boolean
  /** 默认值，直接写入 SQL，如 `(unixepoch())`、`'active'`、`0` */
  default?: string
  /** 是否为主键 */
  primaryKey?: boolean
  /** 是否为 AUTOINCREMENT（仅 INTEGER PRIMARY KEY 有效） */
  autoIncrement?: boolean
  /** 是否为 UNIQUE */
  unique?: boolean
  /** 外键引用 */
  references?: ForeignKeyDef
}

/** 在运行时注入列名后的列定义。 */
export type NamedColumnDef<K extends string = string> = ColumnDef & { name: K }

export type ColumnMap = Record<string, ColumnDef>
export type NamedColumnMap = Record<string, NamedColumnDef>

export interface IndexDef {
  /** 索引名 */
  name: string
  /** 索引列（snake_case） */
  columns: string[]
  /** 是否为唯一索引 */
  unique?: boolean
}

export interface TableSchemaOptions {
  indexes?: IndexDef[]
  /** 多列联合唯一约束，每项是一组列名。 */
  uniques?: string[][]
}

export interface TableSchema<
  Name extends string = string,
  Columns extends NamedColumnMap = NamedColumnMap
> {
  name: Name
  columns: Columns
  indexes?: IndexDef[]
  uniques?: string[][]
}

export function defineTable<const Name extends string, const Columns extends ColumnMap>(
  name: Name,
  columns: Columns,
  options: TableSchemaOptions = {}
): TableSchema<Name, { [K in keyof Columns]: NamedColumnDef<K & string> }> {
  const namedColumns = {} as Record<string, NamedColumnDef>
  for (const [key, column] of Object.entries(columns)) {
    namedColumns[key] = { ...column, name: key }
  }

  return {
    name,
    columns: namedColumns as { [K in keyof Columns]: NamedColumnDef<K & string> },
    indexes: options.indexes,
    uniques: options.uniques
  }
}

/** 将 snake_case 字符串转为 camelCase 的类型工具。 */
type CamelCase<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? `${Head}${CamelCase<Capitalize<Tail>>}`
  : S

/** 根据 SQL 类型推导 TS 类型。 */
type InferSqlType<T extends SqlType> = T extends 'INTEGER'
  ? number
  : T extends 'TEXT'
    ? string
    : T extends 'REAL'
      ? number
      : T extends 'BLOB'
        ? Buffer
        : never

/** 根据列定义判断是否应为 `| null`。 */
type InferNullable<C extends ColumnDef> = C['nullable'] extends false
  ? never
  : C['primaryKey'] extends true
    ? never
    : null

/** 从表声明推导出行类型（camelCase 属性名）。 */
export type InferRow<T extends TableSchema> = {
  [K in keyof T['columns'] as CamelCase<K & string>]:
    InferSqlType<T['columns'][K]['type']> | InferNullable<T['columns'][K]>
}

/** 按 snake_case 名提取列定义。 */
export type ColumnByName<T extends TableSchema, N extends keyof T['columns']> = T['columns'][N]

/** 提取列对应的 camelCase 属性名。 */
export type ColumnKey<T extends TableSchema, N extends keyof T['columns']> = CamelCase<N & string>
