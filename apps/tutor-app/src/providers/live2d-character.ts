import type {
  CharacterProvider,
  CharacterState,
  Live2DModelManifest,
  MotionRegistry
} from '@ai-english-tutor/shared'
import { HIYORI_MANIFEST } from '@ai-english-tutor/shared'

import { CubismFramework, Option, LogLevel } from '@/lib/cubism-framework/live2dcubismframework'
import { CubismModelSettingJson } from '@/lib/cubism-framework/cubismmodelsettingjson'
import { ICubismModelSetting } from '@/lib/cubism-framework/icubismmodelsetting'
import { CubismUserModel } from '@/lib/cubism-framework/model/cubismusermodel'
import { CubismEyeBlink } from '@/lib/cubism-framework/effect/cubismeyeblink'
import { CubismBreath } from '@/lib/cubism-framework/effect/cubismbreath'
import { CubismMatrix44 } from '@/lib/cubism-framework/math/cubismmatrix44'
import { CubismIdHandle } from '@/lib/cubism-framework/id/cubismid'
import { ACubismMotion } from '@/lib/cubism-framework/motion/acubismmotion'

/**
 * 模型路径与表情参数预设由调用方通过 `Live2DModelManifest` 注入,
 * 这里不再硬编码任何模型相关常量。Manifest 定义在 `@ai-english-tutor/shared`。
 *
 * 见 doc/live2d-素材集成计划.md(A 阶段重构)。
 */
type ExpressionPresetMap = NonNullable<Live2DModelManifest['expressionParamPresets']>

const EMPTY_EXPRESSION_PRESETS: ExpressionPresetMap = {}

/**
 * 表情参数的混合模式。表情在 eyeBlink / eyeTracking 之后应用,所以这些与眨眼/
 * 头部跟随同参数的表情值不能直接覆盖(否则要么压掉眨眼、要么压掉跟随),按模式叠加:
 * - MULTIPLY: 与眨眼写入的眼开度相乘。surprised(>1)放大、sad(<1)收窄,且眨眼时仍随之闭合;
 *   静息因子=1(表情未声明该参数时不改变眨眼)。
 * - ADD: 叠加到头部跟随写入的角度上。curious/thoughtful 的歪头叠加在跟随之上,鼠标仍能带动;
 *   静息偏移=0。
 * - 其余参数(眉毛/嘴型/腮红/眼笑)走默认 OVERWRITE,直接覆盖,静息值=0。
 * 用「按模式取静息默认」让被释放的参数天然等于各自的 no-op 值,无残留漂移。
 */
const EXPRESSION_MULTIPLY_PARAMS = new Set(['ParamEyeLOpen', 'ParamEyeROpen'])
const EXPRESSION_ADD_PARAMS = new Set([
  'ParamAngleX',
  'ParamAngleY',
  'ParamAngleZ',
  'ParamBodyAngleX',
  'ParamBodyAngleY',
  'ParamBodyAngleZ',
  'ParamEyeBallX',
  'ParamEyeBallY'
])

/** 打哈欠参数预设（不加载新资源） */
const YAWN_PRESET: Record<string, number> = {
  ParamMouthOpenY: 0.6,
  ParamEyeLOpen: 0.3,
  ParamEyeROpen: 0.3,
  ParamBrowLY: 0.5,
  ParamBrowRY: 0.5,
  ParamAngleX: 2
}

/** 伸懒腰参数预设 */
const STRETCH_PRESET: Record<string, number> = {
  ParamAngleX: -5,
  ParamAngleY: 3,
  ParamBodyAngleX: -3,
  ParamBodyAngleY: 2
}

/**
 * 根据设备性能动态选择默认 DPR。
 * 低内存（<=4GB）或低核心数（<=4）的设备默认降到 1.0，避免 GPU 过载导致整机卡顿。
 * 环境变量 VITE_LIVE2D_MAX_DPR 仍优先于自动判断。
 */
function getDefaultMaxDpr(): number {
  const deviceMemory = (navigator as any).deviceMemory
  const hardwareConcurrency = navigator.hardwareConcurrency || 8
  if ((deviceMemory != null && deviceMemory <= 4) || hardwareConcurrency <= 4) {
    return 1.0
  }
  return 1.5
}

/**
 * Canvas 渲染缩放上限。
 *
 * 直接用 window.devicePixelRatio 在 Retina 屏(2x)上会让 WebGL 画布变成 4 倍像素，
 * Live2D 每帧都要填充/采样这些像素，是 CPU/GPU 占用的主要来源。限制到 1.5 可以在
 * 清晰度和性能之间取得平衡；若仍觉卡顿可在 .env 设置 VITE_LIVE2D_MAX_DPR=1.0。
 */
const DEFAULT_MAX_DPR = getDefaultMaxDpr()
const MAX_DPR = Math.min(
  Math.max(
    Number((import.meta.env.VITE_LIVE2D_MAX_DPR as string | undefined) ?? DEFAULT_MAX_DPR) ||
      DEFAULT_MAX_DPR,
    1.0
  ),
  2.0
)

/**
 * Live2D 渲染目标帧率上限。
 * 默认 60fps；低性能设备可在 .env 设置 VITE_LIVE2D_TARGET_FPS=30 降低 CPU/GPU 占用。
 */
const DEFAULT_TARGET_FPS = 60
const TARGET_FPS = Math.min(
  Math.max(
    Number((import.meta.env.VITE_LIVE2D_TARGET_FPS as string | undefined) ?? DEFAULT_TARGET_FPS) ||
      DEFAULT_TARGET_FPS,
    15
  ),
  120
)
const MIN_FRAME_INTERVAL_MS = 1000 / TARGET_FPS

/**
 * Patch: CDN 上的 live2dcubismcore@1.0.2 没有 Memory.initializeAmountOfMemory，
 * 但 Framework R5 的 initialize() 会调用它。在 initializeFramework 之前手动 patch。
 */
function patchCoreForFramework(): void {
  const core = (window as any).Live2DCubismCore
  if (!core) return
  if (!core.Memory) {
    ;(core as any).Memory = {}
  }
  if (typeof (core.Memory as any).initializeAmountOfMemory !== 'function') {
    ;(core.Memory as any).initializeAmountOfMemory = (_size?: number) => {
      // no-op：CDN 版 core 内部管理内存
    }
  }
}

/**
 * Live2D 模型封装 —— 负责加载资源、更新动画、绑定纹理
 *
 * 参考 Open-LLM-VTuber-Web / Live2D Cubism Web Samples 官方实现
 */
class LAppModel extends CubismUserModel {
  private _modelSetting: ICubismModelSetting | null = null
  private _userTimeSeconds = 0.0
  private _gl: WebGLRenderingContext | WebGL2RenderingContext | null = null

  /** 已加载的 motion 缓存: key → ACubismMotion */
  private _motions = new Map<string, ACubismMotion>()
  /** Idle 动作 key 列表 */
  private _idleMotionKeys: string[] = []
  /** 动作注册表：语义 ID → 模型 key */
  private _motionRegistry: MotionRegistry | null = null
  /**
   * 表情参数预设(由 Manifest 注入)。
   * 模型无 .exp3.json 时,setExpression 走这套预设模拟表情。
   */
  private _expressionPresets: ExpressionPresetMap = EMPTY_EXPRESSION_PRESETS

