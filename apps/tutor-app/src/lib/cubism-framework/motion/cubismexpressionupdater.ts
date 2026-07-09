// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { ICubismUpdater, CubismUpdateOrder } from './icubismupdater';
import { CubismModel } from '../model/cubismmodel';
import { CubismExpressionMotionManager } from './cubismexpressionmotionmanager';

/**
 * 表情效果的更新器。
 * 通过 CubismExpressionMotionManager 管理表情动作。
 */
export class CubismExpressionUpdater extends ICubismUpdater {
  private _expressionManager: CubismExpressionMotionManager;

  /**
   * 构造函数
   *
   * @param expressionManager CubismExpressionMotionManager 引用
   */
  constructor(expressionManager: CubismExpressionMotionManager);

  /**
   * 构造函数
   *
   * @param expressionManager CubismExpressionMotionManager 引用
   * @param executionOrder 执行顺序
   */
  constructor(
    expressionManager: CubismExpressionMotionManager,
    executionOrder: number
  );

  constructor(
    expressionManager: CubismExpressionMotionManager,
    executionOrder?: number
  ) {
    super(executionOrder ?? CubismUpdateOrder.CubismUpdateOrder_Expression);
    this._expressionManager = expressionManager;
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

    this._expressionManager.updateMotion(model, deltaTimeSeconds);
  }
}

// 兼容性命名空间定义。
import * as $ from './cubismexpressionupdater';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismExpressionUpdater = $.CubismExpressionUpdater;
  export type CubismExpressionUpdater = $.CubismExpressionUpdater;
}
