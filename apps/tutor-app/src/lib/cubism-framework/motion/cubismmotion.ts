// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismIdHandle } from '../id/cubismid';
import { csmDelete, CubismFramework } from '../live2dcubismframework';
import { CubismMath } from '../math/cubismmath';
import { updateSize } from '../utils/cubismarrayutils';
import { CubismModel } from '../model/cubismmodel';
import {
  CSM_ASSERT,
  CubismLogDebug,
  CubismLogError,
  CubismLogWarning
} from '../utils/cubismdebug';
import {
  ACubismMotion,
  BeganMotionCallback,
  FinishedMotionCallback
} from './acubismmotion';
import {
  CubismMotionCurve,
  CubismMotionCurveTarget,
  CubismMotionData,
  CubismMotionEvent,
  CubismMotionPoint,
  CubismMotionSegment,
  CubismMotionSegmentType
} from './cubismmotioninternal';
import { CubismMotionJson, EvaluationOptionFlag } from './cubismmotionjson';
import { CubismMotionQueueEntry } from './cubismmotionqueueentry';

const EffectNameEyeBlink = 'EyeBlink';
const EffectNameLipSync = 'LipSync';
const TargetNameModel = 'Model';
const TargetNameParameter = 'Parameter';
const TargetNamePartOpacity = 'PartOpacity';

// ID
const IdNameOpacity = 'Opacity';

/**
 * 若要还原 Cubism SDK R2 及以前的动作则为 true，若要正确还原动画师的动作则为 false。
 */
const UseOldBeziersCurveMotion = false;

function lerpPoints(
  a: CubismMotionPoint,
  b: CubismMotionPoint,
  t: number
): CubismMotionPoint {
  const result: CubismMotionPoint = new CubismMotionPoint();

  result.time = a.time + (b.time - a.time) * t;
  result.value = a.value + (b.value - a.value) * t;

  return result;
}

function linearEvaluate(points: CubismMotionPoint[], time: number): number {
  let t: number = (time - points[0].time) / (points[1].time - points[0].time);

  if (t < 0.0) {
    t = 0.0;
  }

  return points[0].value + (points[1].value - points[0].value) * t;
}

function bezierEvaluate(points: CubismMotionPoint[], time: number): number {
  let t: number = (time - points[0].time) / (points[3].time - points[0].time);

  if (t < 0.0) {
    t = 0.0;
  }

  const p01: CubismMotionPoint = lerpPoints(points[0], points[1], t);
  const p12: CubismMotionPoint = lerpPoints(points[1], points[2], t);
  const p23: CubismMotionPoint = lerpPoints(points[2], points[3], t);

  const p012: CubismMotionPoint = lerpPoints(p01, p12, t);
  const p123: CubismMotionPoint = lerpPoints(p12, p23, t);

  return lerpPoints(p012, p123, t).value;
}

function bezierEvaluateBinarySearch(
  points: CubismMotionPoint[],
  time: number
): number {
  const xError = 0.01;

  const x: number = time;
  let x1: number = points[0].time;
  let x2: number = points[3].time;
  let cx1: number = points[1].time;
  let cx2: number = points[2].time;

  let ta = 0.0;
  let tb = 1.0;
  let t = 0.0;
  let i = 0;

  for (let var33 = true; i < 20; ++i) {
    if (x < x1 + xError) {
      t = ta;
      break;
    }

    if (x2 - xError < x) {
      t = tb;
      break;
    }

    let centerx: number = (cx1 + cx2) * 0.5;
    cx1 = (x1 + cx1) * 0.5;
    cx2 = (x2 + cx2) * 0.5;
    const ctrlx12: number = (cx1 + centerx) * 0.5;
    const ctrlx21: number = (cx2 + centerx) * 0.5;
    centerx = (ctrlx12 + ctrlx21) * 0.5;
    if (x < centerx) {
      tb = (ta + tb) * 0.5;
      if (centerx - xError < x) {
        t = tb;
        break;
      }

      x2 = centerx;
      cx2 = ctrlx12;
    } else {
      ta = (ta + tb) * 0.5;
      if (x < centerx + xError) {
        t = ta;
        break;
      }

      x1 = centerx;
      cx1 = ctrlx21;
    }
  }

  if (i == 20) {
    t = (ta + tb) * 0.5;
  }

  if (t < 0.0) {
    t = 0.0;
  }
  if (t > 1.0) {
    t = 1.0;
  }

  const p01: CubismMotionPoint = lerpPoints(points[0], points[1], t);
  const p12: CubismMotionPoint = lerpPoints(points[1], points[2], t);
  const p23: CubismMotionPoint = lerpPoints(points[2], points[3], t);

  const p012: CubismMotionPoint = lerpPoints(p01, p12, t);
  const p123: CubismMotionPoint = lerpPoints(p12, p23, t);

  return lerpPoints(p012, p123, t).value;
}

