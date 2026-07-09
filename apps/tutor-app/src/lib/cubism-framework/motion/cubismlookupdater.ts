// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { ICubismUpdater, CubismUpdateOrder } from './icubismupdater';
import { CubismModel } from '../model/cubismmodel';
import { CubismTargetPoint } from '../math/cubismtargetpoint';
import { CubismLook } from '../effect/cubismlook';

/**
 * 视线跟随效果的更新器。
 * 通过 MotionQueueManager 管理拖拽动作。
 */
export class CubismLookUpdater extends ICubismUpdater {
  private _look: CubismLook;
  private _dragManager: CubismTargetPoint;

  /**
   * 构造函数
   *
   * @param look CubismLook 引用
   * @param dragManager CubismTargetPoint 引用
   */
  constructor(look: CubismLook, dragManager: CubismTargetPoint);

  /**
   * 构造函数
   *
   * @param look CubismLook 引用
   * @param dragManager CubismTargetPoint 引用
   * @param executionOrder 执行顺序
   */
  constructor(
    look: CubismLook,
    dragManager: CubismTargetPoint,
    executionOrder: number
  );

  constructor(
    look: CubismLook,
    dragManager: CubismTargetPoint,
    executionOrder?: number
  ) {
    super(executionOrder ?? CubismUpdateOrder.CubismUpdateOrder_Drag);
    this._look = look;
    this._dragManager = dragManager;
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

    this._dragManager.update(deltaTimeSeconds);
    const dragX = this._dragManager.getX();
    const dragY = this._dragManager.getY();

    this._look.updateParameters(model, dragX, dragY);
  }
}

// 兼容性命名空间定义。
import * as $ from './cubismlookupdater';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismLookUpdater = $.CubismLookUpdater;
  export type CubismLookUpdater = $.CubismLookUpdater;
}
