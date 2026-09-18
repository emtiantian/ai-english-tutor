import type { CharacterProvider } from '@ai-english-tutor/shared'
import { getLive2DModelManifestOrDefault } from '@ai-english-tutor/shared'
import { loadLive2DCore } from './live2d-core-loader.js'
export type CharacterProviderType = 'live2d'

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
 * 当前默认使用 Live2D；未来新增 Provider 时在这里扩展类型和实现分支。
 *
 * @throws 如果指定类型的 Provider 初始化失败
 */
export async function createCharacterProvider(
  options: ProviderFactoryOptions
): Promise<CharacterProvider> {
  const { type, canvas, live2dModelId } = options

  switch (type) {
    case 'live2d': {
      await loadLive2DCore()
      const { Live2DCharacterProvider } = await import('./live2d-character')
      const manifest = getLive2DModelManifestOrDefault(live2dModelId)
      const provider = new Live2DCharacterProvider(manifest)
      await provider.init(canvas)
      return provider
    }

    default:
      throw new Error(`Unsupported character provider: ${type}`)
  }
}