function bezierEvaluateCardanoInterpretation(
  points: CubismMotionPoint[],
  time: number
): number {
  const x: number = time;
  const x1: number = points[0].time;
  const x2: number = points[3].time;
  const cx1: number = points[1].time;
  const cx2: number = points[2].time;

  const a: number = x2 - 3.0 * cx2 + 3.0 * cx1 - x1;
  const b: number = 3.0 * cx2 - 6.0 * cx1 + 3.0 * x1;
  const c: number = 3.0 * cx1 - 3.0 * x1;
  const d: number = x1 - x;

  const t: number = CubismMath.cardanoAlgorithmForBezier(a, b, c, d);

  const p01: CubismMotionPoint = lerpPoints(points[0], points[1], t);
  const p12: CubismMotionPoint = lerpPoints(points[1], points[2], t);
  const p23: CubismMotionPoint = lerpPoints(points[2], points[3], t);

  const p012: CubismMotionPoint = lerpPoints(p01, p12, t);
  const p123: CubismMotionPoint = lerpPoints(p12, p23, t);

  return lerpPoints(p012, p123, t).value;
}

function steppedEvaluate(points: CubismMotionPoint[], time: number): number {
  return points[0].value;
}

function inverseSteppedEvaluate(
  points: CubismMotionPoint[],
  time: number
): number {
  return points[1].value;
}

function evaluateCurve(
  motionData: CubismMotionData,
  index: number,
  time: number,
  isCorrection: boolean,
  endTime: number
): number {
  // 查找要求值的段。
  const curve: CubismMotionCurve = motionData.curves[index];

  let target = -1;
  const totalSegmentCount: number = curve.baseSegmentIndex + curve.segmentCount;
  let pointPosition = 0;
  for (let i: number = curve.baseSegmentIndex; i < totalSegmentCount; ++i) {
    // 获取下一段的第一个点。
    pointPosition =
      motionData.segments[i].basePointIndex +
      ((motionData.segments[i].segmentType as CubismMotionSegmentType) ==
      CubismMotionSegmentType.CubismMotionSegmentType_Bezier
        ? 3
        : 1);

    // 如果时间在当前段内则跳出。
    if (motionData.points[pointPosition].time > time) {
      target = i;
      break;
    }
  }

  if (target == -1) {
    if (isCorrection && time < endTime) {
      return correctEndPoint(
        motionData,
        totalSegmentCount - 1,
        motionData.segments[curve.baseSegmentIndex].basePointIndex,
        pointPosition,
        time,
        endTime
      );
    }
    return motionData.points[pointPosition].value;
  }

  const segment: CubismMotionSegment = motionData.segments[target];

  return segment.evaluate(
    motionData.points.slice(segment.basePointIndex),
    time
  );
}

/**
 * 从终点到起点的补正处理
 * @param motionData
 * @param segmentIndex
 * @param beginIndex
 * @param endIndex
 * @param time
 * @param endTime
 * @return
 */
function correctEndPoint(
  motionData: CubismMotionData,
  segmentIndex: number,
  beginIndex: number,
  endIndex: number,
  time: number,
  endTime: number
): number {
  const motionPoint: CubismMotionPoint[] = [
    new CubismMotionPoint(),
    new CubismMotionPoint()
  ];
  {
    const src = motionData.points[endIndex];
    motionPoint[0].time = src.time;
    motionPoint[0].value = src.value;
  }
  {
    const src = motionData.points[beginIndex];
    motionPoint[1].time = endTime;
    motionPoint[1].value = src.value;
  }

  switch (
    motionData.segments[segmentIndex].segmentType as CubismMotionSegmentType
  ) {
    case CubismMotionSegmentType.CubismMotionSegmentType_Linear:
    case CubismMotionSegmentType.CubismMotionSegmentType_Bezier:
    default:
      return linearEvaluate(motionPoint, time);
    case CubismMotionSegmentType.CubismMotionSegmentType_Stepped:
      return steppedEvaluate(motionPoint, time);
    case CubismMotionSegmentType.CubismMotionSegmentType_InverseStepped:
      return inverseSteppedEvaluate(motionPoint, time);
  }
}

/**
 * 动作行为版本控制的枚举。
 * 详情请参见 SDK 手册。
 */
export enum MotionBehavior {
  MotionBehavior_V1,
  MotionBehavior_V2
}

/**
 * 动作类
 *
 * 动作类。
 */
