import type { CharacterProvider } from '@ai-english-tutor/shared'
import { getLive2DModelManifestOrDefault } from '@ai-english-tutor/shared'
export type CharacterProviderType = 'live2d' | 'svg'

export interface ProviderFactoryOptions {
  /** Provider 类型 */
  type: CharacterProviderType
  /** 渲染目标 canvas */
  canvas: HTMLCanvasElement
  /** Live2D 模型 ID；未指定时使用内置默认模型。 */
  live2dModelId?: string
}

/**
 * 创建 CharacterProvider 实例
 *
 * 第一版使用 Live2D；初始化失败时降级到轻量 SVG。
 *
 * @throws 如果指定类型的 Provider 初始化失败
 */
export async function createCharacterProvider(
  options: ProviderFactoryOptions
): Promise<CharacterProvider> {
  const { type, canvas, live2dModelId } = options

  switch (type) {
    case 'live2d': {
      const { Live2DCharacterProvider } = await import('./live2d-character')
      const manifest = getLive2DModelManifestOrDefault(live2dModelId)
      const provider = new Live2DCharacterProvider(manifest)
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
  options: ProviderFactoryOptions
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
