// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismId, CubismIdHandle } from '../id/cubismid';
import { LogLevel, csmDelete } from '../live2dcubismframework';
import { CubismModel } from '../model/cubismmodel';
import { CubismExpressionMotion } from './cubismexpressionmotion';
import { CubismMotionQueueEntry } from './cubismmotionqueueentry';
import { CubismMotionQueueManager } from './cubismmotionqueuemanager';

/**
 * @brief 保存要应用到参数的表情值的结构体
 */
export class ExpressionParameterValue {
  parameterId: CubismIdHandle; // 参数 ID
  additiveValue: number; // 加数值
  multiplyValue: number; // 乘数值
  overwriteValue: number; // 覆盖值
}

/**
 * @brief 表情动作管理
 *
 * 进行表情动作管理的类。
 */
export class CubismExpressionMotionManager extends CubismMotionQueueManager {
  /**
   * 构造函数
   */
  public constructor() {
    super();
    this._expressionParameterValues = new Array<ExpressionParameterValue>();
    this._fadeWeights = new Array<number>();
  }

  /**
   * 析构等效处理
   */
  public release(): void {
    if (this._expressionParameterValues) {
      csmDelete(this._expressionParameterValues);
      this._expressionParameterValues = null;
    }

    if (this._fadeWeights) {
      csmDelete(this._fadeWeights);
      this._fadeWeights = null;
    }
  }

  /**
   * @brief 获取播放中动作的权重。
   *
   * @param[in]    index    表情索引
   * @return               表情动作的权重
   */
  public getFadeWeight(index: number): number {
    if (
      index < 0 ||
      this._fadeWeights.length < 1 ||
      index >= this._fadeWeights.length
    ) {
      console.warn(
        'Failed to get the fade weight value. The element at that index does not exist.'
      );
      return -1;
    }

    return this._fadeWeights[index];
  }

  /**
   * @brief 设置动作权重。
   *
   * @param[in]    index    表情索引
   * @param[in]    index    表情动作的权重
   */
  public setFadeWeight(index: number, expressionFadeWeight: number): void {
    if (
      index < 0 ||
      this._fadeWeights.length < 1 ||
      this._fadeWeights.length <= index
    ) {
      console.warn(
        'Failed to set the fade weight value. The element at that index does not exist.'
      );
      return;
    }

    this._fadeWeights[index] = expressionFadeWeight;
  }