export class CubismMotion extends ACubismMotion {
  /**
   * 创建实例
   *
   * @param buffer 已加载 motion3.json 的缓冲区
   * @param size 缓冲区大小
   * @param onFinishedMotionHandler 动作播放结束时调用的回调函数
   * @param onBeganMotionHandler 动作播放开始时调用的回调函数
   * @param shouldCheckMotionConsistency 是否检查 motion3.json 一致性
   * @return 创建的实例
   */
  public static create(
    buffer: ArrayBuffer,
    size: number,
    onFinishedMotionHandler?: FinishedMotionCallback,
    onBeganMotionHandler?: BeganMotionCallback,
    shouldCheckMotionConsistency: boolean = false
  ): CubismMotion {
    const ret = new CubismMotion();

    ret.parse(buffer, size, shouldCheckMotionConsistency);
    if (ret._motionData) {
      ret._sourceFrameRate = ret._motionData.fps;
      ret._loopDurationSeconds = ret._motionData.duration;
      ret._onFinishedMotion = onFinishedMotionHandler;
      ret._onBeganMotion = onBeganMotionHandler;
    } else {
      csmDelete(ret);
      return null;
    }

    // NOTE: 编辑器不支持导出带循环的动作
    // ret->_loop = (ret->_motionData->Loop > 0);
    return ret;
  }

