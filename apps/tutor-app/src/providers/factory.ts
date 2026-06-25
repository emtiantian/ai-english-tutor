import type { CharacterProvider } from '@ai-english-tutor/shared'
import type { SpineModelConfig } from '../types/spine'
import { defaultSpineConfig } from '../config/spine-animations'

export type CharacterProviderType = 'live2d' | 'spine' | 'svg' | 'rive'

export interface ProviderFactoryOptions {
  /** Provider 类型 */
  type: CharacterProviderType
  /** 渲染目标 canvas */
  canvas: HTMLCanvasElement
  /** Spine 专用：自定义模型配置（可选，默认使用 spineboy） */
  spineConfig?: SpineModelConfig
}

/**
 * 创建 CharacterProvider 实例
 *
 * 根据 type 创建对应的 Provider：
 * - 'spine': 使用 Spine 骨骼动画
 * - 'live2d': 使用 Live2D Cubism
 * - 'rive': 使用 Rive 矢量状态机（轻量，资源仅几十 KB）
 * - 'svg': 使用 SVG 占位（无实际渲染）
 *
 * @throws 如果指定类型的 Provider 初始化失败
 */
export async function createCharacterProvider(
  options: ProviderFactoryOptions,
): Promise<CharacterProvider> {
  const { type, canvas, spineConfig } = options

  switch (type) {
    case 'spine': {
      const { SpineCharacterProvider } = await import('./spine-character')
      const provider = new SpineCharacterProvider(spineConfig ?? defaultSpineConfig)
      await provider.init(canvas)
      return provider
    }

    case 'live2d': {
      const { Live2DCharacterProvider } = await import('./live2d-character')
      const provider = new Live2DCharacterProvider()
      await provider.init(canvas)
      return provider
    }

    case 'rive': {
      const { RiveCharacterProvider } = await import('./rive-character')
      const provider = new RiveCharacterProvider()
      await provider.init(canvas)
      return provider
    }

    case 'svg':
    default: {
      const { SvgCharacterProvider } = await import('./svg-character')
      const provider = new SvgCharacterProvider()
      await provider.init(canvas)
      return provider
    }
  }
}

/**
 * 安全创建 Provider，失败时自动降级到 SVG
 */
export async function createCharacterProviderSafe(
  options: ProviderFactoryOptions,
): Promise<CharacterProvider> {
  try {
    return await createCharacterProvider(options)
  } catch (err) {
    console.warn(`[ProviderFactory] ${options.type} init failed, falling back to SVG:`, err)
    const { SvgCharacterProvider } = await import('./svg-character')
    const provider = new SvgCharacterProvider()
    await provider.init(options.canvas)
    return provider
  }
}
