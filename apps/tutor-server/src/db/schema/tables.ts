import { defineTable } from './types.js'

/**
 * 数据库 schema 注册表。
 *
 * 所有表、列、索引都在这里集中声明，作为 SQL 与 TypeScript 类型的唯一事实来源。
 */

export const UsersTable = defineTable('users', {
  id: { type: 'TEXT', primaryKey: true },
  name: { type: 'TEXT' },
  level: { type: 'INTEGER', default: '1' },
  total_study_time: { type: 'INTEGER', default: '0' },
  total_words_learned: { type: 'INTEGER', default: '0' },
  created_at: { type: 'INTEGER', default: '(unixepoch())' },
  updated_at: { type: 'INTEGER', default: '(unixepoch())' },
})

export const SessionsTable = defineTable('sessions', {
  id: { type: 'TEXT', primaryKey: true },
  user_id: { type: 'TEXT', references: { table: 'users', column: 'id' } },
  level: { type: 'INTEGER', default: '1' },
  style_name: { type: 'TEXT' },
  voice_design: { type: 'TEXT' },
  scenario_state: { type: 'TEXT' },
  status: { type: 'TEXT', default: "'active'" },
  vocabulary_count: { type: 'INTEGER', default: '0' },
  message_count: { type: 'INTEGER', default: '0' },
  created_at: { type: 'INTEGER', default: '(unixepoch())' },
  updated_at: { type: 'INTEGER', default: '(unixepoch())' },
}, {
  indexes: [
    { name: 'idx_sessions_user', columns: ['user_id'] },
  ],
})

export const UserVocabularyTable = defineTable('user_vocabulary', {
  id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
  user_id: { type: 'TEXT', nullable: false },
  word: { type: 'TEXT', nullable: false },
  level: { type: 'TEXT', nullable: false },
  status: { type: 'TEXT', default: "'learning'" },
  review_count: { type: 'INTEGER', default: '0' },
  correct_count: { type: 'INTEGER', default: '0' },
  incorrect_count: { type: 'INTEGER', default: '0' },
  last_review_at: { type: 'INTEGER' },
  next_review_at: { type: 'INTEGER' },
  context_count: { type: 'INTEGER', default: '0' },
  contexts: { type: 'TEXT', default: "'[]'" },
  consecutive_incorrect: { type: 'INTEGER', default: '0' },
  updated_at: { type: 'INTEGER', default: '(unixepoch())' },
  created_at: { type: 'INTEGER', default: '(unixepoch())' },
}, {
  indexes: [
    { name: 'idx_uv_user', columns: ['user_id'] },
    { name: 'idx_uv_word', columns: ['word'] },
    { name: 'idx_uv_status', columns: ['status'] },
    { name: 'idx_uv_next_review', columns: ['user_id', 'next_review_at'] },
  ],
  uniques: [['user_id', 'word']],
})

export const ConversationHistoryTable = defineTable('conversation_history', {
  id: { type: 'INTEGER', primaryKey: true, autoIncrement: true },
  session_id: { type: 'TEXT', nullable: false },
  role: { type: 'TEXT', nullable: false },
  content: { type: 'TEXT', nullable: false },
  motion_id: { type: 'TEXT' },
  expression_id: { type: 'TEXT' },
  vocabulary: { type: 'TEXT' },
  vocabulary_sentences: { type: 'TEXT' },
  created_at: { type: 'INTEGER', default: '(unixepoch())' },
}, {
  indexes: [
    { name: 'idx_ch_session', columns: ['session_id'] },
  ],
})

/** 所有业务表，按依赖顺序排列（users 在前，因为 sessions 引用它）。 */
export const allTables = [
  UsersTable,
  SessionsTable,
  UserVocabularyTable,
  ConversationHistoryTable,
] as const