  /**
   * 执行模型参数更新
   * @param model             目标模型
   * @param userTimeSeconds   当前时刻[秒]
   * @param fadeWeight        动作权重
   * @param motionQueueEntry  CubismMotionQueueManager 中管理的动作
   */
  public doUpdateParameters(
    model: CubismModel,
    userTimeSeconds: number,
    fadeWeight: number,
    motionQueueEntry: CubismMotionQueueEntry
  ): void {
    if (this._modelCurveIdEyeBlink == null) {
      this._modelCurveIdEyeBlink =
        CubismFramework.getIdManager().getId(EffectNameEyeBlink);
    }

    if (this._modelCurveIdLipSync == null) {
      this._modelCurveIdLipSync =
        CubismFramework.getIdManager().getId(EffectNameLipSync);
    }

    if (this._modelCurveIdOpacity == null) {
      this._modelCurveIdOpacity =
        CubismFramework.getIdManager().getId(IdNameOpacity);
    }

    if (this._motionBehavior === MotionBehavior.MotionBehavior_V2) {
      if (this._previousLoopState !== this._isLoop) {
        // 计算结束时间
        this.adjustEndTime(motionQueueEntry);
        this._previousLoopState = this._isLoop;
      }
    }

    let timeOffsetSeconds: number =
      userTimeSeconds - motionQueueEntry.getStartTime();

    if (timeOffsetSeconds < 0.0) {
      timeOffsetSeconds = 0.0; // 避免错误
    }

    let lipSyncValue: number = Number.MAX_VALUE;
    let eyeBlinkValue: number = Number.MAX_VALUE;

    // 用于检测眨眼、唇形同步中动作是否应用的位（最多 maxFlagCount 个）
    const maxTargetSize = 64;
    let lipSyncFlags = 0;
    let eyeBlinkFlags = 0;

    // 眨眼、唇形同步目标数超过上限时
    if (this._eyeBlinkParameterIds.length > maxTargetSize) {
      CubismLogDebug(
        'too many eye blink targets : {0}',
        this._eyeBlinkParameterIds.length
      );
    }
    if (this._lipSyncParameterIds.length > maxTargetSize) {
      CubismLogDebug(
        'too many lip sync targets : {0}',
        this._lipSyncParameterIds.length
      );
    }

    const tmpFadeIn: number =
      this._fadeInSeconds <= 0.0
        ? 1.0
        : CubismMath.getEasingSine(
            (userTimeSeconds - motionQueueEntry.getFadeInStartTime()) /
              this._fadeInSeconds
          );

    const tmpFadeOut: number =
      this._fadeOutSeconds <= 0.0 || motionQueueEntry.getEndTime() < 0.0
        ? 1.0
        : CubismMath.getEasingSine(
            (motionQueueEntry.getEndTime() - userTimeSeconds) /
              this._fadeOutSeconds
          );
    let value: number;
    let c: number, parameterIndex: number;

    // 必要时重复时间。
    let time: number = timeOffsetSeconds;
    let duration: number = this._motionData.duration;
    const isCorrection: boolean =
      this._motionBehavior === MotionBehavior.MotionBehavior_V2 && this._isLoop;

    if (this._isLoop) {
      if (this._motionBehavior === MotionBehavior.MotionBehavior_V2) {
        duration += 1.0 / this._motionData.fps;
      }
      while (time > duration) {
        time -= duration;
      }
    }

    const curves: Array<CubismMotionCurve> = this._motionData.curves;

    // 求值模型曲线。
    for (
      c = 0;
      c < this._motionData.curveCount &&
      curves[c].type == CubismMotionCurveTarget.CubismMotionCurveTarget_Model;
      ++c
    ) {
      // 求值曲线并调用处理器。
      value = evaluateCurve(this._motionData, c, time, isCorrection, duration);

      if (curves[c].id == this._modelCurveIdEyeBlink) {
        eyeBlinkValue = value;
      } else if (curves[c].id == this._modelCurveIdLipSync) {
        lipSyncValue = value;
      } else if (curves[c].id == this._modelCurveIdOpacity) {
        this._modelOpacity = value;
        model.setModelOapcity(this.getModelOpacityValue());
      }
    }

    let parameterMotionCurveCount = 0;

    for (
      ;
      c < this._motionData.curveCount &&
      curves[c].type ==
        CubismMotionCurveTarget.CubismMotionCurveTarget_Parameter;
      ++c
    ) {
      parameterMotionCurveCount++;

      // 查找参数索引。
      parameterIndex = model.getParameterIndex(curves[c].id);

      // 如果接收端没有值则跳过曲线求值。
      if (parameterIndex == -1) {
        continue;
      }

      const sourceValue: number =
        model.getParameterValueByIndex(parameterIndex);

      // 求值曲线并应用值。
      value = evaluateCurve(this._motionData, c, time, isCorrection, duration);

      if (eyeBlinkValue != Number.MAX_VALUE) {
        for (
          let i = 0;
          i < this._eyeBlinkParameterIds.length && i < maxTargetSize;
          ++i
        ) {
          if (this._eyeBlinkParameterIds[i] == curves[c].id) {
            value *= eyeBlinkValue;
            eyeBlinkFlags |= 1 << i;
            break;
          }
        }
      }

      if (lipSyncValue != Number.MAX_VALUE) {
        for (
          let i = 0;
          i < this._lipSyncParameterIds.length && i < maxTargetSize;
          ++i
        ) {
          if (this._lipSyncParameterIds[i] == curves[c].id) {
            value += lipSyncValue;
            lipSyncFlags |= 1 << i;
            break;
          }
        }
      }

      // 为兼容性仅处理“重复”
      if (model.isRepeat(parameterIndex)) {
        value = model.getParameterRepeatValue(parameterIndex, value);
      }

      let v: number;

      // 每个参数的淡入淡出
      if (curves[c].fadeInTime < 0.0 && curves[c].fadeOutTime < 0.0) {
        // 应用动作的淡入淡出
        v = sourceValue + (value - sourceValue) * fadeWeight;
      } else {
        // 如果对参数设置了淡入或淡出，则应用该设置
        let fin: number;
        let fout: number;

        if (curves[c].fadeInTime < 0.0) {
          fin = tmpFadeIn;
        } else {
          fin =
            curves[c].fadeInTime == 0.0
              ? 1.0
              : CubismMath.getEasingSine(
                  (userTimeSeconds - motionQueueEntry.getFadeInStartTime()) /
                    curves[c].fadeInTime
                );
        }

        if (curves[c].fadeOutTime < 0.0) {
          fout = tmpFadeOut;
        } else {
          fout =
            curves[c].fadeOutTime == 0.0 || motionQueueEntry.getEndTime() < 0.0
              ? 1.0
              : CubismMath.getEasingSine(
                  (motionQueueEntry.getEndTime() - userTimeSeconds) /
                    curves[c].fadeOutTime
                );
        }

        const paramWeight: number = this._weight * fin * fout;

        // 应用每个参数的淡入淡出
        v = sourceValue + (value - sourceValue) * paramWeight;
      }

      model.setParameterValueByIndex(parameterIndex, v, 1.0);
    }

    {
      if (eyeBlinkValue != Number.MAX_VALUE) {
        for (
          let i = 0;
          i < this._eyeBlinkParameterIds.length && i < maxTargetSize;
          ++i
        ) {
          const sourceValue: number = model.getParameterValueById(
            this._eyeBlinkParameterIds[i]
          );

          // 如果动作中已覆盖，则不应用眨眼
          if ((eyeBlinkFlags >> i) & 0x01) {
            continue;
          }

          const v: number =
            sourceValue + (eyeBlinkValue - sourceValue) * fadeWeight;

          model.setParameterValueById(this._eyeBlinkParameterIds[i], v);
        }
      }

      if (lipSyncValue != Number.MAX_VALUE) {
        for (
          let i = 0;
          i < this._lipSyncParameterIds.length && i < maxTargetSize;
          ++i
        ) {
          const sourceValue: number = model.getParameterValueById(
            this._lipSyncParameterIds[i]
          );

          // 如果动作中已覆盖，则不应用唇形同步
          if ((lipSyncFlags >> i) & 0x01) {
            continue;
          }

          const v: number =
            sourceValue + (lipSyncValue - sourceValue) * fadeWeight;

          model.setParameterValueById(this._lipSyncParameterIds[i], v);
        }
      }
    }

    for (
      ;
      c < this._motionData.curveCount &&
      curves[c].type ==
        CubismMotionCurveTarget.CubismMotionCurveTarget_PartOpacity;
      ++c
    ) {
      // 查找参数索引。
      parameterIndex = model.getParameterIndex(curves[c].id);

      // 如果接收端没有值则跳过曲线求值。
      if (parameterIndex == -1) {
        continue;
      }

      // 求值曲线并应用值。
      value = evaluateCurve(this._motionData, c, time, isCorrection, duration);

      model.setParameterValueByIndex(parameterIndex, value);
    }

    if (timeOffsetSeconds >= duration) {
      if (this._isLoop) {
        this.updateForNextLoop(motionQueueEntry, userTimeSeconds, time);
      } else {
        if (this._onFinishedMotion) {
          this._onFinishedMotion(this);
        }

        motionQueueEntry.setIsFinished(true);
      }
    }
    this._lastWeight = fadeWeight;
  }

