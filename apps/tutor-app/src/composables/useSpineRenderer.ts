import { ref } from 'vue'
import type { SpineModelConfig, SpineRendererState } from '../types/spine'

// spine-webgl 动态导入（避免 SSR 问题）
let spineModule: typeof import('@esotericsoftware/spine-webgl') | null = null

async function getSpine(): Promise<typeof import('@esotericsoftware/spine-webgl')> {
  if (!spineModule) {
    spineModule = await import('@esotericsoftware/spine-webgl')
  }
  return spineModule
}

export interface SpineRendererAPI {
  state: ReturnType<typeof ref<SpineRendererState>>
  init: (canvas: HTMLCanvasElement, config: SpineModelConfig) => Promise<void>
  playAnimation: (name: string, loop?: boolean) => void
  setSkin: (skinName: string) => void
  setBoneScale: (boneName: string, x: number, y: number) => void
  setBoneRotation: (boneName: string, degrees: number) => void
  findBone: (boneName: string) => any | null
  hitTest: (x: number, y: number) => boolean
  resize: () => void
  dispose: () => void
}

/**
 * Spine WebGL 渲染封装
 *
 * 使用 spine-webgl 的 SpineCanvas 高级 API。
 * yDown = false：骨骼数据使用编辑器坐标系（Y-up），与 OrthoCamera 一致。
 */
