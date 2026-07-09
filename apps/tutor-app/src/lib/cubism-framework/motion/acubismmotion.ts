// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismMath } from '../math/cubismmath';
import { CubismModel } from '../model/cubismmodel';
import { CSM_ASSERT, CubismDebug } from '../utils/cubismdebug';
import { CubismMotionQueueEntry } from './cubismmotionqueueentry';

/** 动作开始播放回调函数定义 */
export type BeganMotionCallback = (self: ACubismMotion) => void;

/** 动作结束播放回调函数定义 */
export type FinishedMotionCallback = (self: ACubismMotion) => void;

/**
 * 动作的抽象基类
 *
 * 动作的抽象基类。由 MotionQueueManager 管理动作播放。
 */
export abstract class ACubismMotion {
  /**
   * 销毁实例
   */
  public static delete(motion: ACubismMotion): void {
    motion.release();
    motion = null;
  }

  /**
   * 构造函数
   */
  public constructor() {
    this._fadeInSeconds = -1.0;
    this._fadeOutSeconds = -1.0;
    this._weight = 1.0;
    this._offsetSeconds = 0.0; // 播放开始时刻
    this._isLoop = false; // 是否循环
    this._isLoopFadeIn = true; // 循环时是否启用淡入的标志。默认为启用。
    this._previousLoopState = this._isLoop;
    this._firedEventValues = new Array<string>();
  }

  /**
   * 析构等效处理
   */
  public release(): void {
    this._weight = 0.0;
  }

  /**
   * 更新模型的参数
   * @param model 目标模型
   * @param motionQueueEntry CubismMotionQueueManager 中管理的动作
   * @param userTimeSeconds 累计增量时间[秒]
   */
  public updateParameters(
    model: CubismModel,
    motionQueueEntry: CubismMotionQueueEntry,
    userTimeSeconds: number
  ): void {
    if (!motionQueueEntry.isAvailable() || motionQueueEntry.isFinished()) {
      return;
    }

    this.setupMotionQueueEntry(motionQueueEntry, userTimeSeconds);

    const fadeWeight = this.updateFadeWeight(motionQueueEntry, userTimeSeconds);

    //---- 遍历所有参数 ID ----
    this.doUpdateParameters(
      model,
      userTimeSeconds,
      fadeWeight,
      motionQueueEntry
    );

    // 后处理
    // 超过结束时刻则设置结束标志（CubismMotionQueueManager）
    if (
      motionQueueEntry.getEndTime() > 0 &&
      motionQueueEntry.getEndTime() < userTimeSeconds
    ) {
      motionQueueEntry.setIsFinished(true); // 结束
    }
  }

  /**
   * @brief 开始模型播放处理
   *
   * 设置并开始播放动作。
   *
   * @param[in]   motionQueueEntry    CubismMotionQueueManager 中管理的动作
   * @param[in]   userTimeSeconds     累计增量时间[秒]
   */
  public setupMotionQueueEntry(
    motionQueueEntry: CubismMotionQueueEntry,
    userTimeSeconds: number
  ) {
    if (motionQueueEntry == null || motionQueueEntry.isStarted()) {
      return;
    }

    if (!motionQueueEntry.isAvailable()) {
      return;
    }

    motionQueueEntry.setIsStarted(true);
    motionQueueEntry.setStartTime(userTimeSeconds - this._offsetSeconds); // 记录动作开始时刻
    motionQueueEntry.setFadeInStartTime(userTimeSeconds); // 淡入开始时刻

    if (motionQueueEntry.getEndTime() < 0.0) {
      // 存在尚未开始就已设置结束的情况
      this.adjustEndTime(motionQueueEntry);
    }

    // 播放开始回调
    if (motionQueueEntry._motion._onBeganMotion) {
      motionQueueEntry._motion._onBeganMotion(motionQueueEntry._motion);
    }
  }

