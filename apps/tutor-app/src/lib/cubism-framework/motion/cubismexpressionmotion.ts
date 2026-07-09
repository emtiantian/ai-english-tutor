// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismIdHandle } from '../id/cubismid';
import { CubismFramework } from '../live2dcubismframework';
import { CubismModel } from '../model/cubismmodel';
import { CubismJson, Value } from '../utils/cubismjson';
import { ACubismMotion } from './acubismmotion';
import { CubismMotionQueueEntry } from './cubismmotionqueueentry';

// exp3.json 的键与默认值
const ExpressionKeyFadeIn = 'FadeInTime';
const ExpressionKeyFadeOut = 'FadeOutTime';
const ExpressionKeyParameters = 'Parameters';
const ExpressionKeyId = 'Id';
const ExpressionKeyValue = 'Value';
const ExpressionKeyBlend = 'Blend';
const BlendValueAdd = 'Add';
const BlendValueMultiply = 'Multiply';
const BlendValueOverwrite = 'Overwrite';
const DefaultFadeTime = 1.0;

/**
 * 表情动作
 *
 * 表情动作类。
 */
export class CubismExpressionMotion extends ACubismMotion {
  static readonly DefaultAdditiveValue = 0.0; // 加法应用的初始值
  static readonly DefaultMultiplyValue = 1.0; // 乘法应用的初始值

  /**
   * 创建实例。
   * @param buffer 已加载 exp 文件的缓冲区
   * @param size 缓冲区大小
   * @return 创建的实例
   */
  public static create(
    buffer: ArrayBuffer,
    size: number
  ): CubismExpressionMotion {
    const expression: CubismExpressionMotion = new CubismExpressionMotion();
    expression.parse(buffer, size);
    return expression;
  }

  /**
   * 执行模型参数更新
   * @param model 目标模型
   * @param userTimeSeconds 累计增量时间[秒]
   * @param weight 动作权重
   * @param motionQueueEntry CubismMotionQueueManager 中管理的动作
   */
  public doUpdateParameters(
    model: CubismModel,
    userTimeSeconds: number,
    weight: number,
    motionQueueEntry: CubismMotionQueueEntry
  ): void {
    for (let i = 0; i < this._parameters.length; ++i) {
      const parameter: ExpressionParameter = this._parameters[i];

      switch (parameter.blendType) {
        case ExpressionBlendType.Additive: {
          model.addParameterValueById(
            parameter.parameterId,
            parameter.value,
            weight
          );
          break;
        }
        case ExpressionBlendType.Multiply: {
          model.multiplyParameterValueById(
            parameter.parameterId,
            parameter.value,
            weight
          );
          break;
        }
        case ExpressionBlendType.Overwrite: {
          model.setParameterValueById(
            parameter.parameterId,
            parameter.value,
            weight
          );
          break;
        }
        default:
          // 设置为规格外的值时已经处于加法模式
          break;
      }
    }
  }

  /**
   * @brief 计算表情影响的模型参数
   *
   * 计算模型表情相关参数。
   *
   * @param[in]   model                        目标模型
   * @param[in]   userTimeSeconds              累计增量时间[秒]
   * @param[in]   motionQueueEntry             CubismMotionQueueManager 中管理的动作
   * @param[in]   expressionParameterValues    要应用到模型的各参数值
   * @param[in]   expressionIndex              表情索引
   * @param[in]   fadeWeight                   表情权重
   */
  public calculateExpressionParameters(
    model: CubismModel,
    userTimeSeconds: number,
    motionQueueEntry: CubismMotionQueueEntry,
    expressionParameterValues: Array<ExpressionParameterValue>,
    expressionIndex: number,
    fadeWeight: number
  ) {
    if (motionQueueEntry == null || expressionParameterValues == null) {
      return;
    }

    if (!motionQueueEntry.isAvailable()) {
      return;
    }

    // 计算要应用到模型的值
    for (let i = 0; i < expressionParameterValues.length; ++i) {
      const expressionParameterValue = expressionParameterValues[i];

      if (expressionParameterValue.parameterId == null) {
        continue;
      }

      const currentParameterValue = (expressionParameterValue.overwriteValue =
        model.getParameterValueById(expressionParameterValue.parameterId));

      const expressionParameters = this.getExpressionParameters();
      let parameterIndex = -1;
      for (let j = 0; j < expressionParameters.length; ++j) {
        if (
          expressionParameterValue.parameterId !=
          expressionParameters[j].parameterId
        ) {
          continue;
        }

        parameterIndex = j;

        break;
      }

      // 对播放中 Expression 未引用的参数应用初始值
      if (parameterIndex < 0) {
        if (expressionIndex == 0) {
          expressionParameterValue.additiveValue =
            CubismExpressionMotion.DefaultAdditiveValue;
          expressionParameterValue.multiplyValue =
            CubismExpressionMotion.DefaultMultiplyValue;
          expressionParameterValue.overwriteValue = currentParameterValue;
        } else {
          expressionParameterValue.additiveValue = this.calculateValue(
            expressionParameterValue.additiveValue,
            CubismExpressionMotion.DefaultAdditiveValue,
            fadeWeight
          );
          expressionParameterValue.multiplyValue = this.calculateValue(
            expressionParameterValue.multiplyValue,
            CubismExpressionMotion.DefaultMultiplyValue,
            fadeWeight
          );
          expressionParameterValue.overwriteValue = this.calculateValue(
            expressionParameterValue.overwriteValue,
            currentParameterValue,
            fadeWeight
          );
        }
        continue;
      }

      // 计算值
      const value = expressionParameters[parameterIndex].value;
      let newAdditiveValue, newMultiplyValue, newOverwriteValue;
      switch (expressionParameters[parameterIndex].blendType) {
        case ExpressionBlendType.Additive:
          newAdditiveValue = value;
          newMultiplyValue = CubismExpressionMotion.DefaultMultiplyValue;
          newOverwriteValue = currentParameterValue;
          break;

        case ExpressionBlendType.Multiply:
          newAdditiveValue = CubismExpressionMotion.DefaultAdditiveValue;
          newMultiplyValue = value;
          newOverwriteValue = currentParameterValue;
          break;

        case ExpressionBlendType.Overwrite:
          newAdditiveValue = CubismExpressionMotion.DefaultAdditiveValue;
          newMultiplyValue = CubismExpressionMotion.DefaultMultiplyValue;
          newOverwriteValue = value;
          break;

        default:
          return;
      }

      if (expressionIndex == 0) {
        expressionParameterValue.additiveValue = newAdditiveValue;
        expressionParameterValue.multiplyValue = newMultiplyValue;
        expressionParameterValue.overwriteValue = newOverwriteValue;
      } else {
        expressionParameterValue.additiveValue =
          expressionParameterValue.additiveValue * (1.0 - fadeWeight) +
          newAdditiveValue * fadeWeight;
        expressionParameterValue.multiplyValue =
          expressionParameterValue.multiplyValue * (1.0 - fadeWeight) +
          newMultiplyValue * fadeWeight;
        expressionParameterValue.overwriteValue =
          expressionParameterValue.overwriteValue * (1.0 - fadeWeight) +
          newOverwriteValue * fadeWeight;
      }
    }
  }

