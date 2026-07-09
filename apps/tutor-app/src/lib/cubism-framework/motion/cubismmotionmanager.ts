// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismModel } from '../model/cubismmodel';
import { ACubismMotion } from './acubismmotion';
import {
  CubismMotionQueueEntryHandle,
  CubismMotionQueueManager
} from './cubismmotionqueuemanager';

/**
 * 动作管理
 *
 * 管理动作的类
 */
export class CubismMotionManager extends CubismMotionQueueManager {
  /**
   * 构造函数
   */
  public constructor() {
    super();
    this._currentPriority = 0;
    this._reservePriority = 0;
  }

  /**
   * 获取播放中动作的优先级
   * @return  动作优先级
   */
  public getCurrentPriority(): number {
    return this._currentPriority;
  }

  /**
   * 获取预约中动作的优先级。
   * @return  动作优先级
   */
  public getReservePriority(): number {
    return this._reservePriority;
  }

  /**
   * 设置预约中动作的优先级。
   * @param   val     优先级
   */
  public setReservePriority(val: number): void {
    this._reservePriority = val;
  }

  /**
   * 设置优先级并开始动作。
   *
   * @param motion          动作
   * @param autoDelete      播放结束后是否删除动作实例，true 为删除
   * @param priority        优先级
   * @return                返回已开始动作的识别编号。用于判断单个动作是否结束的 IsFinished() 参数。无法开始时返回「-1」
   */
  public startMotionPriority(
    motion: ACubismMotion,
    autoDelete: boolean,
    priority: number
  ): CubismMotionQueueEntryHandle {
    if (priority == this._reservePriority) {
      this._reservePriority = 0; // 解除预约
    }

    this._currentPriority = priority; // 设置播放中动作的优先级

    return super.startMotion(motion, autoDelete);
  }

  /**
   * 更新动作并将参数值反映到模型。
   *
   * @param model   目标模型
   * @param deltaTimeSeconds    增量时间[秒]
   * @return  true    已更新
   * @return  false   未更新
   */
  public updateMotion(model: CubismModel, deltaTimeSeconds: number): boolean {
    this._userTimeSeconds += deltaTimeSeconds;

    const updated: boolean = super.doUpdateMotion(model, this._userTimeSeconds);

    if (this.isFinished()) {
      this._currentPriority = 0; // 解除播放中动作的优先级
    }

    return updated;
  }

  /**
   * 预约动作。
   *
   * @param   priority    优先级
   * @return  true    预约成功
   * @return  false   预约失败
   */
  public reserveMotion(priority: number): boolean {
    if (
      priority <= this._reservePriority ||
      priority <= this._currentPriority
    ) {
      return false;
    }

    this._reservePriority = priority;

    return true;
  }

  _currentPriority: number; // 当前播放中动作的优先级
  _reservePriority: number; // 待播放动作的优先级。播放中为 0。用于在另一个线程读取动作文件的功能。
}

// 兼容性命名空间定义。
import * as $ from './cubismmotionmanager';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismMotionManager = $.CubismMotionManager;
  export type CubismMotionManager = $.CubismMotionManager;
}
