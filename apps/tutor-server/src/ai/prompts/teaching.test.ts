import assert from 'node:assert'
import { scenarios, LUNA_PERSONA } from '@ai-english-tutor/shared'
import {
  buildScenarioStartMessages,
  buildScenarioTeachingMessages,
} from './teaching.js'

const restaurant = scenarios.find((s) => s.id === 'restaurant-ordering')!
const runtimeWords = Array.from({ length: 30 }, (_, i) => `word${i + 1}`)

async function main(): Promise<void> {
  // ── 开场消息应注入运行时目标词，而非静态场景词 ──
  const { messages: startMessages } = buildScenarioStartMessages(
    restaurant,
    1,
    'A1',
    undefined,
    LUNA_PERSONA,
    undefined,
    runtimeWords,
  )
  const startSystem = String(startMessages[0].content)

  assert(
    startSystem.includes('目标词汇池'),
    'start prompt should declare target vocabulary pool',
  )
  for (const w of runtimeWords) {
    assert(startSystem.includes(w), `start prompt should include runtime target word "${w}"`)
  }
  assert(startSystem.includes('当前幕：第 1 / 3 幕'), 'start prompt should open at act 1')
  assert(
    startSystem.includes('本轮焦点词'),
    'start prompt should tell LLM which words to focus on',
  )

  // ── 教学消息应聚焦当前幕中未使用的词 ──
  const usedWords = ['word1', 'word2', 'word3']
  const teachingMessages = buildScenarioTeachingMessages(
    'I would like to order something.',
    restaurant,
    1,
    'A1',
    [],
    undefined,
    LUNA_PERSONA,
    undefined,
    undefined,
    runtimeWords,
    { currentActIndex: 0, wordsUsed: usedWords },
  )
  const teachingSystem = String(teachingMessages[0].content)

  assert(
    teachingSystem.includes('目标词汇池'),
    'teaching prompt should declare target vocabulary pool',
  )
  for (const w of usedWords) {
    assert(
      teachingSystem.includes(`- ${w}`),
      `teaching prompt should list used target word "${w}"`,
    )
  }

  // 第 1 幕的焦点词应来自第一个桶，并排除已使用的词
  const bucketSize = Math.ceil(runtimeWords.length / 3)
  const firstBucket = runtimeWords.slice(0, bucketSize)
  const firstBucketUnused = firstBucket.filter((w) => !usedWords.includes(w))
  for (const w of firstBucketUnused.slice(0, 5)) {
    assert(
      teachingSystem.includes(`- ${w}`),
      `teaching prompt should include first-bucket unused focus word "${w}"`,
    )
  }

  assert(
    teachingSystem.includes('studentReplyHints 必须是'),
    'teaching prompt should instruct hints to include target words',
  )

  // ── 缺少运行时词汇时回退到 scenario.targetWords ──
  const { messages: fallbackMessages } = buildScenarioStartMessages(
    restaurant,
    1,
    'A1',
    undefined,
    LUNA_PERSONA,
    undefined,
    undefined,
  )
  const fallbackSystem = String(fallbackMessages[0].content)
  for (const w of restaurant.targetWords) {
    assert(
      fallbackSystem.includes(w),
      `fallback start prompt should include static scenario target word "${w}"`,
    )
  }

  console.log('✅ teaching prompt test passed')
}

main().catch((err) => {
  console.error('❌ teaching prompt test failed:', err)
  process.exitCode = 1
})