  /** 当前表情 ID */
  private _currentExpressionId = 'neutral'
  /** 口型同步目标值 (0-1) */
  private _targetMouthOpen = 0.0
  /** 口型同步当前值（平滑插值后） */
  private _currentMouthOpen = 0.0
  /** 口型同步平滑系数（更快响应） */
  private readonly _mouthSmoothFactor = 0.25
  /** 口型放大系数（让嘴巴张得更大） */
  private readonly _mouthAmplify = 1.5
  /**
   * 模型声明的 LipSync 参数 ID(从 model3.json 的 LipSync 组读取)。
   * 各模型嘴型参数不同:hiyori=ParamMouthOpenY / shizuku=PARAM_MOUTH_OPEN_Y / mao_pro=ParamA,
   * 不能硬编码,必须按模型声明驱动,否则口型不动。
   */
  private _lipSyncIds: CubismIdHandle[] = []

  /** 参数 ID 字符串 → CubismIdHandle 缓存，避免每帧字符串查表 */
  private _paramIdCache = new Map<string, CubismIdHandle>()

  /** Manifest 注入的视图缩放系数,在 resize 计算结果上额外乘,1=不变 */
  private _viewScale = 1.0
  /** Manifest 注入的视图偏移(像素,以 canvas 逻辑像素为准) */
  private _viewOffsetX = 0.0
  private _viewOffsetY = 0.0

  /** Idle 动作定时器 */
  private _idleTimer = 0.0
  private readonly _idleInterval = 6.0 // 每 6 秒随机播放一个 Idle 动作

  /** 鼠标跟踪 */
  private _mouseX = 0.0
  private _mouseY = 0.0
  private _targetEyeX = 0.0
  private _targetEyeY = 0.0
  private _currentEyeX = 0.0
  private _currentEyeY = 0.0
  private _currentHeadX = 0.0
  private _currentHeadY = 0.0
  private _currentBodyX = 0.0
  private _currentBodyY = 0.0
  private readonly _eyeTrackingFactor = 0.6
  private readonly _headTrackingFactor = 0.3
  private readonly _bodyTrackingFactor = 0.15
  private readonly _trackingSmoothing = 0.12

  /** 点击互动 */
  private _onTapBody?: () => void

  // === 表情平滑融合 ===
  /** 目标表情 ID */
  private _targetExpressionId = 'neutral'
  /** 表情渐变时长（秒） */
  private readonly _expressionFadeDuration = 0.5
  /** 表情渐变计时器 */
  private _expressionFadeTimer = 0.0
  /** 是否正在表情渐变 */
  private _isExpressionFading = false

  // === 活动状态机 ===
  private _isSpeaking = false
  private _isListening = false
  private _isThinking = false
  private _stateTimer = 0.0

  // === TTS 点头 ===
  private _nodPhase = 0.0
  private readonly _nodSpeed = 4.0
  private readonly _nodAmplitude = 3.0

  // === 身体轻微摇摆 ===
  private _swayPhase = 0.0
  private readonly _swaySpeed = 0.8
  private readonly _swayAmplitude = 2.0

  // === 空闲微动作 ===
  private _inactivityTimer = 0.0
  private _inactivityThreshold = 12.0
  private _microActionPreset: Record<string, number> | null = null
  private _microActionDuration = 0.0
  private _microActionTimer = 0.0
  private _microActionType: 'yawn' | 'stretch' | 'blink' | null = null

  // === 可变眨眼频率 ===
  private _blinkIntervalOverride = 0.0
  private _blinkIntervalTimer = 0.0

  // === 眼神覆盖（输入时看向输入区） ===
  private _gazeOverrideX = 0.0
  private _gazeOverrideY = 0.6
  private _gazeOverrideBlend = 0.0

  // === 点击不同部位 ===
  private _onTapHead?: () => void
  private _onTapHand?: () => void

  // === 错误反应 ===
  private _errorShakeTimer = 0.0

  // === 物理/呼吸模拟降频（固定 30fps，不必每帧 evaluate） ===
  private _physicsAccumulator = 0.0
  private readonly _physicsStepSeconds = 1.0 / 30.0

  // === 时间判断 ===
  private _localHour = new Date().getHours()
  private _localHourCheckTimer = 0.0

  /**
   * 加载模型所有资源（model3.json → moc → textures → physics → pose → motions）
   */
  async loadAssets(
    path: string,
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    canvasWidth: number,
    canvasHeight: number
  ): Promise<void> {
    this._gl = gl

    // 1. 加载 model3.json
    const resp = await fetch(path)
    const buf = await resp.arrayBuffer()
    this._modelSetting = new CubismModelSettingJson(buf, buf.byteLength)

    const baseDir = path.substring(0, path.lastIndexOf('/') + 1)

    // 2. 加载 MOC 并创建模型
    const mocPath = baseDir + this._modelSetting.getModelFileName()
    const mocResp = await fetch(mocPath)
    const mocBuf = await mocResp.arrayBuffer()
    this.loadModel(mocBuf, false)

    if (!this._model) {
      throw new Error('Failed to create CubismModel from MOC')
    }

    // 3. 创建 WebGL Renderer
    this.createRenderer(canvasWidth, canvasHeight)
    this.getRenderer().startUp(gl)
    this.getRenderer().setIsPremultipliedAlpha(true)

    // 4. 加载并绑定纹理
    for (let i = 0; i < this._modelSetting.getTextureCount(); i++) {
      const texPath = baseDir + this._modelSetting.getTextureFileName(i)
      const texture = await this.createTexture(texPath)
      this.getRenderer().bindTexture(i, texture)
    }

    // 5. 加载物理（头发飘动）
    const physicsFileName = this._modelSetting.getPhysicsFileName()
    if (physicsFileName && physicsFileName !== '') {
      const physicsPath = baseDir + physicsFileName
      const physicsResp = await fetch(physicsPath)
      const physicsBuf = await physicsResp.arrayBuffer()
      this.loadPhysics(physicsBuf, physicsBuf.byteLength)
      console.log('[Live2D] Physics loaded')
    }

    // 6. 加载姿势
    const poseFileName = this._modelSetting.getPoseFileName()
    if (poseFileName && poseFileName !== '') {
      const posePath = baseDir + poseFileName
      const poseResp = await fetch(posePath)
      const poseBuf = await poseResp.arrayBuffer()
      this.loadPose(poseBuf, poseBuf.byteLength)
      console.log('[Live2D] Pose loaded')
    }

    // 7. 加载所有动作
    const motionGroupCount = this._modelSetting.getMotionGroupCount()
    const motionPromises: Promise<void>[] = []

    for (let i = 0; i < motionGroupCount; i++) {
      const groupName = this._modelSetting.getMotionGroupName(i)
      const motionCount = this._modelSetting.getMotionCount(groupName)

      for (let j = 0; j < motionCount; j++) {
        const motionFileName = this._modelSetting.getMotionFileName(groupName, j)
        const motionPath = baseDir + motionFileName
        const fadeInTime = this._modelSetting.getMotionFadeInTimeValue(groupName, j)
        const fadeOutTime = this._modelSetting.getMotionFadeOutTimeValue(groupName, j)

        const promise = (async () => {
          try {
            const motionResp = await fetch(motionPath)
            const motionBuf = await motionResp.arrayBuffer()
            const name = `${groupName}_${j}`
            const motion = this.loadMotion(
              motionBuf,
              motionBuf.byteLength,
              name,
              undefined, // 动画结束回调
              undefined, // 动画开始回调
              this._modelSetting ?? undefined,
              groupName,
              j
            )
            if (motion) {
              // 设置 fade 时间
              if (fadeInTime >= 0) motion.setFadeInTime(fadeInTime)
              if (fadeOutTime >= 0) motion.setFadeOutTime(fadeOutTime)

              // 防止 CubismMotion 内部 _eyeBlinkParameterIds / _lipSyncParameterIds 为 null
              ;(motion as any)._eyeBlinkParameterIds = []
              ;(motion as any)._lipSyncParameterIds = []

              this._motions.set(name, motion)
              if (groupName === 'Idle') {
                this._idleMotionKeys.push(name)
              }
            }
          } catch (e) {
            console.error('[Live2D] Failed to load motion:', motionPath, e)
          }
        })()
        motionPromises.push(promise)
      }
    }
    await Promise.all(motionPromises)

    // Idle 组过少的模型(如 mao_pro 只有 1 个 Idle),把全部已加载动作纳入空闲轮播,
    // 否则角色几乎不自主动(空闲循环只会反复播那一个 idle)。
    // Idle 组丰富的模型(hiyori 9 个)保持原行为。
    if (this._idleMotionKeys.length <= 1) {
      this._idleMotionKeys = Array.from(this._motions.keys())
    }
    console.log(
      '[Live2D] Motions loaded:',
      this._motions.size,
      'idle:',
      this._idleMotionKeys.length
    )

    // 8. 初始化效果
    if (this._modelSetting.getEyeBlinkParameterCount() > 0) {
      this._eyeBlink = CubismEyeBlink.create(this._modelSetting)
      this._eyeBlink.setBlinkingInterval(6.0)
      this._eyeBlink.setBlinkingSetting(0.18, 0.08, 0.25)
    }
    this._breath = CubismBreath.create()

    // 8.5 收集 LipSync 参数 ID(口型同步用)。
    // 不同模型嘴型参数不同(hiyori=ParamMouthOpenY / shizuku=PARAM_MOUTH_OPEN_Y / mao_pro=ParamA),
    // 从 model3.json 的 LipSync 组读取,避免硬编码导致非 hiyori 模型口型不动。
    this._lipSyncIds = []
    const lipSyncCount = this._modelSetting.getLipSyncParameterCount()
    for (let i = 0; i < lipSyncCount; i++) {
      const id = this._modelSetting.getLipSyncParameterId(i)
      if (id) this._lipSyncIds.push(id)
    }
    console.log('[Live2D] LipSync params:', this._lipSyncIds.length)

    // 9. 设置 modelMatrix 居中并缩放（复用 resize 逻辑）
    this.resize(canvasWidth, canvasHeight)

    // 10. 保存初始参数
    this._model.saveParameters()
  }