export function useSpineRenderer(): SpineRendererAPI {
  const state = ref<SpineRendererState>({
    isLoading: false,
    isReady: false,
    currentAnimation: null,
    currentSkin: null,
    error: null,
  })

  let spineCanvas: any = null
  let skeleton: any = null
  let animationState: any = null
  let config: SpineModelConfig | null = null
  let disposed = false
  let renderCount = 0

  async function init(targetCanvas: HTMLCanvasElement, modelConfig: SpineModelConfig): Promise<void> {
    if (disposed) return
    config = modelConfig
    state.value.isLoading = true
    state.value.error = null

    try {
      const spine = await getSpine()

      // yDown = false：骨骼坐标 Y-up，与 OrthoCamera 默认一致
      spine.Skeleton.yDown = false

      // canvas 物理像素尺寸
      const dpr = window.devicePixelRatio || 1
      const rect = targetCanvas.getBoundingClientRect()
      targetCanvas.width = rect.width * dpr
      targetCanvas.height = rect.height * dpr

      spineCanvas = new spine.SpineCanvas(targetCanvas, {
        webglConfig: { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true },
        app: {
          loadAssets: (canvas: any) => {
            const skeletonPath = modelConfig.skeletonPath
            if (skeletonPath.endsWith('.json')) {
              canvas.assetManager.loadText(skeletonPath)
            } else {
              canvas.assetManager.loadBinary(skeletonPath)
            }
            canvas.assetManager.loadTextureAtlas(modelConfig.atlasPath)
          },
          initialize: (canvas: any) => {
            if (disposed) return

            const skeletonPath = modelConfig.skeletonPath
            const atlasPath = modelConfig.atlasPath
            const atlas = canvas.assetManager.require(atlasPath)
            const atlasLoader = new spine.AtlasAttachmentLoader(atlas)

            let skeletonData
            if (skeletonPath.endsWith('.json')) {
              const skeletonJson = new spine.SkeletonJson(atlasLoader)
              skeletonData = skeletonJson.readSkeletonData(canvas.assetManager.require(skeletonPath))
            } else {
              const skeletonBinary = new spine.SkeletonBinary(atlasLoader)
              skeletonData = skeletonBinary.readSkeletonData(canvas.assetManager.require(skeletonPath))
            }

            skeleton = new spine.Skeleton(skeletonData)

            const stateData = new spine.AnimationStateData(skeletonData)
            stateData.defaultMix = 0.2
            animationState = new spine.AnimationState(stateData)

            // 设置角色缩放和位置
            setupCharacter(canvas, modelConfig)

            state.value.isLoading = false
            state.value.isReady = true

            console.log('[Spine] Init complete, animations:', skeletonData.animations.map((a: any) => a.name).join(', '))

            playAnimation('idle')
          },
          render: (canvas: any) => {
            if (disposed || !skeleton || !animationState) return

            const delta = canvas.time.delta
            animationState.update(delta)
            animationState.apply(skeleton)
            skeleton.updateWorldTransform()

            const gl = canvas.context.gl
            const htmlCanvas = canvas.htmlCanvas
            gl.viewport(0, 0, htmlCanvas.width, htmlCanvas.height)

            canvas.clear(0, 0, 0, 0)
            canvas.renderer.begin()
            canvas.renderer.drawSkeleton(skeleton)
            canvas.renderer.end()

            // 首帧诊断
            if (renderCount < 5) {
              const b = skeleton.getBoundsRect()
              const cam = canvas.renderer.camera
              console.log(`[Spine] Render #${renderCount}:`, {
                canvas: `${htmlCanvas.width}x${htmlCanvas.height}`,
                camViewport: `${cam.viewportWidth}x${cam.viewportHeight}`,
                skelPos: `(${skeleton.x.toFixed(1)}, ${skeleton.y.toFixed(1)})`,
                skelScale: skeleton.scaleX.toFixed(4),
                bounds: `${b.x.toFixed(0)},${b.y.toFixed(0)} ${b.width.toFixed(0)}x${b.height.toFixed(0)}`,
              })
              renderCount++
            }
          },
          error: (_canvas: any, errors: any) => {
            console.error('[Spine] Asset errors:', errors)
            state.value.error = JSON.stringify(errors)
          },
        },
      })
    } catch (err) {
      state.value.isLoading = false
      state.value.error = err instanceof Error ? err.message : String(err)
      console.error('[Spine] Init error:', err)
      throw err
    }
  }

  /**
   * 设置角色缩放和位置
   * yDown=false + OrthoCamera Y-up：编辑器坐标 = 世界坐标
   */
  function setupCharacter(canvas: any, modelConfig: SpineModelConfig): void {
    if (!skeleton) return

    const bounds = skeleton.getBoundsRect()

    if (bounds.width === 0 || bounds.height === 0) {
      console.warn('[Spine] Skeleton bounds are zero')
      return
    }

    // canvas 物理像素 = OrthoCamera viewport
    const canvasW = canvas.htmlCanvas.width
    const canvasH = canvas.htmlCanvas.height

    // 让角色占 canvas 高度的 50%，宽度不超过 75%
    const autoScale = Math.min(
      (canvasH * 0.5) / bounds.height,
      (canvasW * 0.75) / bounds.width,
    )

    const scale = modelConfig.scale ?? autoScale
    skeleton.scaleX = scale
    skeleton.scaleY = scale

    // 居中：将包围盒中心偏移到相机原点 (0,0)
    const cx = (bounds.x + bounds.width / 2) * scale
    const cy = (bounds.y + bounds.height / 2) * scale
    const [ox, oy] = modelConfig.offset ?? [0, 0]
    skeleton.x = -cx + ox
    skeleton.y = -cy + oy

    console.log('[Spine] setupCharacter:', {
      bounds: `${bounds.x.toFixed(0)},${bounds.y.toFixed(0)} ${bounds.width.toFixed(0)}x${bounds.height.toFixed(0)}`,
      canvas: `${canvasW}x${canvasH}`,
      scale: scale.toFixed(4),
      skeletonXY: `(${skeleton.x.toFixed(1)}, ${skeleton.y.toFixed(1)})`,
    })
  }

  function playAnimation(name: string, loop = true): void {
    if (!animationState || !skeleton) {
      console.warn('[Spine] Not ready, cannot play:', name)
      return
    }

    const spineName = config?.animationMap?.[name] ?? name
    const anim = skeleton.data.findAnimation(spineName)

    if (!anim) {
      console.warn('[Spine] Animation not found:', spineName, '(from:', name + ')')
      return
    }

    animationState.setAnimation(0, spineName, loop)
    state.value.currentAnimation = name
    console.log('[Spine] Playing animation:', spineName)
  }

  function setSkin(skinName: string): void {
    if (!skeleton) return

    const spineSkinName = config?.skinMap?.[skinName] ?? skinName
    const skin = skeleton.data.findSkin(spineSkinName)

    if (!skin) {
      console.warn('[Spine] Skin not found:', spineSkinName)
      return
    }

    skeleton.setSkin(skin)
    skeleton.setSlotsToSetupPose()
    state.value.currentSkin = skinName
  }

  function setBoneScale(boneName: string, x: number, y: number): void {
    if (!skeleton) return
    const bone = skeleton.findBone(boneName)
    if (bone) {
      bone.scaleX = x
      bone.scaleY = y
    }
  }

  function setBoneRotation(boneName: string, degrees: number): void {
    if (!skeleton) return
    const bone = skeleton.findBone(boneName)
    if (bone) {
      bone.rotation = degrees
    }
  }

  function findBone(boneName: string): any | null {
    if (!skeleton) return null
    return skeleton.findBone(boneName)
  }

  function hitTest(x: number, y: number): boolean {
    if (!skeleton || !spineCanvas) return false

    const canvasW = spineCanvas.htmlCanvas.clientWidth
    const canvasH = spineCanvas.htmlCanvas.clientHeight

    // 屏幕 CSS → 世界坐标（Y-up，原点在 canvas 中心）
    const worldX = x - canvasW / 2
    const worldY = canvasH / 2 - y

    const bounds = skeleton.getBoundsRect()

    const scale = skeleton.scaleX
    const bx = bounds.x * scale + skeleton.x
    const by = bounds.y * scale + skeleton.y
    const bw = bounds.width * Math.abs(scale)
    const bh = bounds.height * Math.abs(scale)

    return worldX >= bx && worldX <= bx + bw && worldY >= by && worldY <= by + bh
  }

  function resize(): void {
    if (!spineCanvas || !spineCanvas.htmlCanvas) return

    const canvas = spineCanvas.htmlCanvas as HTMLCanvasElement
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr

    if (skeleton && config) {
      setupCharacter(spineCanvas, config)
    }
  }

  function dispose(): void {
    disposed = true
    if (spineCanvas) {
      spineCanvas.dispose()
      spineCanvas = null
    }
    skeleton = null
    animationState = null
    config = null
    state.value.isReady = false
  }

  return {
    state,
    init,
    playAnimation,
    setSkin,
    setBoneScale,
    setBoneRotation,
    findBone,
    hitTest,
    resize,
    dispose,
  }
}
