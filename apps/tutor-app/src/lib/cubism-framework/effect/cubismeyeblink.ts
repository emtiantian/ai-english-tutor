// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { ICubismModelSetting } from '../icubismmodelsetting';
import { CubismIdHandle } from '../id/cubismid';
import { CubismModel } from '../model/cubismmodel';

/**
 * 自动眨眼功能
 *
 * 提供自动眨眼功能。
 */
export class CubismEyeBlink {
  /**
   * 创建实例
   * @param modelSetting 模型设置信息
   * @return 创建的实例
   * @note 参数为 NULL 时，会创建一个参数 ID 未设置的空实例。
   */
  public static create(
    modelSetting: ICubismModelSetting = null
  ): CubismEyeBlink {
    return new CubismEyeBlink(modelSetting);
  }

  /**
   * 销毁实例
   * @param eyeBlink 目标 CubismEyeBlink
   */
  public static delete(eyeBlink: CubismEyeBlink): void {
    if (eyeBlink != null) {
      eyeBlink = null;
    }
  }

  /**
   * 设置眨眼间隔
   * @param blinkingInterval 眨眼间隔时间[秒]
   */
  public setBlinkingInterval(blinkingInterval: number): void {
    this._blinkingIntervalSeconds = blinkingInterval;
  }

  /**
   * 设置眨眼动作的细节
   * @param closing   闭眼动作所需时间[秒]
   * @param closed    闭眼保持动作所需时间[秒]
   * @param opening   睁眼动作所需时间[秒]
   */
  public setBlinkingSetting(
    closing: number,
    closed: number,
    opening: number
  ): void {
    this._closingSeconds = closing;
    this._closedSeconds = closed;
    this._openingSeconds = opening;
  }

  /**
   * 设置要眨眼的参数 ID 列表
   * @param parameterIds 参数 ID 列表
   */
  public setParameterIds(parameterIds: Array<CubismIdHandle>): void {
    this._parameterIds = parameterIds;
  }

  /**
   * 获取要眨眼的参数 ID 列表
   * @return 参数 ID 列表
   */
  public getParameterIds(): Array<CubismIdHandle> {
    return this._parameterIds;
  }

  /**
   * 更新模型参数
   * @param model 目标模型
   * @param deltaTimeSeconds 增量时间[秒]
   */
  public updateParameters(model: CubismModel, deltaTimeSeconds: number): void {
    this._userTimeSeconds += deltaTimeSeconds;
    let parameterValue: number;
    let t = 0.0;
    const blinkingState: EyeState = this._blinkingState;

    switch (blinkingState) {
      case EyeState.EyeState_Closing:
        t =
          (this._userTimeSeconds - this._stateStartTimeSeconds) /
          this._closingSeconds;

        if (t >= 1.0) {
          t = 1.0;
          this._blinkingState = EyeState.EyeState_Closed;
          this._stateStartTimeSeconds = this._userTimeSeconds;
        }

        parameterValue = 1.0 - t;

        break;
      case EyeState.EyeState_Closed:
        t =
          (this._userTimeSeconds - this._stateStartTimeSeconds) /
          this._closedSeconds;

        if (t >= 1.0) {
          this._blinkingState = EyeState.EyeState_Opening;
          this._stateStartTimeSeconds = this._userTimeSeconds;
        }

        parameterValue = 0.0;

        break;
      case EyeState.EyeState_Opening:
        t =
          (this._userTimeSeconds - this._stateStartTimeSeconds) /
          this._openingSeconds;

        if (t >= 1.0) {
          t = 1.0;
          this._blinkingState = EyeState.EyeState_Interval;
          this._nextBlinkingTime = this.determinNextBlinkingTiming();
        }

        parameterValue = t;

        break;
      case EyeState.EyeState_Interval:
        if (this._nextBlinkingTime < this._userTimeSeconds) {
          this._blinkingState = EyeState.EyeState_Closing;
          this._stateStartTimeSeconds = this._userTimeSeconds;
        }

        parameterValue = 1.0;

        break;
      case EyeState.EyeState_First:
      default:
        this._blinkingState = EyeState.EyeState_Interval;
        this._nextBlinkingTime = this.determinNextBlinkingTiming();

        parameterValue = 1.0;
        break;
    }

    if (!CubismEyeBlink.CloseIfZero) {
      parameterValue = -parameterValue;
    }

    for (let i = 0; i < this._parameterIds.length; ++i) {
      model.setParameterValueById(this._parameterIds[i], parameterValue);
    }
  }

  /**
   * 构造函数
   * @param modelSetting 模型设置信息
   */
  public constructor(modelSetting: ICubismModelSetting) {
    this._blinkingState = EyeState.EyeState_First;
    this._nextBlinkingTime = 0.0;
    this._stateStartTimeSeconds = 0.0;
    this._blinkingIntervalSeconds = 4.0;
    this._closingSeconds = 0.1;
    this._closedSeconds = 0.05;
    this._openingSeconds = 0.15;
    this._userTimeSeconds = 0.0;
    this._parameterIds = new Array<CubismIdHandle>();

    if (modelSetting == null) {
      return;
    }

    this._parameterIds.length = modelSetting.getEyeBlinkParameterCount();
    for (let i = 0; i < modelSetting.getEyeBlinkParameterCount(); ++i) {
      this._parameterIds[i] = modelSetting.getEyeBlinkParameterId(i);
    }
  }

  /**
   * 决定下次眨眼的时机
   *
   * @return 下次眨眼的时间[秒]
   */
  public determinNextBlinkingTiming(): number {
    const r: number = Math.random();
    return (
      this._userTimeSeconds + r * (2.0 * this._blinkingIntervalSeconds - 1.0)
    );
  }

  _blinkingState: number; // 当前状态
  _parameterIds: Array<CubismIdHandle>; // 要操作的参数 ID 列表
  _nextBlinkingTime: number; // 下次眨眼时间[秒]
  _stateStartTimeSeconds: number; // 当前状态开始时间[秒]
  _blinkingIntervalSeconds: number; // 眨眼间隔[秒]
  _closingSeconds: number; // 闭眼动作所需时间[秒]
  _closedSeconds: number; // 闭眼保持动作所需时间[秒]
  _openingSeconds: number; // 睁眼动作所需时间[秒]
  _userTimeSeconds: number; // 增量时间累计值[秒]

  /**
   * 指定的眼睛参数在值为 0 时闭合则为 true，值为 1 时闭合则为 false。
   */
  static readonly CloseIfZero: boolean = true;
}

/**
 * 眨眼状态
 *
 * 表示眨眼状态的枚举
 */
export enum EyeState {
  EyeState_First = 0, // 初始状态
  EyeState_Interval, // 未眨眼状态
  EyeState_Closing, // 眼皮正在闭合的状态
  EyeState_Closed, // 眼皮闭合的状态
  EyeState_Opening // 眼皮正在睁开的状态
}

// 为兼容性定义的命名空间。
import * as $ from './cubismeyeblink';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismEyeBlink = $.CubismEyeBlink;
  export type CubismEyeBlink = $.CubismEyeBlink;
  export const EyeState = $.EyeState;
  export type EyeState = $.EyeState;
}
