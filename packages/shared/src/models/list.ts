/**
 * 内置 Live2D 模型清单与查表 API
 *
 * 加新模型:在 registry/ 下加文件 → 这里 import + push 到 AVAILABLE_LIVE2D_MODELS。
 * Provider 代码无需改动。
 */

import type { Live2DModelManifest } from './types.js'
import { HIYORI_MANIFEST } from './registry/hiyori.js'
import { SHIZUKU_MANIFEST } from './registry/shizuku.js'
import { MAO_PRO_MANIFEST } from './registry/mao_pro.js'

/** 所有内置的 Live2D 模型 */
export const AVAILABLE_LIVE2D_MODELS: readonly Live2DModelManifest[] = [
  HIYORI_MANIFEST,
  SHIZUKU_MANIFEST,
  MAO_PRO_MANIFEST,
]

/** 默认模型 ID — 未指定时使用,保持向后兼容 */
export const DEFAULT_LIVE2D_MODEL_ID = 'mao_pro'

/**
 * 按 ID 查找 Live2D 模型 manifest。
 * 找不到返回 undefined,调用方负责 fallback。
 */
export function getLive2DModelManifest(id: string): Live2DModelManifest | undefined {
  return AVAILABLE_LIVE2D_MODELS.find((m) => m.id === id)
}

/**
 * 按 ID 查找,找不到时 fallback 到默认。一定返回一个 manifest。
 */
export function getLive2DModelManifestOrDefault(id?: string): Live2DModelManifest {
  if (id) {
    const found = getLive2DModelManifest(id)
    if (found) return found
  }
  const fallback = getLive2DModelManifest(DEFAULT_LIVE2D_MODEL_ID)
  if (!fallback) {
    throw new Error(`Default Live2D model manifest '${DEFAULT_LIVE2D_MODEL_ID}' is missing`)
  }
  return fallback
}
