// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { ICubismUpdater, CubismUpdateOrder } from './icubismupdater';
import { CubismModel } from '../model/cubismmodel';
import { CubismBreath } from '../effect/cubismbreath';

/**
 * 呼吸效果的更新器。
 * 通过 CubismBreath 类管理呼吸动画。
 */
export class CubismBreathUpdater extends ICubismUpdater {
  private _breath: CubismBreath;

  /**
   * 构造函数
   *
   * @param breath CubismBreath 引用
   */
  constructor(breath: CubismBreath);

  /**
   * 构造函数
   *
   * @param breath CubismBreath 引用
   * @param executionOrder 执行顺序
   */
  constructor(breath: CubismBreath, executionOrder: number);

  constructor(breath: CubismBreath, executionOrder?: number) {
    super(executionOrder ?? CubismUpdateOrder.CubismUpdateOrder_Breath);
    this._breath = breath;
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

    this._breath.updateParameters(model, deltaTimeSeconds);
  }
}

// 兼容性命名空间定义。
import * as $ from './cubismbreathupdater';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismBreathUpdater = $.CubismBreathUpdater;
  export type CubismBreathUpdater = $.CubismBreathUpdater;
}