  /**
   * @brief 更新模型权重
   *
   * 更新动作权重。
   *
   * @param[in]   motionQueueEntry    CubismMotionQueueManager 中管理的动作
   * @param[in]   userTimeSeconds     累计增量时间[秒]
   */
  public updateFadeWeight(
    motionQueueEntry: CubismMotionQueueEntry,
    userTimeSeconds: number
  ): number {
    if (motionQueueEntry == null) {
      CubismDebug.print(LogLevel.LogLevel_Error, 'motionQueueEntry is null.');
    }

    let fadeWeight: number = this._weight; // 与当前值相乘的比例

    //---- 淡入/淡出处理 ----
    // 使用简单的正弦函数进行缓动
    const fadeIn: number =
      this._fadeInSeconds == 0.0
        ? 1.0
        : CubismMath.getEasingSine(
            (userTimeSeconds - motionQueueEntry.getFadeInStartTime()) /
              this._fadeInSeconds
          );

    const fadeOut: number =
      this._fadeOutSeconds == 0.0 || motionQueueEntry.getEndTime() < 0.0
        ? 1.0
        : CubismMath.getEasingSine(
            (motionQueueEntry.getEndTime() - userTimeSeconds) /
              this._fadeOutSeconds
          );

    fadeWeight = fadeWeight * fadeIn * fadeOut;

    motionQueueEntry.setState(userTimeSeconds, fadeWeight);

    CSM_ASSERT(0.0 <= fadeWeight && fadeWeight <= 1.0);

    return fadeWeight;
  }

  /**
   * 设置淡入时间
   * @param fadeInSeconds 淡入所需时间[秒]
   */
  public setFadeInTime(fadeInSeconds: number): void {
    this._fadeInSeconds = fadeInSeconds;
  }

  /**
   * 设置淡出时间
   * @param fadeOutSeconds 淡出所需时间[秒]
   */
  public setFadeOutTime(fadeOutSeconds: number): void {
    this._fadeOutSeconds = fadeOutSeconds;
  }

  /**
   * 获取淡出所需时间
   * @return 淡出所需时间[秒]
   */
  public getFadeOutTime(): number {
    return this._fadeOutSeconds;
  }

  /**
   * 获取淡入所需时间
   * @return 淡入所需时间[秒]
   */
  public getFadeInTime(): number {
    return this._fadeInSeconds;
  }

  /**
   * 设置动作应用的权重
   * @param weight 权重（0.0 - 1.0）
   */
  public setWeight(weight: number): void {
    this._weight = weight;
  }

  /**
   * 获取动作应用的权重
   * @return 权重（0.0 - 1.0）
   */
  public getWeight(): number {
    return this._weight;
  }

  /**
   * 获取动作长度
   * @return 动作长度[秒]
   *
   * @note 循环时返回「-1」。非循环时需重写。返回正值时在该时间结束。返回「-1」时，除非外部发出停止命令，否则不会结束。
   */
  public getDuration(): number {
    return -1.0;
  }

  /**
   * 获取动作单次循环的长度
   * @return 动作单次循环的长度[秒]
   *
   * @note 不循环时返回与 getDuration() 相同的值。无法定义单次循环长度时（例如程序上持续运动的子类）返回「-1」。
   */
  public getLoopDuration(): number {
    return -1.0;
  }

  /**
   * 设置动作播放的开始时刻
   * @param offsetSeconds 动作播放的开始时刻[秒]
   */
  public setOffsetTime(offsetSeconds: number): void {
    this._offsetSeconds = offsetSeconds;
  }

  /**
   * 设置循环信息
   * @param loop 循环信息
   */
  public setLoop(loop: boolean): void {
    this._isLoop = loop;
  }

  /**
   * 获取循环信息
   * @return true 循环
   * @return false 不循环
   */
  public getLoop(): boolean {
    return this._isLoop;
  }

  /**
   * 设置循环时的淡入信息
   * @param loopFadeIn  循环时的淡入信息
   */
  public setLoopFadeIn(loopFadeIn: boolean) {
    this._isLoopFadeIn = loopFadeIn;
  }

  /**
   * 获取循环时的淡入信息
   *
   * @return  true    启用
   * @return  false   不启用
   */
  public getLoopFadeIn(): boolean {
    return this._isLoopFadeIn;
  }

  /**
   * 更新模型的参数
   *
   * 检查事件触发。
   * 输入时间以被调用时的动作时间点为 0 的秒数。
   *
   * @param beforeCheckTimeSeconds 上次事件检查时间[秒]
   * @param motionTimeSeconds 本次播放时间[秒]
   */
  public getFiredEvent(
    beforeCheckTimeSeconds: number,
    motionTimeSeconds: number
  ): Array<string> {
    return this._firedEventValues;
  }

