// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismIdHandle } from '../id/cubismid';

/**
 * @brief 动作曲线目标类型
 *
 * 动作曲线目标类型。
 */
export enum CubismMotionCurveTarget {
  CubismMotionCurveTarget_Model, // 针对模型
  CubismMotionCurveTarget_Parameter, // 针对参数
  CubismMotionCurveTarget_PartOpacity // 针对部件不透明度
}

/**
 * @brief 动作曲线段类型
 *
 * 动作曲线段类型。
 */
export enum CubismMotionSegmentType {
  CubismMotionSegmentType_Linear = 0, // 线性
  CubismMotionSegmentType_Bezier = 1, // 贝塞尔曲线
  CubismMotionSegmentType_Stepped = 2, // 阶梯
  CubismMotionSegmentType_InverseStepped = 3 // 反向阶梯
}

/**
 * @brief 动作曲线控制点
 *
 * 动作曲线控制点。
 */
export class CubismMotionPoint {
  time = 0.0; // 时间[秒]
  value = 0.0; // 值
}

/**
 * 动作曲线段的求值函数
 *
 * @param   points      动作曲线控制点列表
 * @param   time        要求值的时间[秒]
 */
export interface csmMotionSegmentEvaluationFunction {
  (points: CubismMotionPoint[], time: number): number;
}

/**
 * @brief 动作曲线段
 *
 * 动作曲线段。
 */
export class CubismMotionSegment {
  /**
   * @brief 构造函数
   *
   * 构造函数。
   */
  public constructor() {
    this.evaluate = null;
    this.basePointIndex = 0;
    this.segmentType = 0;
  }

  evaluate: csmMotionSegmentEvaluationFunction; // 使用的求值函数
  basePointIndex: number; // 第一个段的索引
  segmentType: number; // 段类型
}

/**
 * @brief 动作曲线
 *
 * 动作曲线。
 */
export class CubismMotionCurve {
  public constructor() {
    this.type = CubismMotionCurveTarget.CubismMotionCurveTarget_Model;
    this.segmentCount = 0;
    this.baseSegmentIndex = 0;
    this.fadeInTime = 0.0;
    this.fadeOutTime = 0.0;
  }

  type: CubismMotionCurveTarget; // 曲线类型
  id: CubismIdHandle; // 曲线 ID
  segmentCount: number; // 段数量
  baseSegmentIndex: number; // 第一个段的索引
  fadeInTime: number; // 淡入时间[秒]
  fadeOutTime: number; // 淡出时间[秒]
}

/**
 * 事件。
 */
export class CubismMotionEvent {
  fireTime = 0.0;
  value: string;
}

/**
 * @brief 动作数据
 *
 * 动作数据。
 */
export class CubismMotionData {
  public constructor() {
    this.duration = 0.0;
    this.loop = false;
    this.curveCount = 0;
    this.eventCount = 0;
    this.fps = 0.0;

    this.curves = new Array<CubismMotionCurve>();
    this.segments = new Array<CubismMotionSegment>();
    this.points = new Array<CubismMotionPoint>();
    this.events = new Array<CubismMotionEvent>();
  }

  duration: number; // 动作长度[秒]
  loop: boolean; // 是否循环
  curveCount: number; // 曲线数量
  eventCount: number; // UserData 数量
  fps: number; // 帧率
  curves: Array<CubismMotionCurve>; // 曲线列表
  segments: Array<CubismMotionSegment>; // 段列表
  points: Array<CubismMotionPoint>; // 点列表
  events: Array<CubismMotionEvent>; // 事件列表
}

// 兼容性命名空间定义。
import * as $ from './cubismmotioninternal';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismMotionCurve = $.CubismMotionCurve;
  export type CubismMotionCurve = $.CubismMotionCurve;
  export const CubismMotionCurveTarget = $.CubismMotionCurveTarget;
  export type CubismMotionCurveTarget = $.CubismMotionCurveTarget;
  export const CubismMotionData = $.CubismMotionData;
  export type CubismMotionData = $.CubismMotionData;
  export const CubismMotionEvent = $.CubismMotionEvent;
  export type CubismMotionEvent = $.CubismMotionEvent;
  export const CubismMotionPoint = $.CubismMotionPoint;
  export type CubismMotionPoint = $.CubismMotionPoint;
  export const CubismMotionSegment = $.CubismMotionSegment;
  export type CubismMotionSegment = $.CubismMotionSegment;
  export const CubismMotionSegmentType = $.CubismMotionSegmentType;
  export type CubismMotionSegmentType = $.CubismMotionSegmentType;
  export type csmMotionSegmentEvaluationFunction =
    $.csmMotionSegmentEvaluationFunction;
}