  /**
   * 设置 Motion Behavior 版本。
   *
   * @param motionBehavior 指定 Motion Behavior 版本。
   */
  public setMotionBehavior(motionBehavior: MotionBehavior) {
    this._motionBehavior = motionBehavior;
  }

  /**
   * 获取 Motion Behavior 版本。
   *
   * @return 返回 Motion Behavior 版本。
   */
  public getMotionBehavior(): MotionBehavior {
    return this._motionBehavior;
  }

  /**
   * 获取动作长度。
   *
   * @return  动作长度[秒]
   */
  public getDuration(): number {
    return this._isLoop ? -1.0 : this._loopDurationSeconds;
  }

  /**
   * 获取动作循环时的长度。
   *
   * @return  动作循环时的长度[秒]
   */
  public getLoopDuration(): number {
    return this._loopDurationSeconds;
  }

  /**
   * 设置参数淡入时间。
   *
   * @param parameterId     参数 ID
   * @param value           淡入时间[秒]
   */
  public setParameterFadeInTime(
    parameterId: CubismIdHandle,
    value: number
  ): void {
    const curves: Array<CubismMotionCurve> = this._motionData.curves;

    for (let i = 0; i < this._motionData.curveCount; ++i) {
      if (parameterId == curves[i].id) {
        curves[i].fadeInTime = value;
        return;
      }
    }
  }

  /**
   * 设置参数淡出时间
   * @param parameterId     参数 ID
   * @param value           淡出时间[秒]
   */
  public setParameterFadeOutTime(
    parameterId: CubismIdHandle,
    value: number
  ): void {
    const curves: Array<CubismMotionCurve> = this._motionData.curves;

    for (let i = 0; i < this._motionData.curveCount; ++i) {
      if (parameterId == curves[i].id) {
        curves[i].fadeOutTime = value;
        return;
      }
    }
  }

  /**
   * 获取参数淡入时间
   * @param    parameterId     参数 ID
   * @return   淡入时间[秒]
   */
  public getParameterFadeInTime(parameterId: CubismIdHandle): number {
    const curves: Array<CubismMotionCurve> = this._motionData.curves;

    for (let i = 0; i < this._motionData.curveCount; ++i) {
      if (parameterId == curves[i].id) {
        return curves[i].fadeInTime;
      }
    }

    return -1;
  }

  /**
   * 获取参数淡出时间
   *
   * @param   parameterId     参数 ID
   * @return   淡出时间[秒]
   */
  public getParameterFadeOutTime(parameterId: CubismIdHandle): number {
    const curves: Array<CubismMotionCurve> = this._motionData.curves;

    for (let i = 0; i < this._motionData.curveCount; ++i) {
      if (parameterId == curves[i].id) {
        return curves[i].fadeOutTime;
      }
    }

    return -1;
  }

  /**
   * 设置自动效果影响的参数 ID 列表
   * @param eyeBlinkParameterIds    自动眨眼影响的参数 ID 列表
   * @param lipSyncParameterIds     唇形同步影响的参数 ID 列表
   */
  public setEffectIds(
    eyeBlinkParameterIds: Array<CubismIdHandle>,
    lipSyncParameterIds: Array<CubismIdHandle>
  ): void {
    this._eyeBlinkParameterIds = eyeBlinkParameterIds;
    this._lipSyncParameterIds = lipSyncParameterIds;
  }

  /**
   * 构造函数
   */
  public constructor() {
    super();
    this._sourceFrameRate = 30.0;
    this._loopDurationSeconds = -1.0;
    this._isLoop = false; // 默认值由 true 改为 false
    this._isLoopFadeIn = true; // 循环时是否启用淡入的标志
    this._lastWeight = 0.0;
    this._motionData = null;
    this._modelCurveIdEyeBlink = null;
    this._modelCurveIdLipSync = null;
    this._modelCurveIdOpacity = null;
    this._eyeBlinkParameterIds = null;
    this._lipSyncParameterIds = null;
    this._modelOpacity = 1.0;
    this._debugMode = false;
  }

