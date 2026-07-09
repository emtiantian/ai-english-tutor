// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { ACubismMotion } from './acubismmotion';
import { CubismMotionQueueEntry } from './cubismmotionqueueentry';
import { CubismModel } from '../model/cubismmodel';

/**
 * 动作播放管理
 *
 * 动作播放管理类。用于播放 CubismMotion 等 ACubismMotion 子类。
 *
 * @note 播放中如果另一个动作调用了 startMotion()，则会平滑过渡到新动作并中断旧动作。
 *       如果要同时播放表情动作、身体动作等分离后的多个动作，
 *       请使用多个 CubismMotionQueueManager 实例。
 */
export class CubismMotionQueueManager {
  /**
   * 构造函数
   */
  public constructor() {
    this._userTimeSeconds = 0.0;
    this._eventCallBack = null;
    this._eventCustomData = null;
    this._motions = new Array<CubismMotionQueueEntry>();
  }

  /**
   * 析构函数
   */
  public release(): void {
    for (let i = 0; i < this._motions.length; ++i) {
      if (this._motions[i]) {
        this._motions[i].release();
        this._motions[i] = null;
      }
    }

    this._motions = null;
  }

  /**
   * 开始指定动作
   *
   * 开始指定动作。如果同类型动作已存在，则对已有动作设置结束标志并开始淡出。
   *
   * @param   motion          要开始的动作
   * @param   autoDelete      播放结束后是否删除动作实例，true 为删除
   * @param   userTimeSeconds 已废弃：累计增量时间[秒]，函数内部未引用，不建议使用。
   * @return                      返回已开始动作的识别编号。用于判断单个动作是否结束的 IsFinished() 参数。无法开始时返回「-1」
   */
  public startMotion(
    motion: ACubismMotion,
    autoDelete: boolean,
    userTimeSeconds?: number
  ): CubismMotionQueueEntryHandle {
    if (motion == null) {
      return InvalidMotionQueueEntryHandleValue;
    }

    let motionQueueEntry: CubismMotionQueueEntry = null;

    // 如果已有动作则设置结束标志
    for (let i = 0; i < this._motions.length; ++i) {
      motionQueueEntry = this._motions[i];
      if (motionQueueEntry == null) {
        continue;
      }

      motionQueueEntry.setFadeOut(motionQueueEntry._motion.getFadeOutTime()); // 淡出设置
    }

    motionQueueEntry = new CubismMotionQueueEntry(); // 播放结束时销毁
    motionQueueEntry._autoDelete = autoDelete;
    motionQueueEntry._motion = motion;

    this._motions.push(motionQueueEntry);

    return motionQueueEntry._motionQueueEntryHandle;
  }

  /**
   * 确认所有动作是否结束
   * @return true 全部结束
   * @return false 未结束
   */
  public isFinished(): boolean {
    // ------- 执行处理 -------
    // 如果已有动作则设置结束标志

    for (let i = 0; i < this._motions.length; ) {
      let motionQueueEntry: CubismMotionQueueEntry = this._motions[i];

      if (motionQueueEntry == null) {
        this._motions.splice(i, 1); // 删除
        continue;
      }

      const motion: ACubismMotion = motionQueueEntry._motion;

      if (motion == null) {
        motionQueueEntry.release();
        motionQueueEntry = null;
        this._motions.splice(i, 1); // 删除
        continue;
      }

      // ----- 如果有已结束的处理则删除 ------
      if (!motionQueueEntry.isFinished()) {
        return false;
      } else {
        i++;
      }
    }

    return true;
  }

  /**
   * 确认指定动作是否结束
   * @param motionQueueEntryNumber 动作识别编号
   * @return true 全部结束
   * @return false 未结束
   */
  public isFinishedByHandle(
    motionQueueEntryNumber: CubismMotionQueueEntryHandle
  ): boolean {
    for (let i = 0; i < this._motions.length; i++) {
      const motionQueueEntry: CubismMotionQueueEntry = this._motions[i];

      if (motionQueueEntry == null) {
        continue;
      }

      if (
        motionQueueEntry._motionQueueEntryHandle == motionQueueEntryNumber &&
        !motionQueueEntry.isFinished()
      ) {
        return false;
      }
    }
    return true;
  }

  /**
   * 停止所有动作
   */
  public stopAllMotions(): void {
    // ------- 执行处理 -------
    // 如果已有动作则设置结束标志

    for (let i = 0; i < this._motions.length; i++) {
      const motionQueueEntry: CubismMotionQueueEntry = this._motions[i];

      if (motionQueueEntry == null) {
        this._motions.splice(i, 1); // 删除

        continue;
      }

      // ----- 如果有已结束的处理则删除 ------
      motionQueueEntry.release();
      this._motions.splice(i, 1); // 删除
      continue;
    }
  }