  /**
   * 从图片路径创建 WebGLTexture
   */
  private async createTexture(imagePath: string): Promise<WebGLTexture> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const gl = this._gl!
        const texture = gl.createTexture()!

        gl.bindTexture(gl.TEXTURE_2D, texture)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
        gl.generateMipmap(gl.TEXTURE_2D)
        gl.bindTexture(gl.TEXTURE_2D, null)

        resolve(texture)
      }
      img.onerror = () => reject(new Error(`Failed to load texture: ${imagePath}`))
      img.src = imagePath
    })
  }

  /**
   * 计算模型所有 drawable 的实际顶点边界
   */
  private computeModelBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity
    const drawableCount = this._model.getDrawableCount()

    for (let i = 0; i < drawableCount; i++) {
      const vertices = this._model.getDrawableVertices(i)
      for (let j = 0; j < vertices.length; j += 2) {
        const x = vertices[j]
        const y = vertices[j + 1]
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }

    // 兜底：如果没有顶点，使用 canvas 参考尺寸
    if (minX === Infinity) {
      const cw = this._model.getCanvasWidth()
      const ch = this._model.getCanvasHeight()
      return { minX: 0, maxX: cw, minY: 0, maxY: ch }
    }

    return { minX, maxX, minY, maxY }
  }

  /**
   * 获取参数 ID 的缓存版本，避免每帧重复字符串查表。
   */
  private getParamId(name: string): CubismIdHandle | undefined {
    let id = this._paramIdCache.get(name)
    if (id === undefined) {
      id = CubismFramework.getIdManager().getId(name)
      if (id) {
        this._paramIdCache.set(name, id)
      }
    }
    return id
  }

  /**
   * 每帧更新 —— 顺序:
   * loadParameters → motion → mouth → eyeBlink → breath → physics → pose → eyeTracking → expression → saveParameters
   * 表情放在 eyeBlink / eyeTracking 之后,确保 surprised/sad(眼开度)、curious/thoughtful(头部角度)
   * 这些与眨眼/跟随同参数的表情不被覆盖。
   */
  update(deltaTimeSeconds: number): void {
    this._userTimeSeconds += deltaTimeSeconds

    // 1. 恢复默认参数
    this._model.loadParameters()

    // 2. 更新动作（motion 覆盖参数）
    if (this._motionManager) {
      this._motionManager.updateMotion(this._model, deltaTimeSeconds)
    }

    // 3. 口型同步
    this.applyMouthOpen()

    // 4. 自动眨眼（支持可变频率）
    this.applyEyeBlink(deltaTimeSeconds)

    // 5. 呼吸 与 6. 物理（头发飘动）降频到 30fps。
    // 物理内部基于当前参数值计算，不需要每帧都跑；降低频率可显著减少 CPU 占用。
    this._physicsAccumulator += deltaTimeSeconds
    if (this._physicsAccumulator >= this._physicsStepSeconds) {
      if (this._breath) {
        this._breath.updateParameters(this._model, this._physicsStepSeconds)
      }
      if (this._physics) {
        this._physics.evaluate(this._model, this._physicsStepSeconds)
      }
      this._physicsAccumulator -= this._physicsStepSeconds
    }

    // 7. 姿势
    if (this._pose) {
      this._pose.updateParameters(this._model, deltaTimeSeconds)
    }

    // 8. 眼睛/头部/身体跟随鼠标（含点头、摇摆、倾听姿态、凝视覆盖）
    this.applyEyeTracking(deltaTimeSeconds)

    // 9. 应用表情 —— 必须在 eyeBlink / eyeTracking 之后，否则 surprised/sad 的
    //    ParamEyeLOpen/ROpen 会被眨眼覆盖、curious/thoughtful 的 ParamAngle* 会被
    //    头部跟随覆盖，表情就「看不见」。放最后让表情对它声明的参数有最终话语权；
    //    它没声明的参数（如 happy 不写 EyeOpen）仍保留眨眼/跟随的值，眨眼照常。
    this.applyExpression(deltaTimeSeconds)

    // 10. 保存参数供下帧恢复
    this._model.update()
    this._model.saveParameters()

    // 11. Idle 动作循环
    this.updateIdleMotion(deltaTimeSeconds)

    // 12. 空闲微动作（打哈欠、伸懒腰、可变眨眼）
    this.updateMicroActions(deltaTimeSeconds)

    // 13. 状态计时器
    this._stateTimer += deltaTimeSeconds

    // 14. 本地时间更新（用于时间判断）
    this.updateLocalHour(deltaTimeSeconds)
  }

  /**
   * 应用当前表情参数到模型，支持平滑融合与微动作叠加。
   *
   * 优化：稳态（current == target）时直接遍历目标 preset，避免每帧创建 Set；
   * 参数 ID 用 _paramIdCache 缓存，避免每帧字符串查表。
   */
  private applyExpression(deltaTimeSeconds: number): void {
    // 如果目标表情变化，启动渐变。
    // 注意：必须用 !this._isExpressionFading 守卫，只在「开始一段新渐变」时重置计时器；
    // 否则只要 target !== current 就每帧把 timer 清 0，timer 永远累加不到 fadeDuration，
    // current 永不追上 target，t 卡在约 dt/0.5≈3%，表情只融合 3% → 看起来「点击没反应」。
    if (this._targetExpressionId !== this._currentExpressionId && !this._isExpressionFading) {
      this._isExpressionFading = true
      this._expressionFadeTimer = 0.0
    }

    if (this._isExpressionFading) {
      this._expressionFadeTimer += deltaTimeSeconds
      if (this._expressionFadeTimer >= this._expressionFadeDuration) {
        this._isExpressionFading = false
        this._currentExpressionId = this._targetExpressionId
        this._expressionFadeTimer = this._expressionFadeDuration
      }
    }

    const t = this._isExpressionFading
      ? this._expressionFadeTimer / this._expressionFadeDuration
      : 1.0

    const fallbackPreset = this._expressionPresets.neutral ?? {}
    const targetPreset = this._expressionPresets[this._targetExpressionId] ?? fallbackPreset
    const currentPreset = this._expressionPresets[this._currentExpressionId] ?? fallbackPreset

    if (!this._isExpressionFading) {
      // 稳态：直接应用目标表情，避免创建 Set 和遍历 currentPreset。
      for (const [paramId, value] of Object.entries(targetPreset)) {
        const id = this.getParamId(paramId)
        if (!id) continue
        this.applyExpressionValue(id, paramId, value, value, 1.0)
      }
    } else {
      // 渐变中：先遍历 targetPreset，缺失的 current 值用静息默认值补齐。
      for (const [paramId, to] of Object.entries(targetPreset)) {
        const id = this.getParamId(paramId)
        if (!id) continue
        const rest = EXPRESSION_MULTIPLY_PARAMS.has(paramId) ? 1 : 0
        const from = currentPreset[paramId] ?? rest
        this.applyExpressionValue(id, paramId, from, to, t)
      }

      // 再处理仅存在于 currentPreset 的参数，使其平滑回到静息默认值。
      for (const [paramId, from] of Object.entries(currentPreset)) {
        if (paramId in targetPreset) continue
        const id = this.getParamId(paramId)
        if (!id) continue
        const rest = EXPRESSION_MULTIPLY_PARAMS.has(paramId) ? 1 : 0
        this.applyExpressionValue(id, paramId, from, rest, t)
      }
    }

    // 叠加微动作预设（如打哈欠、伸懒腰）
    this.applyMicroAction(deltaTimeSeconds)
  }

  /**
   * 把一个表情参数值按 MULTIPLY/ADD/OVERWRITE 模式应用到模型。
   */
  private applyExpressionValue(
    id: CubismIdHandle,
    paramId: string,
    from: number,
    to: number,
    t: number
  ): void {
    const value = from * (1 - t) + to * t

    if (EXPRESSION_MULTIPLY_PARAMS.has(paramId)) {
      // 与眨眼写入的眼开度相乘 → 既体现表情又保留眨眼
      this._model.setParameterValueById(id, this._model.getParameterValueById(id) * value)
    } else if (EXPRESSION_ADD_PARAMS.has(paramId)) {
      // 叠加到头部跟随写入的角度上 → 既体现歪头又保留鼠标跟随
      this._model.setParameterValueById(id, this._model.getParameterValueById(id) + value)
    } else {
      this._model.setParameterValueById(id, value)
    }
  }

  /**
   * 叠加空闲微动作（打哈欠、伸懒腰）参数
   */
  private applyMicroAction(deltaTimeSeconds: number): void {
    if (!this._microActionPreset || !this._microActionType) return

    this._microActionTimer += deltaTimeSeconds
    let weight: number

    const fadeIn = 0.4
    const fadeOut = 0.4
    const hold = this._microActionDuration - fadeIn - fadeOut

    if (this._microActionTimer < fadeIn) {
      weight = this._microActionTimer / fadeIn
    } else if (this._microActionTimer < fadeIn + hold) {
      weight = 1.0
    } else if (this._microActionTimer < fadeIn + hold + fadeOut) {
      weight = 1.0 - (this._microActionTimer - fadeIn - hold) / fadeOut
    } else {
      this._microActionPreset = null
      this._microActionType = null
      return
    }

    for (const [paramId, value] of Object.entries(this._microActionPreset)) {
      const id = this.getParamId(paramId)
      if (id) {
        const current = this._model.getParameterValueById(id)
        this._model.setParameterValueById(id, current + value * weight)
      }
    }
  }

  /**
   * 应用口型同步参数（指数平滑插值，与 Spine 一致）
   */
  private applyMouthOpen(): void {
    // 指数平滑：current += (target - current) * factor
    this._currentMouthOpen +=
      (this._targetMouthOpen - this._currentMouthOpen) * this._mouthSmoothFactor

    // 放大口型并 clamp 到 [0, 1]
    const amplified = Math.min(this._currentMouthOpen * this._mouthAmplify, 1.0)

    // 优先驱动模型声明的 LipSync 参数(各模型不同);
    // 模型没声明 LipSync 组时,回退到通用的 ParamMouthOpenY。
    if (this._lipSyncIds.length > 0) {
      for (const id of this._lipSyncIds) {
        this._model.setParameterValueById(id, amplified)
      }
    } else {
      const id = this.getParamId('ParamMouthOpenY')
      if (id) {
        this._model.setParameterValueById(id, amplified)
      }
    }
  }

  /**
   * 自动眨眼，支持可变频率覆盖。
   *
   * 优化：只在覆盖开始/结束时调用 setBlinkingInterval，避免每帧重复设置。
   */
  private applyEyeBlink(deltaTimeSeconds: number): void {
    if (!this._eyeBlink) return

    // 处理可变眨眼频率覆盖
    if (this._blinkIntervalOverride > 0) {
      // 覆盖刚开始（timer 为 0）时才设置一次
      if (this._blinkIntervalTimer === 0.0) {
        this._eyeBlink.setBlinkingInterval(this._blinkIntervalOverride)
      }
      this._blinkIntervalTimer += deltaTimeSeconds
      if (this._blinkIntervalTimer >= 3.0) {
        this._blinkIntervalOverride = 0.0
        this._blinkIntervalTimer = 0.0
        this._eyeBlink.setBlinkingInterval(6.0)
      }
    }

    this._eyeBlink.updateParameters(this._model, deltaTimeSeconds)
  }

  /**
   * 眼睛/头部/身体跟随鼠标（平滑插值），叠加点头、摇摆、倾听姿态、凝视覆盖
   */
  private applyEyeTracking(deltaTimeSeconds: number): void {
    if (!this._model) return

    // 更新眼神覆盖混合系数
    const gazeBlendSpeed = 2.0
    if (this._isListening) {
      this._gazeOverrideBlend = Math.min(
        this._gazeOverrideBlend + deltaTimeSeconds * gazeBlendSpeed,
        1.0
      )
    } else {
      this._gazeOverrideBlend = Math.max(
        this._gazeOverrideBlend - deltaTimeSeconds * gazeBlendSpeed,
        0.0
      )
    }

    // 混合鼠标目标与凝视覆盖目标
    const targetEyeX =
      this._targetEyeX * (1 - this._gazeOverrideBlend) +
      this._gazeOverrideX * this._gazeOverrideBlend
    const targetEyeY =
      this._targetEyeY * (1 - this._gazeOverrideBlend) +
      this._gazeOverrideY * this._gazeOverrideBlend

    // 平滑插值到目标位置
    this._currentEyeX += (targetEyeX - this._currentEyeX) * this._trackingSmoothing
    this._currentEyeY += (targetEyeY - this._currentEyeY) * this._trackingSmoothing
    this._currentHeadX += (targetEyeX * 0.5 - this._currentHeadX) * this._trackingSmoothing
    this._currentHeadY += (targetEyeY * 0.5 - this._currentHeadY) * this._trackingSmoothing
    this._currentBodyX += (targetEyeX * 0.3 - this._currentBodyX) * this._trackingSmoothing * 0.5
    this._currentBodyY += (targetEyeY * 0.3 - this._currentBodyY) * this._trackingSmoothing * 0.5

    // 头部点头（TTS 说话时）
    let nodOffset = 0.0
    if (this._isSpeaking) {
      this._nodPhase += this._nodSpeed * deltaTimeSeconds
      nodOffset = Math.sin(this._nodPhase) * this._nodAmplitude
    } else {
      // 停止说话后让点头相位平滑归零
      this._nodPhase = 0.0
    }

    // 身体摇摆（持续）
    this._swayPhase += this._swaySpeed * deltaTimeSeconds
    const swayOffset = Math.sin(this._swayPhase) * this._swayAmplitude

    // 倾听姿态前倾/侧倾
    let listenLeanY = 0.0
    let listenTilt = 0.0
    if (this._gazeOverrideBlend > 0) {
      listenLeanY = -2.0 * this._gazeOverrideBlend // 身体前倾
      listenTilt = 3.0 * this._gazeOverrideBlend // 头部侧倾
    }

    // 错误反应：快速摇头
    let errorShake = 0.0
    if (this._errorShakeTimer > 0) {
      this._errorShakeTimer -= deltaTimeSeconds
      errorShake = Math.sin(this._errorShakeTimer * 30) * 8.0
    }

    // 眼球
    const eyeBallX = this.getParamId('ParamEyeBallX')
    const eyeBallY = this.getParamId('ParamEyeBallY')
    if (eyeBallX)
      this._model.setParameterValueById(eyeBallX, this._currentEyeX * this._eyeTrackingFactor)
    if (eyeBallY)
      this._model.setParameterValueById(eyeBallY, this._currentEyeY * this._eyeTrackingFactor)

    // 头部角度
    const angleX = this.getParamId('ParamAngleX')
    const angleY = this.getParamId('ParamAngleY')
    const angleZ = this.getParamId('ParamAngleZ')
    if (angleX)
      this._model.setParameterValueById(
        angleX,
        this._currentHeadX * this._headTrackingFactor * 30 + errorShake
      )
    if (angleY)
      this._model.setParameterValueById(
        angleY,
        this._currentHeadY * this._headTrackingFactor * 30 + nodOffset
      )
    if (angleZ) this._model.setParameterValueById(angleZ, listenTilt)

    // 身体角度
    const bodyAngleX = this.getParamId('ParamBodyAngleX')
    const bodyAngleY = this.getParamId('ParamBodyAngleY')
    if (bodyAngleX)
      this._model.setParameterValueById(
        bodyAngleX,
        this._currentBodyX * this._bodyTrackingFactor * 10 + swayOffset
      )
    if (bodyAngleY)
      this._model.setParameterValueById(
        bodyAngleY,
        this._currentBodyY * this._bodyTrackingFactor * 10 + listenLeanY
      )
  }

  /**
   * 鼠标移动事件：更新目标眼睛位置
   */
  onMouseMove(mouseX: number, mouseY: number, canvasWidth: number, canvasHeight: number): void {
    // 将鼠标坐标归一化为 [-1, 1]（裁剪空间）
    const nx = (mouseX / canvasWidth) * 2 - 1 // -1(left) ~ 1(right)
    const ny = -((mouseY / canvasHeight) * 2 - 1) // -1(bottom) ~ 1(top), Y翻转

    // 直接用归一化光标坐标作为跟随目标(clamp 到 [-1,1]),与模型缩放/位置解耦。
    // 不再走 modelMatrix.invertTransform —— 那会被大 view.scale 的模型(如 mao_pro
    // scale=1.6)除小,跟随幅度压到几乎不可见,看起来像「眼睛不动」。
    this._targetEyeX = Math.max(-1, Math.min(1, nx))
    this._targetEyeY = Math.max(-1, Math.min(1, ny))
  }

  /**
   * 点击检测：检测坐标是否命中身体 hit area，并返回命中的身体部位
   */
  hitTest(
    pointX: number,
    pointY: number,
    canvasWidth: number,
    canvasHeight: number
  ): 'head' | 'body' | 'hand' | null {
    if (!this._modelSetting || !this._model) return null

    // 转换为裁剪空间
    const nx = (pointX / canvasWidth) * 2 - 1
    const ny = -((pointY / canvasHeight) * 2 - 1)

    // 遍历所有 hit areas 检测。
    // 优先按 hit area 的语义(Id/Name 含 head/hand/body)判定分区,这对
    // mao_pro 这类「头、身分成多个独立 hit area」的模型才准确;
    // 只有单个泛化 hit area(如 hiyori 的 Id:"HitArea",无部位语义)时,
    // 才回退到 getHitZoneForArea 的 relativeY 上下细分。
    const hitAreaCount = this._modelSetting.getHitAreasCount()
    for (let i = 0; i < hitAreaCount; i++) {
      const hitAreaId = this._modelSetting.getHitAreaId(i)
      if (this.isHit(hitAreaId, nx, ny)) {
        const semanticZone = this.zoneFromHitAreaLabel(
          hitAreaId.getString() ?? '',
          this._modelSetting.getHitAreaName(i) ?? ''
        )
        if (semanticZone) return semanticZone
        return this.getHitZoneForArea(hitAreaId, nx, ny)
      }
    }
    return null
  }

  /**
   * 从 hit area 的 Id / Name 文本推断语义分区。
   * 命中含「head/face」→ head,「hand/arm」→ hand,「body/torso」→ body。
   * 没有可识别部位关键词(如 hiyori 的 "HitArea")时返回 null,交给 relativeY 回退。
   */
  private zoneFromHitAreaLabel(id: string, name: string): 'head' | 'body' | 'hand' | null {
    const label = `${id} ${name}`.toLowerCase()
    if (/head|face/.test(label)) return 'head'
    if (/hand|arm/.test(label)) return 'hand'
    if (/body|torso|chest/.test(label)) return 'body'
    return null
  }

  /**
   * 根据命中点在 hit area 内的相对 Y 位置判断身体部位
   */
  private getHitZoneForArea(
    hitAreaId: CubismIdHandle,
    pointX: number,
    pointY: number
  ): 'head' | 'body' | 'hand' {
    const drawIndex = this._model.getDrawableIndex(hitAreaId)
    if (drawIndex < 0) return 'body'

    const count = this._model.getDrawableVertexCount(drawIndex)
    const vertices = this._model.getDrawableVertices(drawIndex)

    let top = vertices[1]
    let bottom = vertices[1]
    for (let j = 1; j < count; j++) {
      const y = vertices[j * 2 + 1]
      if (y < top) top = y
      if (y > bottom) bottom = y
    }

    if (bottom <= top) return 'body'

    // 将点击点转换到模型空间
    const ty = this._modelMatrix.invertTransformY(pointY)
    const relativeY = (ty - top) / (bottom - top)

    if (relativeY < 0.3) return 'head'
    if (relativeY > 0.8) return 'hand'
    return 'body'
  }

  /**
   * 设置点击身体回调
   */
  setOnTapBody(callback: () => void): void {
    this._onTapBody = callback
  }

  /**
   * Idle 动作自动循环：当前没有动作播放时定时随机播放 Idle
   */
  private updateIdleMotion(deltaTimeSeconds: number): void {
    if (!this._motionManager || this._idleMotionKeys.length === 0) return

    // 如果当前有动作在播放，重置 timer
    if (!this._motionManager.isFinished()) {
      this._idleTimer = 0
      return
    }

    this._idleTimer += deltaTimeSeconds
    if (this._idleTimer >= this._idleInterval) {
      this._idleTimer = 0
      const randomIndex = Math.floor(Math.random() * this._idleMotionKeys.length)
      const motionKey = this._idleMotionKeys[randomIndex]
      const motion = this._motions.get(motionKey)
      if (motion) {
        this._motionManager.startMotionPriority(motion, false, 1)
      }
    }
  }

  /**
   * 空闲微动作：长时间无交互后随机打哈欠、伸懒腰或改变眨眼频率
   */
  private updateMicroActions(deltaTimeSeconds: number): void {
    // 已有微动作进行中时不重复触发
    if (this._microActionPreset) return

    const isBusy = this._isSpeaking || this._isListening || this._isThinking
    const isMotionPlaying = this._motionManager ? !this._motionManager.isFinished() : false

    if (isBusy || isMotionPlaying) {
      this._inactivityTimer = 0
      return
    }

    const isNight = this._localHour >= 22 || this._localHour < 6
    const threshold = isNight ? 8.0 : this._inactivityThreshold

    this._inactivityTimer += deltaTimeSeconds
    if (this._inactivityTimer < threshold) return

    this._inactivityTimer = 0

    const rand = Math.random()
    if (isNight) {
      // 晚上更容易打哈欠
      if (rand < 0.6) {
        this.startMicroAction('yawn', 2.5)
      } else if (rand < 0.8) {
        this.startMicroAction('stretch', 2.0)
      } else {
        this._blinkIntervalOverride = 2.0
        this._blinkIntervalTimer = 0.0
      }
    } else {
      if (rand < 0.3) {
        this.startMicroAction('yawn', 2.5)
      } else if (rand < 0.6) {
        this.startMicroAction('stretch', 2.0)
      } else {
        this._blinkIntervalOverride = 2.0
        this._blinkIntervalTimer = 0.0
      }
    }
  }

  private startMicroAction(type: 'yawn' | 'stretch', duration: number): void {
    this._microActionType = type
    this._microActionPreset = type === 'yawn' ? YAWN_PRESET : STRETCH_PRESET
    this._microActionDuration = duration
    this._microActionTimer = 0.0
  }

  /**
   * 更新本地小时（用于时间判断）
   */
  private updateLocalHour(deltaTimeSeconds: number): void {
    this._localHourCheckTimer += deltaTimeSeconds
    if (this._localHourCheckTimer >= 60.0) {
      this._localHourCheckTimer = 0.0
      this._localHour = new Date().getHours()
    }
  }

  /**
   * 设置动作注册表（语义 ID → 模型 key 映射）
   */
  setMotionRegistry(registry: MotionRegistry): void {
    this._motionRegistry = registry
  }

  /**
   * 播放动作
   * @param motionId 语义 ID（如 'wave'）或模型 key（如 'Idle_0'）
   *   若设置了 MotionRegistry，优先用注册表翻译语义 ID；否则直接当模型 key 使用
   */
  playMotion(motionId: string): void {
    if (!this._motionManager) return

    // 决定要播放的模型 key:
    // 1) 若 motionId 本身就是模型原始 key(如 '_3'/'Idle_0')→ 直接用(调试直通)。
    //    语义 ID(wave/nod/…)永远不会撞上原始 key,所以这个优先判断是安全的;
    //    且必须放在 registry 翻译之前——否则未知语义会被 fallback 成 'Idle_0' 而它恰好存在,
    //    导致原始 key 永远播成 Idle。
    // 2) 否则交给 registry 把语义 ID 翻译成原始 key。
    let modelKey = motionId
    if (this._motions.has(motionId)) {
      modelKey = motionId
    } else if (this._motionRegistry) {
      modelKey = this._motionRegistry.getMotion(motionId as any)
    }

    let motion: ACubismMotion | undefined
    if (modelKey) {
      motion = this._motions.get(modelKey)
    }

    // 如果找不到，随机选一个 Idle
    if (!motion && this._idleMotionKeys.length > 0) {
      const randomIndex = Math.floor(Math.random() * this._idleMotionKeys.length)
      motion = this._motions.get(this._idleMotionKeys[randomIndex])
    }

    if (motion) {
      // priority=3 覆盖 Idle 动作
      this._motionManager.startMotionPriority(motion, false, 3)
      this._idleTimer = 0 // 重置 idle timer
      console.log('[Live2D] Playing motion:', motionId, '→', modelKey)
    } else {
      console.warn('[Live2D] Motion not found:', motionId, '→', modelKey)
    }
  }

  /** 调试用:返回已加载的全部原始动画 key(如 'Idle_0' / '_0'…)。 */
  getMotionKeys(): string[] {
    return Array.from(this._motions.keys())
  }

  /**
   * 设置视图缩放系数(由 Provider 在 init 时根据 Manifest 注入)
   */
  setViewScale(scale: number): void {
    this._viewScale = scale ?? 1.0
  }

  /**
   * 设置视图偏移像素(由 Provider 在 init 时根据 Manifest 注入)
   */
  setViewOffset(offsetX: number, offsetY: number): void {
    this._viewOffsetX = offsetX ?? 0.0
    this._viewOffsetY = offsetY ?? 0.0
  }

  /**
   * 设置表情参数预设(由 Provider 在 init 时根据 Manifest 注入)
   */
  setExpressionPresets(presets: ExpressionPresetMap): void {
    this._expressionPresets = presets ?? EMPTY_EXPRESSION_PRESETS
  }

  /**
   * 设置表情目标，由 applyExpression 平滑过渡到目标
   * @param exprId 后端返回的表情 ID（如 'happy', 'surprised'）
   */
  setExpression(exprId: string): void {
    if (this._expressionPresets[exprId]) {
      this._targetExpressionId = exprId
      console.log('[Live2D] Expression target set:', exprId)
    } else {
      this._targetExpressionId = 'neutral'
      console.warn('[Live2D] Unknown expression:', exprId, 'falling back to neutral')
    }
  }

  /**
   * 设置情绪（语义同 setExpression，供外部接口使用）
   */
  setEmotion(emotionId: string, _intensity?: number): void {
    this.setExpression(emotionId)
  }

  /**
   * 设置说话状态
   */
  setSpeaking(isSpeaking: boolean): void {
    this._isSpeaking = isSpeaking
    if (isSpeaking) {
      this._nodPhase = 0.0
    }
  }

  /**
   * 设置倾听状态
   */
  setListening(isListening: boolean): void {
    this._isListening = isListening
  }

  /**
   * 设置思考状态
   */
  setThinking(isThinking: boolean): void {
    this._isThinking = isThinking
    if (isThinking) {
      this.setExpression('thoughtful')
      // 延迟一点播放思考动作，避免与当前动作冲突
      setTimeout(() => {
        if (this._isThinking) this.playMotion('think')
      }, 500)
    } else {
      this.setExpression('neutral')
    }
  }

  /**
   * 错误反应：伤心/惊讶表情 + 快速摇头
   */
  onError(): void {
    this.setExpression('sad')
    this._errorShakeTimer = 0.5
    setTimeout(() => {
      this.setExpression('neutral')
    }, 2000)
  }

  /**
   * 设置点击头部回调
   */
  setOnTapHead(callback: () => void): void {
    this._onTapHead = callback
  }

  /**
   * 设置点击手部回调
   */
  setOnTapHand(callback: () => void): void {
    this._onTapHand = callback
  }

  /**
   * 口型同步: 0=闭嘴, 1=完全张开
   */
  setMouthOpen(value: number): void {
    this._targetMouthOpen = Math.max(0, Math.min(1, value))
  }

  /**
   * 窗口大小变化时，重新计算 modelMatrix 以适配新 canvas 尺寸
   */
  resize(canvasWidth: number, canvasHeight: number): void {
    if (!this._model) return

    const actualBounds = this.computeModelBounds()
    const boundsH = actualBounds.maxY - actualBounds.minY
    const boundsW = actualBounds.maxX - actualBounds.minX

    const canvasAspect = canvasWidth / canvasHeight
    // 竖屏手机缩小人物，桌面保持原比例
    const targetHeight = canvasAspect < 1 ? 1.35 : 1.8
    let scale = targetHeight / boundsH

    if (canvasAspect < 1) {
      const maxWidth = 1.2
      const widthNeeded = boundsW * scale
      if (widthNeeded > maxWidth) {
        scale = maxWidth / boundsW
      }
    }

    scale *= this._viewScale

    // 把像素偏移转成 world 坐标系偏移。
    // canvas 逻辑像素 Y 向下为正,world 坐标 Y 向上为正,所以向下移动像素值时 world 偏移为负。
    const offsetXWorld = (this._viewOffsetX * 2) / canvasWidth
    const offsetYWorld = -(this._viewOffsetY * 2) / canvasHeight

    this._modelMatrix.loadIdentity()
    this._modelMatrix.scale(scale, scale)
    this._modelMatrix.translateX(-scale * (actualBounds.minX + boundsW * 0.5) + offsetXWorld)
    this._modelMatrix.translateY(-scale * (actualBounds.minY + boundsH * 0.5) + offsetYWorld)
  }

  /**
   * 绘制模型
   * @param matrix View-Projection 矩阵
   */
  draw(matrix: CubismMatrix44): void {
    if (this._model == null) return

    matrix.multiplyByMatrix(this._modelMatrix)
    this.getRenderer().setMvpMatrix(matrix)
    this.getRenderer().drawModel()
  }
}