  /**
   * @brief 动作更新
   *
   * 更新动作并将参数值反映到模型。
   *
   * @param[in]   model   目标模型
   * @param[in]   deltaTimeSeconds    增量时间[秒]
   * @return  true    已更新
   *          false   未更新
   */
  public updateMotion(model: CubismModel, deltaTimeSeconds: number): boolean {
    this._userTimeSeconds += deltaTimeSeconds;
    let updated = false;
    const motions = this.getCubismMotionQueueEntries();

    let expressionWeight = 0.0;
    let expressionIndex = 0;

    if (this._fadeWeights.length !== motions.length) {
      const difference = motions.length - this._fadeWeights.length;
      let dstIndex: number = this._fadeWeights.length;
      this._fadeWeights.length += difference;

      // TODO: 也可以用 Array.fill 将新增元素初始化为 0
      // https://developer.mozilla.org/ja/docs/Web/JavaScript/Reference/Global_Objects/Array/fill
      // this._fadeWeights.fill(0.0, dstIndex, this._fadeWeights.length)

      for (let i = 0; i < difference; i++) {
        this._fadeWeights[dstIndex++] = 0.0;
      }
    }

    // ------- 执行处理 --------
    // 如果已有动作则设置结束标志
    for (let i = 0; i < this._motions.length; ) {
      const motionQueueEntry = this._motions[i];

      if (motionQueueEntry == null) {
        motions.splice(i, 1); // 删除
        continue;
      }

      const expressionMotion = <CubismExpressionMotion>(
        motionQueueEntry.getCubismMotion()
      );

      if (expressionMotion == null) {
        csmDelete(motionQueueEntry);
        motions.splice(i, 1); // 删除
        continue;
      }

      const expressionParameters = expressionMotion.getExpressionParameters();

      if (motionQueueEntry.isAvailable()) {
        // 列出播放中 Expression 引用的所有参数
        for (let i = 0; i < expressionParameters.length; ++i) {
          if (expressionParameters[i].parameterId == null) {
            continue;
          }

          let index = -1;
          // 搜索列表中是否存在参数 ID
          for (let j = 0; j < this._expressionParameterValues.length; ++j) {
            if (
              this._expressionParameterValues[j].parameterId !=
              expressionParameters[i].parameterId
            ) {
              continue;
            }

            index = j;
            break;
          }

          if (index >= 0) {
            continue;
          }

          // 如果参数不在列表中则新增
          const item: ExpressionParameterValue = new ExpressionParameterValue();
          item.parameterId = expressionParameters[i].parameterId;
          item.additiveValue = CubismExpressionMotion.DefaultAdditiveValue;
          item.multiplyValue = CubismExpressionMotion.DefaultMultiplyValue;
          item.overwriteValue = model.getParameterValueById(item.parameterId);
          this._expressionParameterValues.push(item);
        }
      }

      // ------ 计算值 ------
      expressionMotion.setupMotionQueueEntry(
        motionQueueEntry,
        this._userTimeSeconds
      );
      this.setFadeWeight(
        expressionIndex,
        expressionMotion.updateFadeWeight(
          motionQueueEntry,
          this._userTimeSeconds
        )
      );
      expressionMotion.calculateExpressionParameters(
        model,
        this._userTimeSeconds,
        motionQueueEntry,
        this._expressionParameterValues,
        expressionIndex,
        this.getFadeWeight(expressionIndex)
      );

      expressionWeight +=
        expressionMotion.getFadeInTime() == 0.0
          ? 1.0
          : CubismMath.getEasingSine(
              (this._userTimeSeconds - motionQueueEntry.getFadeInStartTime()) /
                expressionMotion.getFadeInTime()
            );

      updated = true;

      if (motionQueueEntry.isTriggeredFadeOut()) {
        // 开始淡出
        motionQueueEntry.startFadeOut(
          motionQueueEntry.getFadeOutSeconds(),
          this._userTimeSeconds
        );
      }

      ++i;
      ++expressionIndex;
    }

    // ----- 如果最新 Expression 的淡入已完成，则删除之前的 ------
    if (motions.length > 1) {
      const latestFadeWeight: number = this.getFadeWeight(
        this._fadeWeights.length - 1
      );
      if (latestFadeWeight >= 1.0) {
        // 不删除数组的最后一个元素
        for (let i = motions.length - 2; i >= 0; --i) {
          const motionQueueEntry = motions[i];
          csmDelete(motionQueueEntry);
          motions.splice(i, 1);
          this._fadeWeights.splice(i, 1);
        }
      }
    }

    if (expressionWeight > 1.0) {
      expressionWeight = 1.0;
    }

    // 将各值应用到模型
    for (let i = 0; i < this._expressionParameterValues.length; ++i) {
      const expressionParameterValue = this._expressionParameterValues[i];
      model.setParameterValueById(
        expressionParameterValue.parameterId,
        (expressionParameterValue.overwriteValue +
          expressionParameterValue.additiveValue) *
          expressionParameterValue.multiplyValue,
        expressionWeight
      );

      expressionParameterValue.additiveValue =
        CubismExpressionMotion.DefaultAdditiveValue;
      expressionParameterValue.multiplyValue =
        CubismExpressionMotion.DefaultMultiplyValue;
    }

    return updated;
  }

  private _expressionParameterValues: Array<ExpressionParameterValue>; ///< 要应用到模型的各参数值
  private _fadeWeights: Array<number>; ///< 播放中表情的权重
  private _startExpressionTime: number; ///< 表情播放开始时刻
}

// 兼容性命名空间定义。
import * as $ from './cubismexpressionmotionmanager';
import { CubismMath } from '../math/cubismmath';
import { CubismDebug, CubismLogError } from '../utils/cubismdebug';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismExpressionMotionManager = $.CubismExpressionMotionManager;
  export type CubismExpressionMotionManager = $.CubismExpressionMotionManager;
}
