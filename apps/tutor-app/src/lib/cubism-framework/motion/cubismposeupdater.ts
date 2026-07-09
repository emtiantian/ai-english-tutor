// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { ICubismUpdater, CubismUpdateOrder } from './icubismupdater';
import { CubismModel } from '../model/cubismmodel';
import { CubismPose } from '../effect/cubismpose';

/**
 * 姿态效果的更新器。
 * 通过 CubismPose 类管理姿态动画。
 */
export class CubismPoseUpdater extends ICubismUpdater {
  private _pose: CubismPose;

  /**
   * 构造函数
   *
   * @param pose CubismPose 引用
   */
  constructor(pose: CubismPose);

  /**
   * 构造函数
   *
   * @param pose CubismPose 引用
   * @param executionOrder 执行顺序
   */
  constructor(pose: CubismPose, executionOrder: number);

  constructor(pose: CubismPose, executionOrder?: number) {
    super(executionOrder ?? CubismUpdateOrder.CubismUpdateOrder_Pose);
    this._pose = pose;
  }

  /**
   * 更新处理。
   *
   * @param model 要更新的模型
   * @param deltaTimeSeconds 增量时间（秒）。
   */
  onLateUpdate(model: CubismModel, deltaTimeSeconds: number): void {
    if (!model) {
      return;
    }

    this._pose.updateParameters(model, deltaTimeSeconds);
  }
}

// 兼容性命名空间定义。
import * as $ from './cubismposeupdater';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismPoseUpdater = $.CubismPoseUpdater;
  export type CubismPoseUpdater = $.CubismPoseUpdater;
}
