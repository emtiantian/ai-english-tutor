import type { CharacterProvider, CharacterState, MotionRegistry } from '@ai-english-tutor/shared'
import { HIYORI_MOTION_REGISTRY } from '@ai-english-tutor/shared'

import { CubismFramework, Option, LogLevel } from '@/lib/cubism-framework/live2dcubismframework'
import { CubismModelSettingJson } from '@/lib/cubism-framework/cubismmodelsettingjson'
import { ICubismModelSetting } from '@/lib/cubism-framework/icubismmodelsetting'
import { CubismUserModel } from '@/lib/cubism-framework/model/cubismusermodel'
import { CubismEyeBlink } from '@/lib/cubism-framework/effect/cubismeyeblink'
import { CubismBreath } from '@/lib/cubism-framework/effect/cubismbreath'
import { CubismMatrix44 } from '@/lib/cubism-framework/math/cubismmatrix44'
import { CubismModelMatrix } from '@/lib/cubism-framework/math/cubismmodelmatrix'
import { CubismIdHandle } from '@/lib/cubism-framework/id/cubismid'
import { ACubismMotion } from '@/lib/cubism-framework/motion/acubismmotion'
import { CubismMotion } from '@/lib/cubism-framework/motion/cubismmotion'

const MODEL_PATH = '/models/hiyori/Hiyori.model3.json'

/** 表情参数预设（Hiyori 无 .exp3.json，通过参数直接模拟） */
const EXPRESSION_PRESETS: Record<string, Record<string, number>> = {
  happy: {
    ParamBrowLY: -0.3,
    ParamBrowRY: -0.3,
    ParamMouthForm: 1.0,
    ParamCheek: 0.6,
    ParamEyeLSmile: 1.0,
    ParamEyeRSmile: 1.0,
  },
  neutral: {
    ParamBrowLY: 0,
    ParamBrowRY: 0,
    ParamMouthForm: 0,
    ParamCheek: 0,
    ParamEyeLSmile: 0,
    ParamEyeRSmile: 0,
  },
  curious: {
    ParamBrowLY: -0.2,
    ParamBrowRY: -0.5,
    ParamBrowLAngle: 0.2,
    ParamBrowRAngle: -0.2,
    ParamMouthForm: 0.3,
    ParamAngleZ: -5,
  },
  surprised: {
    ParamBrowLY: -1.0,
    ParamBrowRY: -1.0,
    ParamEyeLOpen: 1.5,
    ParamEyeROpen: 1.5,
    ParamMouthForm: 0.5,
  },
  encouraging: {
    ParamBrowLY: -0.4,
    ParamBrowRY: -0.4,
    ParamMouthForm: 1.0,
    ParamCheek: 0.5,
    ParamEyeLSmile: 1.0,
    ParamEyeRSmile: 1.0,
  },
  thoughtful: {
    ParamBrowLY: 0.2,
    ParamBrowRY: 0.2,
    ParamBrowLAngle: 0.3,
    ParamBrowRAngle: 0.3,
    ParamMouthForm: 0.2,
    ParamAngleX: 3,
    ParamAngleY: -2,
  },
  sad: {
    ParamBrowLY: 0.3,
    ParamBrowRY: 0.3,
    ParamBrowLAngle: -0.2,
    ParamBrowRAngle: -0.2,
    ParamMouthForm: -0.3,
    ParamEyeLOpen: 0.7,
    ParamEyeROpen: 0.7,
  },
}

/** 打哈欠参数预设（不加载新资源） */
const YAWN_PRESET: Record<string, number> = {
  ParamMouthOpenY: 0.6,
  ParamEyeLOpen: 0.3,
  ParamEyeROpen: 0.3,
  ParamBrowLY: 0.5,
  ParamBrowRY: 0.5,
  ParamAngleX: 2,
}

/** 伸懒腰参数预设 */
const STRETCH_PRESET: Record<string, number> = {
  ParamAngleX: -5,
  ParamAngleY: 3,
  ParamBodyAngleX: -3,
  ParamBodyAngleY: 2,
}

/**
 * Patch: CDN 上的 live2dcubismcore@1.0.2 没有 Memory.initializeAmountOfMemory，
 * 但 Framework R5 的 initialize() 会调用它。在 initializeFramework 之前手动 patch。
 */
