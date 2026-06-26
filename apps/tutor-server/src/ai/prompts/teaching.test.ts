import assert from 'node:assert'
import { scenarios, LUNA_PERSONA } from '@ai-english-tutor/shared'
import {
  buildScenarioStartMessages,
  buildScenarioTeachingMessages,
} from './teaching.js'

const restaurant = scenarios.find((s) => s.id === 'restaurant-ordering')!
const runtimeWords = Array.from({ length: 30 }, (_, i) => `word${i + 1}`)

async function main(): Promise<void> {
  // ── Start messages should inject runtime target words, not static scenario words ──
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
    startSystem.includes('TARGET VOCABULARY POOL'),
    'start prompt should declare target vocabulary pool',
  )
  for (const w of runtimeWords) {
    assert(startSystem.includes(w), `start prompt should include runtime target word "${w}"`)
  }
  assert(startSystem.includes('CURRENT ACT: 1 of 3'), 'start prompt should open at act 1')
  assert(
    startSystem.includes('FOCUS WORDS FOR THIS TURN'),
    'start prompt should tell LLM which words to focus on',
  )

  // ── Teaching messages should focus on unused words from the current act ──
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
    teachingSystem.includes('TARGET VOCABULARY POOL'),
    'teaching prompt should declare target vocabulary pool',
  )
  for (const w of usedWords) {
    assert(
      teachingSystem.includes(`- ${w}`),
      `teaching prompt should list used target word "${w}"`,
    )
  }

  // Focus words for act 1 should come from the first bucket and exclude used words
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
    teachingSystem.includes('studentReplyHints MUST be'),
    'teaching prompt should instruct hints to include target words',
  )

  // ── Fallback to scenario.targetWords when runtime words are missing ──
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
