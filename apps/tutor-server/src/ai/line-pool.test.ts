import assert from 'node:assert'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Set env BEFORE importing modules that read config.
const tmp = mkdtempSync(join(tmpdir(), 'line-pool-test-'))
process.env.DATA_DIR = tmp
process.env.LINE_POOL_DIR = join(tmp, 'line-pool')
process.env.LINE_POOL_MAX_LINES = '3'

const { lineGroupKey, recordTeacherLine, getReusableLines } = await import('./line-pool.js')

async function main() {
  const group = lineGroupKey('restaurant-ordering', 'A1', 'voiceA')

  // Empty pool → no lines (cold start).
  assert.deepStrictEqual(await getReusableLines(group), [], 'cold start should be empty')

  // Record a line; it appears.
  await recordTeacherLine(group, 'Good evening! Welcome.')
  assert.deepStrictEqual(
    await getReusableLines(group),
    ['Good evening! Welcome.'],
    'recorded line should be returned',
  )

  // Dedup by normalized text (whitespace/case) → no duplicate entry, count bumps.
  await recordTeacherLine(group, '  good   evening! welcome.  ')
  const afterDedup = await getReusableLines(group)
  assert.strictEqual(afterDedup.length, 1, 'normalized duplicate should not add a new entry')
  assert.strictEqual(afterDedup[0], 'Good evening! Welcome.', 'verbatim original text preserved')

  // Frequency ranking: a line said more often ranks higher.
  await recordTeacherLine(group, 'What would you like to drink?')
  await recordTeacherLine(group, 'What would you like to drink?')
  await recordTeacherLine(group, 'What would you like to drink?')
  const ranked = await getReusableLines(group)
  assert.strictEqual(ranked[0], 'What would you like to drink?', 'most-used line ranks first')

  // Eviction: MAX_LINES=3, push enough distinct lines to force eviction of the lowest-count.
  await recordTeacherLine(group, 'Here is your table.')
  await recordTeacherLine(group, 'Anything else?')
  const capped = await getReusableLines(group, 100)
  assert.ok(capped.length <= 3, `pool capped at MAX_LINES, got ${capped.length}`)
  assert.ok(
    capped.includes('What would you like to drink?'),
    'highest-frequency line survives eviction',
  )

  // Different voice → different group → isolated pool.
  const otherVoice = lineGroupKey('restaurant-ordering', 'A1', 'voiceB')
  assert.deepStrictEqual(await getReusableLines(otherVoice), [], 'different voice is a separate pool')

  // Empty/whitespace text is ignored.
  await recordTeacherLine(group, '   ')
  console.log('✅ line-pool test passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