/**
 * Live2D 角色展示 Provider —— 连接模型与 Vue 组件
 */
export class Live2DCharacterProvider implements CharacterProvider {
  private canvas: HTMLCanvasElement | null = null
  private gl: WebGL2RenderingContext | WebGLRenderingContext | null = null
  private frameworkInitialized = false
  private model: LAppModel | null = null
  private animFrameId = 0
  private lastFrameTime = 0

  /** 当前使用的模型 manifest(决定路径、表情预设、动作映射) */
  private _manifest: Live2DModelManifest
  /** MotionRegistry — 默认取自 manifest,可通过 setRegistry 运行时覆盖 */
  private _registry: MotionRegistry

  /** 复用的投影矩阵，避免每帧 new CubismMatrix44 */
  private _projectionMatrix: CubismMatrix44 | null = null

  /** 渲染目标帧率上限对应的帧间隔 */
  private readonly _minFrameIntervalMs = MIN_FRAME_INTERVAL_MS
  /** 渲染循环上一帧时间（用于 FPS 限制） */
  private _renderLastFrameTime = 0

  private state: CharacterState = {
    currentMotion: null,
    currentExpression: null,
    mouthOpen: 0
  }

  /**
   * @param manifest 模型清单。不传则使用默认的 Hiyori manifest,
   *   行为与重构前完全一致(向后兼容)。
   */
  constructor(manifest: Live2DModelManifest = HIYORI_MANIFEST) {
    this._manifest = manifest
    this._registry = manifest.motionRegistry
  }

