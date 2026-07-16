import type { TestEnv } from './env'

export async function initTestDb(env: TestEnv): Promise<void> {
  env.setup()
  const { initSchema } = await import('@/db/index.js')
  initSchema()
}

export async function closeTestDb(): Promise<void> {
  const { closeDb } = await import('@/db/index.js')
  closeDb()
}