  /**
   * @brief 获取 CubismMotionQueueEntry 数组
   *
   * 获取 CubismMotionQueueEntry 数组。
   *
   * @return  CubismMotionQueueEntry 数组指针
   *          NULL   未找到
   */
  public getCubismMotionQueueEntries(): Array<CubismMotionQueueEntry> {
    return this._motions;
  }

  /**
   * 获取指定的 CubismMotionQueueEntry

   * @param   motionQueueEntryNumber  动作识别编号
   * @return  指定的 CubismMotionQueueEntry
   * @return  null   未找到
   */
  public getCubismMotionQueueEntry(
    motionQueueEntryNumber: any
  ): CubismMotionQueueEntry {
    //------- 执行处理 -------

    for (let i = 0; i < this._motions.length; i++) {
      const motionQueueEntry: CubismMotionQueueEntry = this._motions[i];

      if (motionQueueEntry == null) {
        continue;
      }

      if (motionQueueEntry._motionQueueEntryHandle == motionQueueEntryNumber) {
        return motionQueueEntry;
      }
    }

    return null;
  }

  /**
   * 注册接收事件的回调
   *
   * @param callback 回调函数
   * @param customData 回调返回的数据
   */
  public setEventCallback(
    callback: CubismMotionEventFunction,
    customData: any = null
  ): void {
    this._eventCallBack = callback;
    this._eventCustomData = customData;
  }

  /**
   * 更新动作并将参数值反映到模型。
   *
   * @param   model   目标模型
   * @param   userTimeSeconds   累计增量时间[秒]
   * @return  true    有参数值反映到模型
   * @return  false   没有参数值反映到模型（动作无变化）
   */
  public doUpdateMotion(model: CubismModel, userTimeSeconds: number): boolean {
    let updated = false;

    // ------- 执行处理 --------
    // 如果已有动作则设置结束标志

    for (let i = 0; i < this._motions.length; ) {
      let motionQueueEntry: CubismMotionQueueEntry = this._motions[i];

      if (motionQueueEntry == null) {
        this._motions.splice(i, 1); // 删除
        continue;
      }

      const motion: ACubismMotion = motionQueueEntry._motion;

      if (motion == null) {
        motionQueueEntry.release();
        motionQueueEntry = null;
        this._motions.splice(i, 1); // 删除
        continue;
      }

      // ------ 反映值 ------
      motion.updateParameters(model, motionQueueEntry, userTimeSeconds);
      updated = true;

      // ------ 检查用户触发事件 ----
      const firedList: Array<string> = motion.getFiredEvent(
        motionQueueEntry.getLastCheckEventSeconds() -
          motionQueueEntry.getStartTime(),
        userTimeSeconds - motionQueueEntry.getStartTime()
      );

      for (let i = 0; i < firedList.length; ++i) {
        this._eventCallBack(this, firedList[i], this._eventCustomData);
      }

      motionQueueEntry.setLastCheckEventSeconds(userTimeSeconds);

      // ------ 如果有已结束的处理则删除 ------
      if (motionQueueEntry.isFinished()) {
        motionQueueEntry.release();
        motionQueueEntry = null;
        this._motions.splice(i, 1); // 删除
      } else {
        if (motionQueueEntry.isTriggeredFadeOut()) {
          motionQueueEntry.startFadeOut(
            motionQueueEntry.getFadeOutSeconds(),
            userTimeSeconds
          );
        }
        i++;
      }
    }

    return updated;
  }
  _userTimeSeconds: number; // 累计增量时间[秒]

  _motions: Array<CubismMotionQueueEntry>; // 动作
  _eventCallBack: CubismMotionEventFunction; // 回调函数
  _eventCustomData: any; // 回调返回的数据
}

/**
 * 事件回调函数定义
 *
 * 可注册到事件回调的函数类型信息
 * @param caller        触发事件的 CubismMotionQueueManager
 * @param eventValue    触发事件的字符串数据
 * @param customData   注册时指定并返回给回调的数据
 */
export interface CubismMotionEventFunction {
  (caller: CubismMotionQueueManager, eventValue: string, customData: any): void;
}

/**
 * 动作识别编号
 *
 * 动作识别编号定义
 */
export declare type CubismMotionQueueEntryHandle = any;
export const InvalidMotionQueueEntryHandleValue: CubismMotionQueueEntryHandle =
  -1;

// 兼容性命名空间定义。
import * as $ from './cubismmotionqueuemanager';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismMotionQueueManager = $.CubismMotionQueueManager;
  export type CubismMotionQueueManager = $.CubismMotionQueueManager;
  export const InvalidMotionQueueEntryHandleValue =
    $.InvalidMotionQueueEntryHandleValue;
  export type CubismMotionQueueEntryHandle = $.CubismMotionQueueEntryHandle;
  export type CubismMotionEventFunction = $.CubismMotionEventFunction;
}
