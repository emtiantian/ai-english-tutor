// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { ICubismUpdater, CubismUpdateOrder } from './icubismupdater';
import { CubismModel } from '../model/cubismmodel';
import { CubismPhysics } from '../physics/cubismphysics';

/**
 * 物理效果的更新器。
 * 通过 CubismPhysics 类管理物理模拟。
 */
export class CubismPhysicsUpdater extends ICubismUpdater {
  private _physics: CubismPhysics;

  /**
   * 构造函数
   *
   * @param physics CubismPhysics 引用
   */
  constructor(physics: CubismPhysics);

  /**
   * 构造函数
   *
   * @param physics CubismPhysics 引用
   * @param executionOrder 执行顺序
   */
  constructor(physics: CubismPhysics, executionOrder: number);

  constructor(physics: CubismPhysics, executionOrder?: number) {
    super(executionOrder ?? CubismUpdateOrder.CubismUpdateOrder_Physics);
    this._physics = physics;
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

    this._physics.evaluate(model, deltaTimeSeconds);
  }
}

// 兼容性命名空间定义。
import * as $ from './cubismphysicsupdater';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismPhysicsUpdater = $.CubismPhysicsUpdater;
  export type CubismPhysicsUpdater = $.CubismPhysicsUpdater;
}