function patchCoreForFramework(): void {
  const core = (window as any).Live2DCubismCore
  if (!core) return
  if (!core.Memory) {
    (core as any).Memory = {}
  }
  if (typeof (core.Memory as any).initializeAmountOfMemory !== 'function') {
    (core.Memory as any).initializeAmountOfMemory = (_size?: number) => {
      // no-op: CDN core handles memory internally
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
  /** 当前已混合的表情参数值 */
  private _currentExpressionValues = new Map<string, number>()
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
    canvasHeight: number,
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
              undefined, // onFinished
              undefined, // onBegan
              this._modelSetting ?? undefined,
              groupName,
              j,
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
    console.log('[Live2D] Motions loaded:', this._motions.size, 'idle:', this._idleMotionKeys.length)

    // 8. 初始化效果
    if (this._modelSetting.getEyeBlinkParameterCount() > 0) {
      this._eyeBlink = CubismEyeBlink.create(this._modelSetting)
      this._eyeBlink.setBlinkingInterval(6.0)
      this._eyeBlink.setBlinkingSetting(0.18, 0.08, 0.25)
    }
    this._breath = CubismBreath.create()

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
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
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
   * 每帧更新 —— 按 Live2D SDK 官方推荐的顺序:
   * loadParameters → motion → expression → eyeBlink → breath → physics → pose → saveParameters
   */
  update(deltaTimeSeconds: number): void {
    this._userTimeSeconds += deltaTimeSeconds

    // 1. 恢复默认参数
    this._model.loadParameters()

    // 2. 更新动作（motion 覆盖参数）
    if (this._motionManager) {
      this._motionManager.updateMotion(this._model, deltaTimeSeconds)
    }

    // 3. 应用表情（叠加在 motion 之上，含平滑融合与微动作）
    this.applyExpression(deltaTimeSeconds)

    // 4. 口型同步（叠加在表情之上）
    this.applyMouthOpen()

    // 5. 自动眨眼（支持可变频率）
    this.applyEyeBlink(deltaTimeSeconds)

    // 6. 呼吸
    if (this._breath) {
      this._breath.updateParameters(this._model, deltaTimeSeconds)
    }

    // 7. 物理（头发飘动，基于当前参数值计算）
    if (this._physics) {
      this._physics.evaluate(this._model, deltaTimeSeconds)
    }

    // 8. 姿势
    if (this._pose) {
      this._pose.updateParameters(this._model, deltaTimeSeconds)
    }

    // 9. 眼睛/头部/身体跟随鼠标（含点头、摇摆、倾听姿态、凝视覆盖）
    this.applyEyeTracking(deltaTimeSeconds)

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
   * 应用当前表情参数到模型，支持平滑融合与微动作叠加
   */
  private applyExpression(deltaTimeSeconds: number): void {
    // 如果目标表情变化，启动渐变
    if (this._targetExpressionId !== this._currentExpressionId) {
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

    const targetPreset = EXPRESSION_PRESETS[this._targetExpressionId] || EXPRESSION_PRESETS.neutral
    const currentPreset = EXPRESSION_PRESETS[this._currentExpressionId] || EXPRESSION_PRESETS.neutral

    // 收集所有涉及的参数
    const paramIds = new Set([
      ...Object.keys(targetPreset),
      ...Object.keys(currentPreset),
    ])

    // 线性插值得到当前表情值
    for (const paramId of paramIds) {
      const from = currentPreset[paramId] ?? 0
      const to = targetPreset[paramId] ?? 0
      const value = from * (1 - t) + to * t
      this._currentExpressionValues.set(paramId, value)
    }

    // 应用表情值
    for (const [paramId, value] of this._currentExpressionValues) {
      const id = CubismFramework.getIdManager().getId(paramId)
      if (id) {
        this._model.setParameterValueById(id, value)
      }
    }

    // 叠加微动作预设（如打哈欠、伸懒腰）
    this.applyMicroAction(deltaTimeSeconds)
  }

  /**
   * 叠加空闲微动作（打哈欠、伸懒腰）参数
   */
  private applyMicroAction(deltaTimeSeconds: number): void {
    if (!this._microActionPreset || !this._microActionType) return

    this._microActionTimer += deltaTimeSeconds
    let weight = 0.0

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
      const id = CubismFramework.getIdManager().getId(paramId)
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

    const id = CubismFramework.getIdManager().getId('ParamMouthOpenY')
    if (id) {
      this._model.setParameterValueById(id, amplified)
    }
  }

  /**
   * 自动眨眼，支持可变频率覆盖
   */
  private applyEyeBlink(deltaTimeSeconds: number): void {
    if (!this._eyeBlink) return

    // 处理可变眨眼频率覆盖
    if (this._blinkIntervalOverride > 0) {
      this._blinkIntervalTimer += deltaTimeSeconds
      this._eyeBlink.setBlinkingInterval(this._blinkIntervalOverride)
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
      this._gazeOverrideBlend = Math.min(this._gazeOverrideBlend + deltaTimeSeconds * gazeBlendSpeed, 1.0)
    } else {
      this._gazeOverrideBlend = Math.max(this._gazeOverrideBlend - deltaTimeSeconds * gazeBlendSpeed, 0.0)
    }

    // 混合鼠标目标与凝视覆盖目标
    const targetEyeX = this._targetEyeX * (1 - this._gazeOverrideBlend) + this._gazeOverrideX * this._gazeOverrideBlend
    const targetEyeY = this._targetEyeY * (1 - this._gazeOverrideBlend) + this._gazeOverrideY * this._gazeOverrideBlend

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
    let listenLeanX = 0.0
    let listenLeanY = 0.0
    let listenTilt = 0.0
    if (this._gazeOverrideBlend > 0) {
      listenLeanY = -2.0 * this._gazeOverrideBlend // 身体前倾
      listenTilt = 3.0 * this._gazeOverrideBlend   // 头部侧倾
    }

    // 错误反应：快速摇头
    let errorShake = 0.0
    if (this._errorShakeTimer > 0) {
      this._errorShakeTimer -= deltaTimeSeconds
      errorShake = Math.sin(this._errorShakeTimer * 30) * 8.0
    }

    // 眼球
    const eyeBallX = CubismFramework.getIdManager().getId('ParamEyeBallX')
    const eyeBallY = CubismFramework.getIdManager().getId('ParamEyeBallY')
    if (eyeBallX) this._model.setParameterValueById(eyeBallX, this._currentEyeX * this._eyeTrackingFactor)
    if (eyeBallY) this._model.setParameterValueById(eyeBallY, this._currentEyeY * this._eyeTrackingFactor)

    // 头部角度
    const angleX = CubismFramework.getIdManager().getId('ParamAngleX')
    const angleY = CubismFramework.getIdManager().getId('ParamAngleY')
    const angleZ = CubismFramework.getIdManager().getId('ParamAngleZ')
    if (angleX) this._model.setParameterValueById(angleX, this._currentHeadX * this._headTrackingFactor * 30 + errorShake)
    if (angleY) this._model.setParameterValueById(angleY, this._currentHeadY * this._headTrackingFactor * 30 + nodOffset)
    if (angleZ) this._model.setParameterValueById(angleZ, listenTilt)

    // 身体角度
    const bodyAngleX = CubismFramework.getIdManager().getId('ParamBodyAngleX')
    const bodyAngleY = CubismFramework.getIdManager().getId('ParamBodyAngleY')
    if (bodyAngleX) this._model.setParameterValueById(bodyAngleX, this._currentBodyX * this._bodyTrackingFactor * 10 + swayOffset)
    if (bodyAngleY) this._model.setParameterValueById(bodyAngleY, this._currentBodyY * this._bodyTrackingFactor * 10 + listenLeanY)
  }

  /**
   * 鼠标移动事件：更新目标眼睛位置
   */
  onMouseMove(mouseX: number, mouseY: number, canvasWidth: number, canvasHeight: number): void {
    // 将鼠标坐标归一化为 [-1, 1]（裁剪空间）
    const nx = (mouseX / canvasWidth) * 2 - 1   // -1(left) ~ 1(right)
    const ny = -((mouseY / canvasHeight) * 2 - 1) // -1(bottom) ~ 1(top), Y翻转

    // 考虑 modelMatrix 的缩放/平移，逆变换到模型坐标
    this._targetEyeX = this._modelMatrix.invertTransformX(nx)
    this._targetEyeY = this._modelMatrix.invertTransformY(ny)
  }

  /**
   * 点击检测：检测坐标是否命中身体 hit area，并返回命中的身体部位
   */
  hitTest(pointX: number, pointY: number, canvasWidth: number, canvasHeight: number): 'head' | 'body' | 'hand' | null {
    if (!this._modelSetting || !this._model) return null

    // 转换为裁剪空间
    const nx = (pointX / canvasWidth) * 2 - 1
    const ny = -((pointY / canvasHeight) * 2 - 1)

    // 遍历所有 hit areas 检测
    const hitAreaCount = this._modelSetting.getHitAreasCount()
    for (let i = 0; i < hitAreaCount; i++) {
      const hitAreaId = this._modelSetting.getHitAreaId(i)
      if (this.isHit(hitAreaId, nx, ny)) {
        return this.getHitZoneForArea(hitAreaId, nx, ny)
      }
    }
    return null
  }

  /**
   * 根据命中点在 hit area 内的相对 Y 位置判断身体部位
   */
  private getHitZoneForArea(hitAreaId: CubismIdHandle, pointX: number, pointY: number): 'head' | 'body' | 'hand' {
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

    // 通过注册表翻译语义 ID → 模型 key
    let modelKey = motionId
    if (this._motionRegistry) {
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

  /**
   * 设置表情目标，由 applyExpression 平滑过渡到目标
   * @param exprId 后端返回的表情 ID（如 'happy', 'surprised'）
   */
  setExpression(exprId: string): void {
    if (EXPRESSION_PRESETS[exprId]) {
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

    this._modelMatrix.loadIdentity()
    this._modelMatrix.scale(scale, scale)
    this._modelMatrix.translateX(-scale * (actualBounds.minX + boundsW * 0.5))
    this._modelMatrix.translateY(-scale * (actualBounds.minY + boundsH * 0.5))
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

  /** MotionRegistry — 默认使用 Hiyori 映射，可通过 setRegistry 运行时切换 */
  private _registry: MotionRegistry = HIYORI_MOTION_REGISTRY

  private state: CharacterState = {
    currentMotion: null,
    currentExpression: null,
    mouthOpen: 0,
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

  /** 初始化: 等待 Core → Patch → 初始化 Framework → 加载模型 → 启动渲染 → 绑定鼠标事件 */
  async init(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas

    // 获取 WebGL context
    const ctx =
      canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true }) ||
      canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true })
    if (!ctx) throw new Error('WebGL not supported')
    this.gl = ctx

    // 等待 Live2D Core (CDN) 加载
    await this.waitForCore()

    // Patch Core 缺失的方法
    patchCoreForFramework()

    // 初始化 Cubism Framework
    this.initializeFramework()

    // 设置 canvas 物理像素尺寸（考虑 DPR）并同步 WebGL viewport
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.viewport(0, 0, canvas.width, canvas.height)

    // 加载模型
    this.model = new LAppModel()
    this.model.setMotionRegistry(this._registry)
    await this.model.loadAssets(MODEL_PATH, this.gl, canvas.width, canvas.height)

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

    // 启动渲染循环
    this.lastFrameTime = performance.now()
    this.startRenderLoop()

    console.log('[Live2D] Init complete')
  }

  /** 绑定鼠标移动和点击事件 */
  private bindMouseEvents(canvas: HTMLCanvasElement): void {
    // 鼠标移动：眼睛跟随。绑定到 window 而不是 canvas，这样即使聊天消息等
    // UI 元素覆盖在 canvas 上方，人物眼睛仍然能跟随鼠标。
    this._canvasMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      this.model?.onMouseMove(x, y, rect.width, rect.height)
    }
    window.addEventListener('mousemove', this._canvasMouseMove)

    // 鼠标点击：身体互动（仍绑定在 canvas 上，避免点击 UI 时误触发）
    this._canvasClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const zone = this.model?.hitTest(x, y, rect.width, rect.height)
      if (!zone) return

      console.log('[Live2D] Tapped:', zone)
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
        case 'body':
        default:
          this._onTapBody?.()
          break
      }
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
    const loop = (time: number) => {
      if (!this.gl || !this.model || !this.canvas) {
        this.animFrameId = requestAnimationFrame(loop)
        return
      }

      // 页面在后台时跳过渲染，降低 CPU/GPU 占用
      if (!this._isVisible) {
        this.lastFrameTime = time
        this.animFrameId = requestAnimationFrame(loop)
        return
      }

      const delta = Math.min((time - this.lastFrameTime) / 1000, 0.5)
      this.lastFrameTime = time

      // WebGL 全局状态
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height)
      this.gl.clearColor(0.0, 0.0, 0.0, 0.0)
      this.gl.enable(this.gl.BLEND)
      this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA)
      this.gl.disable(this.gl.CULL_FACE)
      this.gl.clear(this.gl.COLOR_BUFFER_BIT)

      // 投影矩阵 — 使用正交投影补偿 canvas 宽高比，防止竖屏手机人物被拉伸变形
      const projection = new CubismMatrix44()
      const aspect = this.canvas.width / this.canvas.height
      const arr = projection.getArray()
      arr[0] = 1.0 / aspect  // X: 映射 [-aspect, +aspect] → [-1, +1]
      arr[5] = 1.0            // Y: 映射 [-1, +1] → [-1, +1]

      // 更新并绘制模型
      this.model.update(delta)
      this.model.draw(projection)

      this.animFrameId = requestAnimationFrame(loop)
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

    const dpr = window.devicePixelRatio || 1
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
      if (this._canvasMouseMove) window.removeEventListener('mousemove', this._canvasMouseMove)
      if (this._canvasClick) this.canvas.removeEventListener('click', this._canvasClick)
    }
    if (this.animFrameId) cancelAnimationFrame(this.animFrameId)
    if (this.model) this.model.release()
    if (this.frameworkInitialized) CubismFramework.dispose()
  }
}