  /** 点击身体回调 */
  private _onTapBody?: () => void
  /** 点击头部回调 */
  private _onTapHead?: () => void
  /** 点击手部回调 */
  private _onTapHand?: () => void
  /** 窗口 resize 处理器引用（用于清理） */
  private _resizeHandler?: () => void
  /** 页面可见性变化处理器引用（用于清理） */
  private _visibilityHandler?: () => void
  /** 当前页面是否可见 */
  private _isVisible = true
  /** 鼠标事件处理器引用（用于清理） */
  private _canvasMouseMove?: (e: MouseEvent) => void
  private _canvasClick?: (e: MouseEvent) => void
  /** 待处理的鼠标移动事件（节流到每帧一次） */
  private _pendingMouseMove: { x: number; y: number; width: number; height: number } | null = null
  private _mouseRafScheduled = false

  /** 初始化: 等待 Core → Patch → 初始化 Framework → 加载模型 → 启动渲染 → 绑定鼠标事件 */
  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas

    // 获取 WebGL context
    // powerPreference: 'high-performance' 让浏览器优先使用独显（如果有）
    // antialias: false 避免浏览器对 canvas 做多重采样抗锯齿，Live2D 内部已做边缘处理
    const ctx =
      canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        powerPreference: 'high-performance',
        antialias: false
      }) ||
      canvas.getContext('webgl', {
        alpha: true,
        premultipliedAlpha: true,
        powerPreference: 'high-performance',
        antialias: false
      })
    if (!ctx) throw new Error('WebGL not supported')
    this.gl = ctx

    // 等待 Live2D Core (CDN) 加载
    await this.waitForCore()

    // Patch Core 缺失的方法
    patchCoreForFramework()

    // 初始化 Cubism Framework
    this.initializeFramework()

    // 设置 canvas 物理像素尺寸（考虑 DPR，但限制上限避免 Retina 屏过度占用 GPU）
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.viewport(0, 0, canvas.width, canvas.height)

    // 加载模型
    this.model = new LAppModel()
    this.model.setMotionRegistry(this._registry)
    this.model.setExpressionPresets(
      this._manifest.expressionParamPresets ?? EMPTY_EXPRESSION_PRESETS
    )
    this.model.setViewScale(this._manifest.view.scale)
    this.model.setViewOffset(this._manifest.view.offsetX, this._manifest.view.offsetY)
    await this.model.loadAssets(this._manifest.modelJsonPath, this.gl, canvas.width, canvas.height)

    // 绑定鼠标事件（眼睛跟随 + 点击互动）
    this.bindMouseEvents(canvas)

    // 监听窗口大小变化（移动端旋转、浏览器缩放等）
    this._resizeHandler = () => this.handleResize()
    window.addEventListener('resize', this._resizeHandler)

    // 监听页面可见性：切到后台时暂停渲染，减少 CPU/GPU 占用
    this._isVisible = !document.hidden
    this._visibilityHandler = () => {
      this._isVisible = !document.hidden
      if (this._isVisible) {
        this.lastFrameTime = performance.now()
      }
    }
    document.addEventListener('visibilitychange', this._visibilityHandler)

    // 预创建投影矩阵，避免渲染循环每帧分配
    this._projectionMatrix = new CubismMatrix44()

    // 启动渲染循环
    this.lastFrameTime = performance.now()
    this.startRenderLoop()

    console.log('[Live2D] Init complete')
  }

  /** 绑定鼠标移动和点击事件 */
  private bindMouseEvents(canvas: HTMLCanvasElement): void {
    // 鼠标移动：眼睛跟随。绑定到 canvas 而非 window，避免页面任意位置移动都触发事件。
    // 用 requestAnimationFrame 节流到每帧一次，避免高频 mousemove 浪费 CPU。
    this._canvasMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      this._pendingMouseMove = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        width: rect.width,
        height: rect.height
      }

      if (this._mouseRafScheduled) return
      this._mouseRafScheduled = true
      requestAnimationFrame(() => {
        this._mouseRafScheduled = false
        if (!this._pendingMouseMove || !this.model) return
        const { x, y, width, height } = this._pendingMouseMove
        this._pendingMouseMove = null
        this.model.onMouseMove(x, y, width, height)
      })
    }
    canvas.addEventListener('mousemove', this._canvasMouseMove)

    // 鼠标点击：身体互动（仍绑定在 canvas 上，避免点击 UI 时误触发）
    this._canvasClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const zone = this.model?.hitTest(x, y, rect.width, rect.height)
      if (!zone) return

      console.log('[Live2D] Tapped:', zone)
      // 先按命中部位播分区表情/动作,再无条件触发语音回复。
      // 语音只装配在 onTapBody(见 useCharacterProvider),所以任意部位点击都要
      // 走 _onTapBody,否则 mao_pro 这类点头/脸先命中 head 的模型点了没语音。
      switch (zone) {
        case 'head':
          this._onTapHead?.()
          this.setExpression('surprised')
          this.playMotion('surprised')
          break
        case 'hand':
          this._onTapHand?.()
          this.setExpression('happy')
          this.playMotion('wave')
          break
      }
      this._onTapBody?.()
    }
    canvas.addEventListener('click', this._canvasClick)
  }

  /** 设置点击身体回调（实现 CharacterProvider.onTapBody） */
  onTapBody(callback: () => void): void {
    this._onTapBody = callback
  }

  /** 设置点击头部回调 */
  onTapHead(callback: () => void): void {
    this._onTapHead = callback
  }

  /** 设置点击手部回调 */
  onTapHand(callback: () => void): void {
    this._onTapHand = callback
  }

  /** 设置情绪表情（实现 CharacterProvider.setEmotion） */
  setEmotion(emotionId: string, intensity?: number): void {
    this.state.currentExpression = emotionId
    this.model?.setEmotion(emotionId, intensity)
  }

  /** 调试用:当前模型已加载的全部原始动画 key。 */
  listMotionKeys(): string[] {
    return this.model?.getMotionKeys() ?? []
  }

  /** 调试用:当前模型 manifest 声明的全部表情 key。 */
  listExpressionKeys(): string[] {
    return Object.keys(this._manifest?.expressionParamPresets ?? {})
  }

  /** 设置说话状态（实现 CharacterProvider.setSpeaking） */
  setSpeaking(isSpeaking: boolean): void {
    this.model?.setSpeaking(isSpeaking)
  }

  /** 设置倾听状态（实现 CharacterProvider.setListening） */
  setListening(isListening: boolean): void {
    this.model?.setListening(isListening)
  }

  /** 设置思考状态（实现 CharacterProvider.setThinking） */
  setThinking(isThinking: boolean): void {
    this.model?.setThinking(isThinking)
  }

  /** 错误反应（实现 CharacterProvider.onError） */
  onError(): void {
    this.model?.onError()
  }

  /** 等待 CDN 上的 Live2D Cubism Core 加载 */
  private waitForCore(): Promise<void> {
    return new Promise((resolve, reject) => {
      const maxWait = 15000
      const start = Date.now()
      const check = () => {
        if (typeof (window as any).Live2DCubismCore !== 'undefined') {
          resolve()
        } else if (Date.now() - start > maxWait) {
          reject(new Error('Live2D Core load timeout'))
        } else {
          setTimeout(check, 100)
        }
      }
      check()
    })
  }

  /** 启动 Cubism Framework */
  private initializeFramework(): void {
    if (this.frameworkInitialized) return

    const option = new Option()
    option.logFunction = (msg: string) => console.log('[Cubism]', msg)
    option.loggingLevel = LogLevel.LogLevel_Verbose

    CubismFramework.startUp(option)
    CubismFramework.initialize()
    this.frameworkInitialized = true
  }

  /** 渲染循环 */
  private startRenderLoop(): void {
    if (!this.gl || !this.model || !this.canvas) {
      return
    }

    const loop = (time: number) => {
      this.animFrameId = requestAnimationFrame(loop)

      // 页面在后台时跳过渲染，降低 CPU/GPU 占用
      if (!this._isVisible) {
        this.lastFrameTime = time
        this._renderLastFrameTime = time
        return
      }

      // FPS 上限：若距上一帧不足目标帧间隔则跳过本次渲染
      if (
        this._renderLastFrameTime > 0 &&
        time - this._renderLastFrameTime < this._minFrameIntervalMs
      ) {
        return
      }
      this._renderLastFrameTime = time

      // 用局部常量固定当前帧的 gl/canvas/model，避免 TypeScript 在闭包中报 null 警告
      const gl = this.gl
      const canvas = this.canvas
      const model = this.model
      if (!gl || !canvas || !model) {
        return
      }

      const delta = Math.min((time - this.lastFrameTime) / 1000, 0.5)
      this.lastFrameTime = time

      // WebGL 全局状态
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0.0, 0.0, 0.0, 0.0)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.disable(gl.CULL_FACE)
      gl.clear(gl.COLOR_BUFFER_BIT)

      // 投影矩阵 — 使用正交投影补偿 canvas 宽高比，防止竖屏手机人物被拉伸变形
      // 复用 _projectionMatrix，避免每帧 new CubismMatrix44；每帧先重置为单位矩阵，
      // 因为 draw() 内部会把它乘以 modelMatrix。
      const projection = this._projectionMatrix ?? new CubismMatrix44()
      const aspect = canvas.width / canvas.height
      const arr = projection.getArray()
      for (let i = 0; i < 16; i++) {
        arr[i] = i % 5 === 0 ? 1.0 : 0.0
      }
      arr[0] = 1.0 / aspect // X: 映射 [-aspect, +aspect] → [-1, +1]
      arr[5] = 1.0 // Y: 映射 [-1, +1] → [-1, +1]

      // 更新并绘制模型
      model.update(delta)
      model.draw(projection)
    }

    this.animFrameId = requestAnimationFrame(loop)
  }

  /** 播放动作 — 语义 ID 直接传给模型，由模型内部 registry 翻译 */
  async playMotion(motionId: string): Promise<void> {
    this.state.currentMotion = motionId
    this.model?.playMotion(motionId)
  }

  /** 设置表情 */
  setExpression(exprId: string): void {
    this.state.currentExpression = exprId
    this.model?.setExpression(exprId)
  }

  /** 口型同步 */
  setMouthOpen(value: number): void {
    this.state.mouthOpen = Math.max(0, Math.min(1, value))
    this.model?.setMouthOpen(value)
  }

  getState(): CharacterState {
    return { ...this.state }
  }

  /** 运行时切换动作注册表 */
  setRegistry(registry: MotionRegistry): void {
    this._registry = registry
    this.model?.setMotionRegistry(registry)
    console.log('[Live2D] MotionRegistry switched to:', registry.characterId)
  }

  /** 处理窗口大小变化，更新 canvas 尺寸、WebGL viewport 并重新计算模型矩阵 */
  private handleResize(): void {
    if (!this.canvas || !this.gl) return

    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    const rect = this.canvas.getBoundingClientRect()
    this.canvas.width = rect.width * dpr
    this.canvas.height = rect.height * dpr
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)

    // 重新计算模型缩放和居中（与 Spine resize 一致）
    this.model?.resize(this.canvas.width, this.canvas.height)
  }

  dispose(): void {
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler)
    }
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler)
    }
    if (this.canvas) {
      if (this._canvasMouseMove) this.canvas.removeEventListener('mousemove', this._canvasMouseMove)
      if (this._canvasClick) this.canvas.removeEventListener('click', this._canvasClick)
    }
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId)
    if (this.model) this.model.release()
    if (this.frameworkInitialized) CubismFramework.dispose()
  }
}
