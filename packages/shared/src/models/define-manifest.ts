import type { Live2DModelManifest } from './types.js'

/**
 * 根据约定生成 modelJsonPath 并补全 Live2DModelManifest。
 *
 * 约定：模型入口文件固定放在 /models/<id>/<id>.model3.json。
 * 这样新增模型时 registry 文件不需要再手写路径，减少出错。
 *
 * 如果某个模型因历史原因无法遵循约定，可显式传入 modelJsonPath 覆盖。
 */
export function defineLive2DModelManifest(
  manifest: Omit<Live2DModelManifest, 'modelJsonPath'> & { modelJsonPath?: string },
): Live2DModelManifest {
  const modelJsonPath = manifest.modelJsonPath ?? `/models/${manifest.id}/${manifest.id}.model3.json`
  return { ...manifest, modelJsonPath }
}
