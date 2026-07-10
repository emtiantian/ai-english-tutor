import { describe, it, expect } from 'vitest'
import {
  AVAILABLE_LIVE2D_MODELS,
  DEFAULT_LIVE2D_MODEL_ID,
  HIYORI_MANIFEST,
  SHIZUKU_MANIFEST,
  MAO_PRO_MANIFEST,
  getLive2DModelManifest,
  getLive2DModelManifestOrDefault,
} from '@ai-english-tutor/shared'

describe('Live2D model manifests', () => {
  it('HIYORI_MANIFEST is well-formed', () => {
    expect(HIYORI_MANIFEST.id).toBe('hiyori')
    expect(HIYORI_MANIFEST.type).toBe('live2d')
    expect(HIYORI_MANIFEST.modelJsonPath).toBe('/models/hiyori/hiyori.model3.json')
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

  // --- SHIZUKU ---

  it('SHIZUKU_MANIFEST is well-formed', () => {
    expect(SHIZUKU_MANIFEST.id).toBe('shizuku')
    expect(SHIZUKU_MANIFEST.type).toBe('live2d')
    expect(SHIZUKU_MANIFEST.modelJsonPath).toBe('/models/shizuku/shizuku.model3.json')
    expect(SHIZUKU_MANIFEST.hasExpressions).toBe(false)
    expect(SHIZUKU_MANIFEST.expressionParamPresets).toBeDefined()
    // 全部 7 个语义表情都要有
    const presets = SHIZUKU_MANIFEST.expressionParamPresets!
    for (const expr of ['happy', 'neutral', 'curious', 'surprised', 'encouraging', 'thoughtful', 'sad']) {
      expect(presets[expr]).toBeDefined()
    }
    // 必须用 PARAM_* 命名(shizuku 是 Cubism 2.1 风格)
    expect(presets.happy.PARAM_MOUTH_FORM).toBeDefined()
    expect(presets.happy.PARAM_TERE).toBeDefined()    // shizuku 的"脸颊"参数
    // neutral 要清零关键参数
    expect(presets.neutral.PARAM_MOUTH_FORM).toBe(0)
    expect(presets.neutral.PARAM_TERE).toBe(0)
  })

  it('SHIZUKU_MANIFEST motion registry maps to actual shizuku motion keys', () => {
    const reg = SHIZUKU_MANIFEST.motionRegistry
    expect(reg.characterId).toBe('shizuku')
    // shizuku 只有 4 组,key 是 <Group>_0
    expect(reg.getMotion('wave')).toBe('FlickUp_0')
    expect(reg.getMotion('clap')).toBe('Tap_0')
    expect(reg.getMotion('gesture')).toBe('Flick3_0')
    expect(reg.getMotion('nod')).toBe('Idle_0')   // 回退
    expect(reg.getMotion('write')).toBe('Idle_0') // 回退
  })

  it('SHIZUKU_MANIFEST credit points to Open-LLM-VTuber', () => {
    expect(SHIZUKU_MANIFEST.credit.author).toBe('Live2D Inc.')
    expect(SHIZUKU_MANIFEST.credit.sourceUrl).toContain('Open-LLM-VTuber')
  })

  // --- MAO PRO ---

  it('MAO_PRO_MANIFEST is well-formed', () => {
    expect(MAO_PRO_MANIFEST.id).toBe('mao_pro')
    expect(MAO_PRO_MANIFEST.type).toBe('live2d')
    expect(MAO_PRO_MANIFEST.modelJsonPath).toBe('/models/mao_pro/mao_pro.model3.json')
    expect(MAO_PRO_MANIFEST.hasExpressions).toBe(false)
    expect(MAO_PRO_MANIFEST.expressionParamPresets).toBeDefined()
    const presets = MAO_PRO_MANIFEST.expressionParamPresets!
    for (const expr of ['happy', 'neutral', 'curious', 'surprised', 'encouraging', 'thoughtful', 'sad']) {
      expect(presets[expr]).toBeDefined()
    }
    // mao_pro 没有 ParamMouthForm,用 ParamMouthUp / ParamMouthDown
    expect(presets.happy.ParamMouthUp).toBeDefined()
    expect(presets.sad.ParamMouthDown).toBeDefined()
    // neutral 清零
    expect(presets.neutral.ParamMouthUp).toBe(0)
    expect(presets.neutral.ParamCheek).toBe(0)
  })

  it('MAO_PRO_MANIFEST motion registry maps to actual mao_pro motion keys', () => {
    const reg = MAO_PRO_MANIFEST.motionRegistry
    expect(reg.characterId).toBe('mao_pro')
    // mao_pro 的非 Idle motion 在空字符串组里,key 是 _0 ~ _5
    expect(reg.getMotion('wave')).toBe('_3')          // special_01
    expect(reg.getMotion('nod')).toBe('_0')           // mtn_02
    expect(reg.getMotion('clap')).toBe('_4')          // special_02
    expect(reg.getMotion('write')).toBe('Idle_0')     // 回退
  })

  it('MAO_PRO_MANIFEST credit points to Open-LLM-VTuber', () => {
    expect(MAO_PRO_MANIFEST.credit.author).toBe('Live2D Inc.')
    expect(MAO_PRO_MANIFEST.credit.sourceUrl).toContain('Open-LLM-VTuber')
  })

  // --- 注册表 ---

  it('AVAILABLE_LIVE2D_MODELS includes all three models', () => {
    expect(AVAILABLE_LIVE2D_MODELS.length).toBe(3)
    expect(AVAILABLE_LIVE2D_MODELS.find((m) => m.id === 'hiyori')).toBe(HIYORI_MANIFEST)
    expect(AVAILABLE_LIVE2D_MODELS.find((m) => m.id === 'shizuku')).toBe(SHIZUKU_MANIFEST)
    expect(AVAILABLE_LIVE2D_MODELS.find((m) => m.id === 'mao_pro')).toBe(MAO_PRO_MANIFEST)
  })

  it('每个 manifest 的 id 唯一', () => {
    const ids = AVAILABLE_LIVE2D_MODELS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('所有 manifest 的 modelJsonPath 遵循 /models/<id>/<id>.model3.json 约定', () => {
    for (const manifest of AVAILABLE_LIVE2D_MODELS) {
      expect(manifest.modelJsonPath).toBe(`/models/${manifest.id}/${manifest.id}.model3.json`)
    }
  })

  it('DEFAULT_LIVE2D_MODEL_ID points to mao_pro', () => {
    expect(DEFAULT_LIVE2D_MODEL_ID).toBe('mao_pro')
  })

  it('getLive2DModelManifest returns manifest by id', () => {
    expect(getLive2DModelManifest('hiyori')).toBe(HIYORI_MANIFEST)
    expect(getLive2DModelManifest('shizuku')).toBe(SHIZUKU_MANIFEST)
    expect(getLive2DModelManifest('mao_pro')).toBe(MAO_PRO_MANIFEST)
    expect(getLive2DModelManifest('nonexistent')).toBeUndefined()
  })

  it('getLive2DModelManifestOrDefault falls back to mao_pro', () => {
    expect(getLive2DModelManifestOrDefault('hiyori')).toBe(HIYORI_MANIFEST)
    expect(getLive2DModelManifestOrDefault('shizuku')).toBe(SHIZUKU_MANIFEST)
    expect(getLive2DModelManifestOrDefault('nonexistent')).toBe(MAO_PRO_MANIFEST)
    expect(getLive2DModelManifestOrDefault(undefined)).toBe(MAO_PRO_MANIFEST)
    expect(getLive2DModelManifestOrDefault()).toBe(MAO_PRO_MANIFEST)
  })
})
