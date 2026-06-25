import { describe, it, expect } from 'vitest'
import {
  AVAILABLE_LIVE2D_MODELS,
  DEFAULT_LIVE2D_MODEL_ID,
  HIYORI_MANIFEST,
  getLive2DModelManifest,
  getLive2DModelManifestOrDefault,
} from '@ai-english-tutor/shared'

describe('Live2D model manifests', () => {
  it('HIYORI_MANIFEST is well-formed', () => {
    expect(HIYORI_MANIFEST.id).toBe('hiyori')
    expect(HIYORI_MANIFEST.type).toBe('live2d')
    expect(HIYORI_MANIFEST.modelJsonPath).toMatch(/^\/models\/hiyori\/.+\.model3\.json$/)
    expect(HIYORI_MANIFEST.hasExpressions).toBe(false)
    expect(HIYORI_MANIFEST.expressionParamPresets).toBeDefined()
    // 必须保留 重构前的 7 个表情
    const presets = HIYORI_MANIFEST.expressionParamPresets!
    for (const expr of ['happy', 'neutral', 'curious', 'surprised', 'encouraging', 'thoughtful', 'sad']) {
      expect(presets[expr]).toBeDefined()
    }
    // neutral 必须把所有参数都设为 0(防止表情漂移)
    expect(presets.neutral.ParamMouthForm).toBe(0)
    expect(presets.neutral.ParamCheek).toBe(0)
  })

  it('HIYORI_MANIFEST has a valid motion registry', () => {
    expect(HIYORI_MANIFEST.motionRegistry.characterId).toBe('hiyori')
    expect(HIYORI_MANIFEST.motionRegistry.getMotion('wave')).toBe('Idle_0')
    expect(HIYORI_MANIFEST.motionRegistry.getMotion('surprised')).toBe('Idle_7')
  })

  it('HIYORI_MANIFEST has credit metadata', () => {
    expect(HIYORI_MANIFEST.credit.author).toBe('Live2D Inc.')
    expect(HIYORI_MANIFEST.credit.licenseUrl).toContain('live2d.com')
  })

  it('AVAILABLE_LIVE2D_MODELS includes hiyori', () => {
    expect(AVAILABLE_LIVE2D_MODELS.length).toBeGreaterThanOrEqual(1)
    expect(AVAILABLE_LIVE2D_MODELS.find((m) => m.id === 'hiyori')).toBe(HIYORI_MANIFEST)
  })

  it('DEFAULT_LIVE2D_MODEL_ID points to hiyori', () => {
    expect(DEFAULT_LIVE2D_MODEL_ID).toBe('hiyori')
  })

  it('getLive2DModelManifest returns manifest by id', () => {
    expect(getLive2DModelManifest('hiyori')).toBe(HIYORI_MANIFEST)
    expect(getLive2DModelManifest('nonexistent')).toBeUndefined()
  })

  it('getLive2DModelManifestOrDefault falls back to hiyori', () => {
    expect(getLive2DModelManifestOrDefault('hiyori')).toBe(HIYORI_MANIFEST)
    expect(getLive2DModelManifestOrDefault('nonexistent')).toBe(HIYORI_MANIFEST)
    expect(getLive2DModelManifestOrDefault(undefined)).toBe(HIYORI_MANIFEST)
    expect(getLive2DModelManifestOrDefault()).toBe(HIYORI_MANIFEST)
  })
})