  /**
   * 析构等效处理
   */
  public release(): void {
    this._motionData = void 0;
    this._motionData = null;
  }

  /**
   *
   * @param motionQueueEntry
   * @param userTimeSeconds
   * @param time
   */
  public updateForNextLoop(
    motionQueueEntry: CubismMotionQueueEntry,
    userTimeSeconds: number,
    time: number
  ) {
    switch (this._motionBehavior) {
      case MotionBehavior.MotionBehavior_V2:
      default:
        motionQueueEntry.setStartTime(userTimeSeconds - time); // 回到初始状态
        if (this._isLoopFadeIn) {
          // 循环中且循环用淡入有效时，重新设置淡入
          motionQueueEntry.setFadeInStartTime(userTimeSeconds - time);
        }

        if (this._onFinishedMotion != null) {
          this._onFinishedMotion(this);
        }
        break;
      case MotionBehavior.MotionBehavior_V1:
        // 旧版循环处理
        motionQueueEntry.setStartTime(userTimeSeconds); // 回到初始状态
        if (this._isLoopFadeIn) {
          // 循环中且循环用淡入有效时，重新设置淡入
          motionQueueEntry.setFadeInStartTime(userTimeSeconds);
        }
        break;
    }
  }

  /**
   * 解析 motion3.json。
   *
   * @param motionJson  已加载 motion3.json 的缓冲区
   * @param size        缓冲区大小
   * @param shouldCheckMotionConsistency 是否检查 motion3.json 一致性
   */
  public parse(
    motionJson: ArrayBuffer,
    size: number,
    shouldCheckMotionConsistency: boolean = false
  ): void {
    let json: CubismMotionJson = new CubismMotionJson(motionJson, size);

    if (!json) {
      json.release();
      json = void 0;
      return;
    }

    if (shouldCheckMotionConsistency) {
      const consistency = json.hasConsistency();
      if (!consistency) {
        json.release();
        CubismLogError('Inconsistent motion3.json.');
        return;
      }
    }

    this._motionData = new CubismMotionData();

    this._motionData.duration = json.getMotionDuration();
    this._motionData.loop = json.isMotionLoop();
    this._motionData.curveCount = json.getMotionCurveCount();
    this._motionData.fps = json.getMotionFps();
    this._motionData.eventCount = json.getEventCount();

    const areBeziersRestructed: boolean = json.getEvaluationOptionFlag(
      EvaluationOptionFlag.EvaluationOptionFlag_AreBeziersRistricted
    );

    if (json.isExistMotionFadeInTime()) {
      this._fadeInSeconds =
        json.getMotionFadeInTime() < 0.0 ? 1.0 : json.getMotionFadeInTime();
    } else {
      this._fadeInSeconds = 1.0;
    }

    if (json.isExistMotionFadeOutTime()) {
      this._fadeOutSeconds =
        json.getMotionFadeOutTime() < 0.0 ? 1.0 : json.getMotionFadeOutTime();
    } else {
      this._fadeOutSeconds = 1.0;
    }

    updateSize(
      this._motionData.curves,
      this._motionData.curveCount,
      CubismMotionCurve,
      true
    );
    updateSize(
      this._motionData.segments,
      json.getMotionTotalSegmentCount(),
      CubismMotionSegment,
      true
    );
    updateSize(
      this._motionData.points,
      json.getMotionTotalPointCount(),
      CubismMotionPoint,
      true
    );
    updateSize(
      this._motionData.events,
      this._motionData.eventCount,
      CubismMotionEvent,
      true
    );

    let totalPointCount = 0;
    let totalSegmentCount = 0;

    // 曲线
    for (
      let curveCount = 0;
      curveCount < this._motionData.curveCount;
      ++curveCount
    ) {
      if (json.getMotionCurveTarget(curveCount) == TargetNameModel) {
        this._motionData.curves[curveCount].type =
          CubismMotionCurveTarget.CubismMotionCurveTarget_Model;
      } else if (json.getMotionCurveTarget(curveCount) == TargetNameParameter) {
        this._motionData.curves[curveCount].type =
          CubismMotionCurveTarget.CubismMotionCurveTarget_Parameter;
      } else if (
        json.getMotionCurveTarget(curveCount) == TargetNamePartOpacity
      ) {
        this._motionData.curves[curveCount].type =
          CubismMotionCurveTarget.CubismMotionCurveTarget_PartOpacity;
      } else {
        CubismLogWarning(
          'Warning : Unable to get segment type from Curve! The number of "CurveCount" may be incorrect!'
        );
      }

      this._motionData.curves[curveCount].id =
        json.getMotionCurveId(curveCount);

      this._motionData.curves[curveCount].baseSegmentIndex = totalSegmentCount;

      this._motionData.curves[curveCount].fadeInTime =
        json.isExistMotionCurveFadeInTime(curveCount)
          ? json.getMotionCurveFadeInTime(curveCount)
          : -1.0;
      this._motionData.curves[curveCount].fadeOutTime =
        json.isExistMotionCurveFadeOutTime(curveCount)
          ? json.getMotionCurveFadeOutTime(curveCount)
          : -1.0;

      // 段
      for (
        let segmentPosition = 0;
        segmentPosition < json.getMotionCurveSegmentCount(curveCount);
      ) {
        if (segmentPosition == 0) {
          this._motionData.segments[totalSegmentCount].basePointIndex =
            totalPointCount;

          this._motionData.points[totalPointCount].time =
            json.getMotionCurveSegment(curveCount, segmentPosition);
          this._motionData.points[totalPointCount].value =
            json.getMotionCurveSegment(curveCount, segmentPosition + 1);

          totalPointCount += 1;
          segmentPosition += 2;
        } else {
          this._motionData.segments[totalSegmentCount].basePointIndex =
            totalPointCount - 1;
        }

        const segment: number = json.getMotionCurveSegment(
          curveCount,
          segmentPosition
        );

        const segmentType: CubismMotionSegmentType = segment;
        switch (segmentType) {
          case CubismMotionSegmentType.CubismMotionSegmentType_Linear: {
            this._motionData.segments[totalSegmentCount].segmentType =
              CubismMotionSegmentType.CubismMotionSegmentType_Linear;
            this._motionData.segments[totalSegmentCount].evaluate =
              linearEvaluate;

            this._motionData.points[totalPointCount].time =
              json.getMotionCurveSegment(curveCount, segmentPosition + 1);
            this._motionData.points[totalPointCount].value =
              json.getMotionCurveSegment(curveCount, segmentPosition + 2);

            totalPointCount += 1;
            segmentPosition += 3;

            break;
          }
          case CubismMotionSegmentType.CubismMotionSegmentType_Bezier: {
            this._motionData.segments[totalSegmentCount].segmentType =
              CubismMotionSegmentType.CubismMotionSegmentType_Bezier;

            if (areBeziersRestructed || UseOldBeziersCurveMotion) {
              this._motionData.segments[totalSegmentCount].evaluate =
                bezierEvaluate;
            } else {
              this._motionData.segments[totalSegmentCount].evaluate =
                bezierEvaluateCardanoInterpretation;
            }

            this._motionData.points[totalPointCount].time =
              json.getMotionCurveSegment(curveCount, segmentPosition + 1);
            this._motionData.points[totalPointCount].value =
              json.getMotionCurveSegment(curveCount, segmentPosition + 2);

            this._motionData.points[totalPointCount + 1].time =
              json.getMotionCurveSegment(curveCount, segmentPosition + 3);
            this._motionData.points[totalPointCount + 1].value =
              json.getMotionCurveSegment(curveCount, segmentPosition + 4);

            this._motionData.points[totalPointCount + 2].time =
              json.getMotionCurveSegment(curveCount, segmentPosition + 5);
            this._motionData.points[totalPointCount + 2].value =
              json.getMotionCurveSegment(curveCount, segmentPosition + 6);

            totalPointCount += 3;
            segmentPosition += 7;

            break;
          }

          case CubismMotionSegmentType.CubismMotionSegmentType_Stepped: {
            this._motionData.segments[totalSegmentCount].segmentType =
              CubismMotionSegmentType.CubismMotionSegmentType_Stepped;
            this._motionData.segments[totalSegmentCount].evaluate =
              steppedEvaluate;

            this._motionData.points[totalPointCount].time =
              json.getMotionCurveSegment(curveCount, segmentPosition + 1);
            this._motionData.points[totalPointCount].value =
              json.getMotionCurveSegment(curveCount, segmentPosition + 2);

            totalPointCount += 1;
            segmentPosition += 3;

            break;
          }

          case CubismMotionSegmentType.CubismMotionSegmentType_InverseStepped: {
            this._motionData.segments[totalSegmentCount].segmentType =
              CubismMotionSegmentType.CubismMotionSegmentType_InverseStepped;
            this._motionData.segments[totalSegmentCount].evaluate =
              inverseSteppedEvaluate;

            this._motionData.points[totalPointCount].time =
              json.getMotionCurveSegment(curveCount, segmentPosition + 1);
            this._motionData.points[totalPointCount].value =
              json.getMotionCurveSegment(curveCount, segmentPosition + 2);

            totalPointCount += 1;
            segmentPosition += 3;

            break;
          }
          default: {
            CSM_ASSERT(0);
            break;
          }
        }

        ++this._motionData.curves[curveCount].segmentCount;
        ++totalSegmentCount;
      }
    }

    for (
      let userdatacount = 0;
      userdatacount < json.getEventCount();
      ++userdatacount
    ) {
      this._motionData.events[userdatacount].fireTime =
        json.getEventTime(userdatacount);
      this._motionData.events[userdatacount].value =
        json.getEventValue(userdatacount);
    }

    json.release();
    json = void 0;
    json = null;
  }

