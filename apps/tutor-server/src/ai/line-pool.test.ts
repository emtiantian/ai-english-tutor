import assert from 'node:assert'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 在导入读取配置的模块之前设置环境变量。
const tmp = mkdtempSync(join(tmpdir(), 'line-pool-test-'))
process.env.DATA_DIR = tmp
process.env.LINE_POOL_DIR = join(tmp, 'line-pool')
process.env.LINE_POOL_MAX_LINES = '3'

const { lineGroupKey, recordTeacherLine, getReusableLines } = await import('./line-pool.js')

async function main() {
  const group = lineGroupKey('restaurant-ordering', 'A1', 'voiceA')

  // 空池 → 没有台词（冷启动）。
  assert.deepStrictEqual(await getReusableLines(group), [], 'cold start should be empty')

  // 记录一句台词；它应出现。
  await recordTeacherLine(group, 'Good evening! Welcome.')
  assert.deepStrictEqual(
    await getReusableLines(group),
    ['Good evening! Welcome.'],
    'recorded line should be returned',
  )

  // 按归一化文本去重（空白/大小写）→ 不产生重复条目，计数增加。
  await recordTeacherLine(group, '  good   evening! welcome.  ')
  const afterDedup = await getReusableLines(group)
  assert.strictEqual(afterDedup.length, 1, 'normalized duplicate should not add a new entry')
  assert.strictEqual(afterDedup[0], 'Good evening! Welcome.', 'verbatim original text preserved')

  // 频率排序：说得更频繁的台词排名更高。
  await recordTeacherLine(group, 'What would you like to drink?')
  await recordTeacherLine(group, 'What would you like to drink?')
  await recordTeacherLine(group, 'What would you like to drink?')
  const ranked = await getReusableLines(group)
  assert.strictEqual(ranked[0], 'What would you like to drink?', 'most-used line ranks first')

  // 淘汰：MAX_LINES=3，加入足够多的不同台词以强制淘汰计数最低的。
  await recordTeacherLine(group, 'Here is your table.')
  await recordTeacherLine(group, 'Anything else?')
  const capped = await getReusableLines(group, 100)
  assert.ok(capped.length <= 3, `pool capped at MAX_LINES, got ${capped.length}`)
  assert.ok(
    capped.includes('What would you like to drink?'),
    'highest-frequency line survives eviction',
  )

  // 不同音色 → 不同分组 → 隔离的池。
  const otherVoice = lineGroupKey('restaurant-ordering', 'A1', 'voiceB')
  assert.deepStrictEqual(await getReusableLines(otherVoice), [], 'different voice is a separate pool')

  // 空/纯空白文本被忽略。
  await recordTeacherLine(group, '   ')
  console.log('✅ line-pool test passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