  /**
   * @brief 获取表情引用的参数
   *
   * 获取表情引用的参数。
   *
   * @return 表情参数
   */
  public getExpressionParameters() {
    return this._parameters;
  }

  protected parse(buffer: ArrayBuffer, size: number) {
    const json: CubismJson = CubismJson.create(buffer, size);
    if (!json) {
      return;
    }

    const root: Value = json.getRoot();

    this.setFadeInTime(
      root.getValueByString(ExpressionKeyFadeIn).toFloat(DefaultFadeTime)
    ); // 淡入
    this.setFadeOutTime(
      root.getValueByString(ExpressionKeyFadeOut).toFloat(DefaultFadeTime)
    ); // 淡出

    // 各参数
    const parameterCount = root
      .getValueByString(ExpressionKeyParameters)
      .getSize();

    let dstIndex: number = this._parameters.length;
    this._parameters.length += parameterCount;
    for (let i = 0; i < parameterCount; ++i) {
      const param: Value = root
        .getValueByString(ExpressionKeyParameters)
        .getValueByIndex(i);
      const parameterId: CubismIdHandle = CubismFramework.getIdManager().getId(
        param.getValueByString(ExpressionKeyId).getRawString()
      ); // 参数 ID

      const value: number = param
        .getValueByString(ExpressionKeyValue)
        .toFloat(); // 值

      // 设置计算方式
      let blendType: ExpressionBlendType;

      if (
        param.getValueByString(ExpressionKeyBlend).isNull() ||
        param.getValueByString(ExpressionKeyBlend).getString() == BlendValueAdd
      ) {
        blendType = ExpressionBlendType.Additive;
      } else if (
        param.getValueByString(ExpressionKeyBlend).getString() ==
        BlendValueMultiply
      ) {
        blendType = ExpressionBlendType.Multiply;
      } else if (
        param.getValueByString(ExpressionKeyBlend).getString() ==
        BlendValueOverwrite
      ) {
        blendType = ExpressionBlendType.Overwrite;
      } else {
        // 其他设置为规格外的值时，恢复为加法模式
        blendType = ExpressionBlendType.Additive;
      }

      // 创建设置对象并添加到列表
      const item: ExpressionParameter = new ExpressionParameter();

      item.parameterId = parameterId;
      item.blendType = blendType;
      item.value = value;

      this._parameters[dstIndex++] = item;
    }

    CubismJson.delete(json); // JSON 数据不再需要时删除
  }

  /**
   * @brief 混合计算
   *
   * 根据输入值进行混合计算。
   *
   * @param source 当前值
   * @param destination 要应用的值
   * @param weight 权重
   * @return 计算结果
   */
  public calculateValue(
    source: number,
    destination: number,
    fadeWeight: number
  ): number {
    return source * (1.0 - fadeWeight) + destination * fadeWeight;
  }

  /**
   * 构造函数
   */
  protected constructor() {
    super();
    this._parameters = new Array<ExpressionParameter>();
  }

  private _parameters: Array<ExpressionParameter>; // 表情参数信息列表
}

/**
 * 表情参数值的计算方式
 */
export enum ExpressionBlendType {
  Additive = 0, // 加法
  Multiply = 1, // 乘法
  Overwrite = 2 // 覆盖
}

/**
 * 表情参数信息
 */
export class ExpressionParameter {
  parameterId: CubismIdHandle; // 参数 ID
  blendType: ExpressionBlendType; // 参数的运算类型
  value: number; // 值
}

// 兼容性命名空间定义。
import * as $ from './cubismexpressionmotion';
import { ExpressionParameterValue } from './cubismexpressionmotionmanager';
import { CubismDefaultParameterId } from '../cubismdefaultparameterid';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismExpressionMotion = $.CubismExpressionMotion;
  export type CubismExpressionMotion = $.CubismExpressionMotion;
  export const ExpressionBlendType = $.ExpressionBlendType;
  export type ExpressionBlendType = $.ExpressionBlendType;
  export const ExpressionParameter = $.ExpressionParameter;
  export type ExpressionParameter = $.ExpressionParameter;
}
