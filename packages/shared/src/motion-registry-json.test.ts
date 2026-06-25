import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  motionRegistryFromJson,
  buildMotionPromptBlock,
  buildExpressionPromptBlock,
  type MotionRegistryJson,
} from './motion-registry-json'

describe('motionRegistryFromJson', () => {
  const sample: MotionRegistryJson = {
    characterId: 'test',
    motions: { wave: 'Greet_1', nod: 'Agree_2' },
    expressions: { happy: 'smile' },
    motionDescriptions: { wave: '挥手' },
    expressionDescriptions: { happy: '开心' },
  }

  it('maps motion and expression ids', () => {
    const registry = motionRegistryFromJson(sample)
    assert.strictEqual(registry.getMotion('wave'), 'Greet_1')
    assert.strictEqual(registry.getExpression('happy'), 'smile')
  })

  it('falls back for unknown motion', () => {
    const registry = motionRegistryFromJson(sample)
    assert.strictEqual(registry.getMotion('think'), 'Idle_0')
  })

  it('uses custom descriptions', () => {
    const registry = motionRegistryFromJson(sample)
    const motions = registry.getAvailableMotions()
    const wave = motions.find((m) => m.semanticId === 'wave')
    assert.strictEqual(wave?.description, '挥手')
  })

  it('only returns mapped motions in getAvailableMotions', () => {
    const registry = motionRegistryFromJson(sample)
    const motions = registry.getAvailableMotions()
    assert.strictEqual(motions.length, 2)
    assert.ok(motions.some((m) => m.semanticId === 'wave'))
    assert.ok(motions.some((m) => m.semanticId === 'nod'))
    assert.ok(!motions.some((m) => m.semanticId === 'think'))
  })

  it('only returns mapped expressions in getAvailableExpressions', () => {
    const registry = motionRegistryFromJson(sample)
    const expressions = registry.getAvailableExpressions()
    assert.strictEqual(expressions.length, 1)
    assert.strictEqual(expressions[0]?.semanticId, 'happy')
  })
})

describe('buildMotionPromptBlock', () => {
  const sample: MotionRegistryJson = {
    characterId: 'test',
    motions: { wave: 'W', nod: 'N', think: 'T' },
    expressions: {},
    motionDescriptions: {
      wave: '挥手',
      nod: '点头',
      think: '思考',
    },
  }

  it('lists all motions with Chinese descriptions', () => {
    const registry = motionRegistryFromJson(sample)
    const block = buildMotionPromptBlock(registry)
    assert.ok(block.includes('1. wave: 挥手'))
    assert.ok(block.includes('2. nod: 点头'))
    assert.ok(block.includes('3. think: 思考'))
  })

  it('filters by enabled config', () => {
    const registry = motionRegistryFromJson(sample)
    const block = buildMotionPromptBlock(registry, { enabled: ['wave'] })
    assert.ok(block.includes('1. wave: 挥手'))
    assert.ok(!block.includes('nod'))
  })

  it('overrides descriptions', () => {
    const registry = motionRegistryFromJson(sample)
    const block = buildMotionPromptBlock(registry, {
      descriptions: { wave: 'Hello wave' },
    })
    assert.ok(block.includes('1. wave: Hello wave'))
  })

  it('returns empty string when enabled is empty', () => {
    const registry = motionRegistryFromJson(sample)
    const block = buildMotionPromptBlock(registry, { enabled: [] })
    assert.strictEqual(block, '')
  })
})

describe('buildExpressionPromptBlock', () => {
  const sample: MotionRegistryJson = {
    characterId: 'test',
    motions: {},
    expressions: { happy: 'H', neutral: 'N' },
    expressionDescriptions: {
      happy: '开心',
      neutral: '平静',
    },
  }

  it('lists enabled expressions', () => {
    const registry = motionRegistryFromJson(sample)
    const block = buildExpressionPromptBlock(registry, { enabled: ['happy'] })
    assert.ok(block.includes('1. happy: 开心'))
    assert.ok(!block.includes('neutral'))
  })

  it('overrides descriptions', () => {
    const registry = motionRegistryFromJson(sample)
    const block = buildExpressionPromptBlock(registry, {
      descriptions: { happy: 'Joyful' },
    })
    assert.ok(block.includes('1. happy: Joyful'))
  })

  it('returns empty string when enabled is empty', () => {
    const registry = motionRegistryFromJson(sample)
    const block = buildExpressionPromptBlock(registry, { enabled: [] })
    assert.strictEqual(block, '')
  })
})
