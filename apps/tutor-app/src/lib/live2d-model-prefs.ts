/**
 * Live2D 模型选择的浏览器持久化层(localStorage)。
 *
 * 为什么用 localStorage 而不是 IndexedDB:
 * - 只存一个字符串 ID(如 'hiyori'),IndexedDB 是杀鸡用牛刀
 * - 与现有 'tutor_level_confirmed' 等设置统一(都用 localStorage)
 * - 同步 API,Provider 初始化时不用 await
 *
 * **注意 — 与多老师角色卡(⑧)的衔接**:
 * 当 ⑧ 多老师角色卡功能落地时,选择应该转到 `TeacherProfile.characterModel.modelId`,
 * 这里的独立 store 字段只是 D 阶段的过渡方案。届时把 getLive2DModelId()
 * 的实现改成"从当前 teacher profile 读"即可,UI 层接口不变。
 */

import { AVAILABLE_LIVE2D_MODELS, DEFAULT_LIVE2D_MODEL_ID } from '@ai-english-tutor/shared'

const STORAGE_KEY = 'tutor.live2dModelId'

/**
 * 读取当前选择的 Live2D 模型 ID。
 *
 * 优先级:
 *   1. localStorage 中保存的用户选择(如果该 ID 仍在 AVAILABLE_LIVE2D_MODELS 中)
 *   2. VITE_LIVE2D_MODEL_ID 环境变量(构建时注入)
 *   3. DEFAULT_LIVE2D_MODEL_ID('mao_pro')
 *
 * 总会返回一个合法的、当前可用的 ID。如果 localStorage 里保存的 ID 已经下架
 * (例如未来移除了某模型),会自动 fallback 到默认并清掉无效记录。
 */
export function getLive2DModelId(): string {
  const stored = readFromStorage()
  if (stored && isValidModelId(stored)) {
    return stored
  }
  // 用户选择无效或没有选择,看 env
  const fromEnv = (import.meta.env.VITE_LIVE2D_MODEL_ID as string | undefined)?.trim()
  if (fromEnv && isValidModelId(fromEnv)) {
    return fromEnv
  }
  // 兜底:存的 ID 已经无效,顺手清掉
  if (stored && !isValidModelId(stored)) {
    safeRemove(STORAGE_KEY)
  }
  return DEFAULT_LIVE2D_MODEL_ID
}

/**
 * 保存用户选择的模型 ID。
 *
 * - 传入非法 ID:静默忽略(不抛错,保持调用方代码简单)
 * - 传入与默认相同的 ID:仍然写入,以便用户"显式选了默认"和"从未选择"可区分
 *   (虽然行为上一样,但写入了能让 getLive2DModelId 不再读 env 兜底)
 */
export function setLive2DModelId(id: string): void {
  if (!isValidModelId(id)) {
    console.warn(`[live2d-model-prefs] Ignoring unknown modelId: ${id}`)
    return
  }
  safeWrite(STORAGE_KEY, id)
}

/**
 * 清除用户的模型选择(回归到 env / default)。
 */
export function clearLive2DModelId(): void {
  safeRemove(STORAGE_KEY)
}

function isValidModelId(id: string): boolean {
  return AVAILABLE_LIVE2D_MODELS.some(m => m.id === id)
}

function readFromStorage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    // localStorage 不可用(隐私模式 / SSR)— 静默返回 null
    return null
  }
}

function safeWrite(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 容量满 / 隐私模式 — 忽略
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // 同上
  }
}
