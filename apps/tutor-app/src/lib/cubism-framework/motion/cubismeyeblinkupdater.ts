// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { ICubismUpdater, CubismUpdateOrder } from './icubismupdater';
import { CubismModel } from '../model/cubismmodel';
import { CubismEyeBlink } from '../effect/cubismeyeblink';

/**
 * 眨眼效果的更新器。
 * 通过 CubismEyeBlink 类管理眨眼动画。
 */
export class CubismEyeBlinkUpdater extends ICubismUpdater {
  private _motionUpdated: () => boolean;
  private _eyeBlink: CubismEyeBlink;

  /**
   * 构造函数
   *
   * @param motionUpdated 动作更新标志引用
   * @param eyeBlink CubismEyeBlink 引用
   */
  constructor(motionUpdated: () => boolean, eyeBlink: CubismEyeBlink);

  /**
   * 构造函数
   *
   * @param motionUpdated 动作更新标志引用
   * @param eyeBlink CubismEyeBlink 引用
   * @param executionOrder 执行顺序
   */
  constructor(
    motionUpdated: () => boolean,
    eyeBlink: CubismEyeBlink,
    executionOrder: number
  );

  constructor(
    motionUpdated: () => boolean,
    eyeBlink: CubismEyeBlink,
    executionOrder?: number
  ) {
    super(executionOrder ?? CubismUpdateOrder.CubismUpdateOrder_EyeBlink);
    this._motionUpdated = motionUpdated;
    this._eyeBlink = eyeBlink;
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

    if (!this._motionUpdated()) {
      // 没有主动作更新时
      // 眨眼
      this._eyeBlink.updateParameters(model, deltaTimeSeconds);
    }
  }
}

// 兼容性命名空间定义。
import * as $ from './cubismeyeblinkupdater';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismEyeBlinkUpdater = $.CubismEyeBlinkUpdater;
  export type CubismEyeBlinkUpdater = $.CubismEyeBlinkUpdater;
}