  /**
   * 更新模型参数
   *
   * 检查事件触发。
   * 输入时间以被调用时的动作时间点为 0 的秒数。
   *
   * @param beforeCheckTimeSeconds   上次事件检查时间[秒]
   * @param motionTimeSeconds        本次播放时间[秒]
   */
  public getFiredEvent(
    beforeCheckTimeSeconds: number,
    motionTimeSeconds: number
  ): Array<string> {
    updateSize(this._firedEventValues, 0);

    // 检查事件触发
    for (let u = 0; u < this._motionData.eventCount; ++u) {
      if (
        this._motionData.events[u].fireTime > beforeCheckTimeSeconds &&
        this._motionData.events[u].fireTime <= motionTimeSeconds
      ) {
        this._firedEventValues.push(this._motionData.events[u].value);
      }
    }

    return this._firedEventValues;
  }

  /**
   * 检查是否存在透明度曲线
   *
   * @return true  -> 存在键
   *          false -> 不存在键
   */
  public isExistModelOpacity(): boolean {
    for (let i = 0; i < this._motionData.curveCount; i++) {
      const curve: CubismMotionCurve = this._motionData.curves[i];

      if (curve.type != CubismMotionCurveTarget.CubismMotionCurveTarget_Model) {
        continue;
      }

      if (curve.id.getString().localeCompare(IdNameOpacity) == 0) {
        return true;
      }
    }

    return false;
  }