  /**
   * 更新动作并将参数值反映到模型
   * @param model 目标模型
   * @param userTimeSeconds 累计增量时间[秒]
   * @param weight 动作权重
   * @param motionQueueEntry CubismMotionQueueManager 中管理的动作
   * @return true 有参数值反映到模型
   * @return false 没有参数值反映到模型（动作无变化）
   */
  public abstract doUpdateParameters(
    model: CubismModel,
    userTimeSeconds: number,
    weight: number,
    motionQueueEntry: CubismMotionQueueEntry
  ): void;

  /**
   * 注册动作开始播放回调
   *
   * 注册动作开始播放回调。
   * 在以下情况下不会被调用：
   *   1. 播放中的动作被设置为「循环」时
   *   2. 未注册回调时
   *
   * @param onBeganMotionHandler 动作开始播放回调函数
   */
  public setBeganMotionHandler = (onBeganMotionHandler: BeganMotionCallback) =>
    (this._onBeganMotion = onBeganMotionHandler);

  /**
   * 获取动作开始播放回调
   *
   * 获取动作开始播放回调。
   *
   * @return 已注册的动作开始播放回调函数
   */
  public getBeganMotionHandler = () => this._onBeganMotion;

  /**
   * 注册动作结束播放回调
   *
   * 注册动作结束播放回调。
   * 在设置 isFinished 标志时调用。
   * 在以下情况下不会被调用：
   *   1. 播放中的动作被设置为「循环」时
   *   2. 未注册回调时
   *
   * @param onFinishedMotionHandler 动作结束播放回调函数
   */
  public setFinishedMotionHandler = (
    onFinishedMotionHandler: FinishedMotionCallback
  ) => (this._onFinishedMotion = onFinishedMotionHandler);

  /**
   * 获取动作结束播放回调
   *
   * 获取动作结束播放回调。
   *
   * @return 已注册的动作结束播放回调函数
   */
  public getFinishedMotionHandler = () => this._onFinishedMotion;

  /**
   * 检查是否存在透明度曲线
   *
   * @return true  -> 存在键
   *          false -> 不存在键
   */
  public isExistModelOpacity(): boolean {
    return false;
  }

  /**
   * 返回透明度曲线的索引
   *
   * @return success:透明度曲线的索引
   */
  public getModelOpacityIndex(): number {
    return -1;
  }

  /**
   * 返回透明度的 Id
   *
   * @param index 动作曲线的索引
   * @return success:透明度的 Id
   */
  public getModelOpacityId(index: number): CubismIdHandle {
    return null;
  }

  /**
   * 返回指定时间的透明度值
   *
   * @return success:动作当前时间的 Opacity 值
   *
   * @note  要获取更新后的值，请在 updateParameters() 之后调用。
   */
  protected getModelOpacityValue(): number {
    return 1.0;
  }

  /**
   * 调整结束时刻
   * @param motionQueueEntry CubismMotionQueueManager 中管理的动作
   */
  protected adjustEndTime(motionQueueEntry: CubismMotionQueueEntry) {
    const duration = this.getDuration();

    // duration == -1 时循环播放
    const endTime =
      duration <= 0.0 ? -1 : motionQueueEntry.getStartTime() + duration;

    motionQueueEntry.setEndTime(endTime);
  }

  public _fadeInSeconds: number; // 淡入时间[秒]
  public _fadeOutSeconds: number; // 淡出时间[秒]
  public _weight: number; // 动作权重
  public _offsetSeconds: number; // 动作播放开始时间[秒]
  public _isLoop: boolean; // 是否启用循环的标志
  public _isLoopFadeIn: boolean; // 循环时是否启用淡入的标志
  public _previousLoopState: boolean; // 上一次 _isLoop 的状态
  public _firedEventValues: Array<string>;

  // 动作开始播放回调函数
  public _onBeganMotion?: BeganMotionCallback;
  // 动作结束播放回调函数
  public _onFinishedMotion?: FinishedMotionCallback;
}

// 兼容性命名空间定义。
import * as $ from './acubismmotion';
import { CubismIdHandle } from '../id/cubismid';
import { LogLevel } from '../live2dcubismframework';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const ACubismMotion = $.ACubismMotion;
  export type ACubismMotion = $.ACubismMotion;
  export type BeganMotionCallback = $.BeganMotionCallback;
  export type FinishedMotionCallback = $.FinishedMotionCallback;
}
