import assert from 'node:assert'
import { pickScenarioVocabulary } from './scenario-vocab-picker.js'
import { getScenarioById } from '../vocab/loader.js'

async function main(): Promise<void> {
  const scenario = getScenarioById('restaurant-ordering')
  assert(scenario, 'restaurant-ordering scenario should exist')

  // 默认抽 30 个
  const wordsA1 = pickScenarioVocabulary(scenario, 'A1')
  assert.strictEqual(wordsA1.length, 30, 'should pick 30 words by default')

  // 返回的词不重复
  const unique = new Set(wordsA1.map((w) => w.toLowerCase()))
  assert.strictEqual(unique.size, wordsA1.length, 'picked words should be unique')

  // 指定数量
  const words10 = pickScenarioVocabulary(scenario, 'A1', 10)
  assert.strictEqual(words10.length, 10, 'should respect targetCount')

  // C2 没有更高档可借，仍应返回 30 个（从 C2 全量随机补）
  const wordsC2 = pickScenarioVocabulary(scenario, 'C2')
  assert.strictEqual(wordsC2.length, 30, 'C2 should still return 30 words')

  console.log('✅ scenario-vocab-picker test passed')
}

main().catch((err) => {
  console.error('❌ scenario-vocab-picker test failed:', err)
  process.exitCode = 1
})