  /**
   * 返回透明度曲线的索引
   *
   * @return success:透明度曲线的索引
   */
  public getModelOpacityIndex(): number {
    if (this.isExistModelOpacity()) {
      for (let i = 0; i < this._motionData.curveCount; i++) {
        const curve: CubismMotionCurve = this._motionData.curves[i];

        if (
          curve.type != CubismMotionCurveTarget.CubismMotionCurveTarget_Model
        ) {
          continue;
        }

        if (curve.id.getString().localeCompare(IdNameOpacity) == 0) {
          return i;
        }
      }
    }
    return -1;
  }

  /**
   * 返回透明度的 Id
   *
   * @param index 动作曲线的索引
   * @return success:透明度曲线的索引
   */
  public getModelOpacityId(index: number): CubismIdHandle {
    if (index != -1) {
      const curve: CubismMotionCurve = this._motionData.curves[index];

      if (curve.type == CubismMotionCurveTarget.CubismMotionCurveTarget_Model) {
        if (curve.id.getString().localeCompare(IdNameOpacity) == 0) {
          return CubismFramework.getIdManager().getId(curve.id.getString());
        }
      }
    }

    return null;
  }

  /**
   * 返回当前时间的透明度值
   *
   * @return success:动作当前时间的 Opacity 值
   */
  public getModelOpacityValue(): number {
    return this._modelOpacity;
  }

  /**
   * 设置调试标志
   *
   * @param debugMode 是否启用调试模式
   */
  public setDebugMode(debugMode: boolean): void {
    this._debugMode = debugMode;
  }

  public _sourceFrameRate: number; // 加载文件的 FPS。没有描述则默认为 15fps
  public _loopDurationSeconds: number; // mtn 文件中定义的一系列动作长度
  public _motionBehavior: MotionBehavior = MotionBehavior.MotionBehavior_V2;
  public _lastWeight: number; // 最后设置的权重

  public _motionData: CubismMotionData; // 实际的动作数据本体

  public _eyeBlinkParameterIds: Array<CubismIdHandle>; // 自动眨眼要应用的参数 ID 句柄列表。用于将模型（模型设置）与参数对应。
  public _lipSyncParameterIds: Array<CubismIdHandle>; // 唇形同步要应用的参数 ID 句柄列表。用于将模型（模型设置）与参数对应。

  public _modelCurveIdEyeBlink: CubismIdHandle; // 模型拥有的自动眨眼用参数 ID 句柄。用于将模型与动作对应。
  public _modelCurveIdLipSync: CubismIdHandle; // 模型拥有的唇形同步用参数 ID 句柄。用于将模型与动作对应。
  public _modelCurveIdOpacity: CubismIdHandle; // 模型拥有的不透明度用参数 ID 句柄。用于将模型与动作对应。

  public _modelOpacity: number; // 从动作中获取的不透明度

  private _debugMode: boolean; // 是否为调试模式
}

// 兼容性命名空间定义。
import * as $ from './cubismmotion';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismMotion = $.CubismMotion;
  export type CubismMotion = $.CubismMotion;
}
