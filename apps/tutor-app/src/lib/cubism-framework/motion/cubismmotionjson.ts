// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismIdHandle } from '../id/cubismid';
import { CubismFramework } from '../live2dcubismframework';
import { CSM_ASSERT, CubismLogWarning } from '../utils/cubismdebug';
import { CubismJson, JsonMap } from '../utils/cubismjson';
import { CubismMotionSegmentType } from './cubismmotioninternal';

// JSON 键
const Meta = 'Meta';
const Duration = 'Duration';
const Loop = 'Loop';
const AreBeziersRestricted = 'AreBeziersRestricted';
const CurveCount = 'CurveCount';
const Fps = 'Fps';
const TotalSegmentCount = 'TotalSegmentCount';
const TotalPointCount = 'TotalPointCount';
const Curves = 'Curves';
const Target = 'Target';
const Id = 'Id';
const FadeInTime = 'FadeInTime';
const FadeOutTime = 'FadeOutTime';
const Segments = 'Segments';
const UserData = 'UserData';
const UserDataCount = 'UserDataCount';
const TotalUserDataSize = 'TotalUserDataSize';
const Time = 'Time';
const Value = 'Value';

/**
 * motion3.json 容器。
 */
export class CubismMotionJson {
  /**
   * 构造函数
   * @param buffer 已加载 motion3.json 的缓冲区
   * @param size 缓冲区大小
   */
  public constructor(buffer: ArrayBuffer, size: number) {
    this._json = CubismJson.create(buffer, size);
  }

  /**
   * 析构等效处理
   */
  public release(): void {
    CubismJson.delete(this._json);
  }

  /**
   * 获取动作长度
   * @return 动作长度[秒]
   */
  public getMotionDuration(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(Duration)
      .toFloat();
  }

  /**
   * 获取动作循环信息
   * @return true 循环
   * @return false 不循环
   */
  public isMotionLoop(): boolean {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(Loop)
      .toBoolean();
  }

  /**
   *  motion3.json 文件一致性检查
   *
   * @return 文件正常时返回 true。
   */
  hasConsistency(): boolean {
    let result = true;

    if (!this._json || !this._json.getRoot()) {
      return false;
    }

    const actualCurveListSize = this._json
      .getRoot()
      .getValueByString(Curves)
      .getVector().length;
    let actualTotalSegmentCount = 0;
    let actualTotalPointCount = 0;

    // 计数处理
    for (
      let curvePosition = 0;
      curvePosition < actualCurveListSize;
      ++curvePosition
    ) {
      for (
        let segmentPosition = 0;
        segmentPosition < this.getMotionCurveSegmentCount(curvePosition);
      ) {
        if (segmentPosition == 0) {
          actualTotalPointCount += 1;
          segmentPosition += 2;
        }

        const segment = this.getMotionCurveSegment(
          curvePosition,
          segmentPosition
        ) as CubismMotionSegmentType;

        switch (segment) {
          case CubismMotionSegmentType.CubismMotionSegmentType_Linear:
            actualTotalPointCount += 1;
            segmentPosition += 3;
            break;
          case CubismMotionSegmentType.CubismMotionSegmentType_Bezier:
            actualTotalPointCount += 3;
            segmentPosition += 7;
            break;
          case CubismMotionSegmentType.CubismMotionSegmentType_Stepped:
            actualTotalPointCount += 1;
            segmentPosition += 3;
            break;
          case CubismMotionSegmentType.CubismMotionSegmentType_InverseStepped:
            actualTotalPointCount += 1;
            segmentPosition += 3;
            break;
          default:
            CSM_ASSERT(0);
            break;
        }

        ++actualTotalSegmentCount;
      }
    }

    // 数量检查
    if (actualCurveListSize != this.getMotionCurveCount()) {
      CubismLogWarning('The number of curves does not match the metadata.');
      result = false;
    }
    if (actualTotalSegmentCount != this.getMotionTotalSegmentCount()) {
      CubismLogWarning('The number of segment does not match the metadata.');
      result = false;
    }
    if (actualTotalPointCount != this.getMotionTotalPointCount()) {
      CubismLogWarning('The number of point does not match the metadata.');
      result = false;
    }

    return result;
  }

  public getEvaluationOptionFlag(flagType: EvaluationOptionFlag): boolean {
    if (
      EvaluationOptionFlag.EvaluationOptionFlag_AreBeziersRistricted == flagType
    ) {
      return this._json
        .getRoot()
        .getValueByString(Meta)
        .getValueByString(AreBeziersRestricted)
        .toBoolean();
    }

    return false;
  }

  /**
   * 获取动作曲线数量
   * @return 动作曲线数量
   */
  public getMotionCurveCount(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(CurveCount)
      .toInt();
  }

  /**
   * 获取动作帧率
   * @return 帧率[FPS]
   */
  public getMotionFps(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(Fps)
      .toFloat();
  }

  /**
   * 获取动作段的总数
   * @return 动作段的总数
   */
  public getMotionTotalSegmentCount(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(TotalSegmentCount)
      .toInt();
  }

  /**
   * 获取动作曲线控制点的总数
   * @return 动作曲线控制点的总数
   */
  public getMotionTotalPointCount(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(TotalPointCount)
      .toInt();
  }

  /**
   * 动作淡入时间是否存在
   * @return true 存在
   * @return false 不存在
   */
  public isExistMotionFadeInTime(): boolean {
    return !this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(FadeInTime)
      .isNull();
  }

  /**
   * 动作淡出时间是否存在
   * @return true 存在
   * @return false 不存在
   */
  public isExistMotionFadeOutTime(): boolean {
    return !this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(FadeOutTime)
      .isNull();
  }

  /**
   * 获取动作淡入时间
   * @return 淡入时间[秒]
   */
  public getMotionFadeInTime(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(FadeInTime)
      .toFloat();
  }

  /**
   * 获取动作淡出时间
   * @return 淡出时间[秒]
   */
  public getMotionFadeOutTime(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(FadeOutTime)
      .toFloat();
  }

  /**
   * 获取动作曲线目标类型
   * @param curveIndex 曲线索引
   * @return 曲线目标类型
   */
  public getMotionCurveTarget(curveIndex: number): string {
    return this._json
      .getRoot()
      .getValueByString(Curves)
      .getValueByIndex(curveIndex)
      .getValueByString(Target)
      .getRawString();
  }

  /**
   * 获取动作曲线 ID
   * @param curveIndex 曲线索引
   * @return 曲线 ID
   */
  public getMotionCurveId(curveIndex: number): CubismIdHandle {
    return CubismFramework.getIdManager().getId(
      this._json
        .getRoot()
        .getValueByString(Curves)
        .getValueByIndex(curveIndex)
        .getValueByString(Id)
        .getRawString()
    );
  }

  /**
   * 动作曲线淡入时间是否存在
   * @param curveIndex 曲线索引
   * @return true 存在
   * @return false 不存在
   */
  public isExistMotionCurveFadeInTime(curveIndex: number): boolean {
    return !this._json
      .getRoot()
      .getValueByString(Curves)
      .getValueByIndex(curveIndex)
      .getValueByString(FadeInTime)
      .isNull();
  }

  /**
   * 动作曲线淡出时间是否存在
   * @param curveIndex 曲线索引
   * @return true 存在
   * @return false 不存在
   */
  public isExistMotionCurveFadeOutTime(curveIndex: number): boolean {
    return !this._json
      .getRoot()
      .getValueByString(Curves)
      .getValueByIndex(curveIndex)
      .getValueByString(FadeOutTime)
      .isNull();
  }

  /**
   * 获取动作曲线淡入时间
   * @param curveIndex 曲线索引
   * @return 淡入时间[秒]
   */
  public getMotionCurveFadeInTime(curveIndex: number): number {
    return this._json
      .getRoot()
      .getValueByString(Curves)
      .getValueByIndex(curveIndex)
      .getValueByString(FadeInTime)
      .toFloat();
  }

  /**
   * 获取动作曲线淡出时间
   * @param curveIndex 曲线索引
   * @return 淡出时间[秒]
   */
  public getMotionCurveFadeOutTime(curveIndex: number): number {
    return this._json
      .getRoot()
      .getValueByString(Curves)
      .getValueByIndex(curveIndex)
      .getValueByString(FadeOutTime)
      .toFloat();
  }

  /**
   * 获取动作曲线段数量
   * @param curveIndex 曲线索引
   * @return 动作曲线段数量
   */
  public getMotionCurveSegmentCount(curveIndex: number): number {
    return this._json
      .getRoot()
      .getValueByString(Curves)
      .getValueByIndex(curveIndex)
      .getValueByString(Segments)
      .getVector().length;
  }

  /**
   * 获取动作曲线段的值
   * @param curveIndex 曲线索引
   * @param segmentIndex 段索引
   * @return 段的值
   */
  public getMotionCurveSegment(
    curveIndex: number,
    segmentIndex: number
  ): number {
    return this._json
      .getRoot()
      .getValueByString(Curves)
      .getValueByIndex(curveIndex)
      .getValueByString(Segments)
      .getValueByIndex(segmentIndex)
      .toFloat();
  }

  /**
   * 获取事件数量
   * @return 事件数量
   */
  public getEventCount(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(UserDataCount)
      .toInt();
  }

  /**
   *  获取事件总字符数
   * @return 事件总字符数
   */
  public getTotalEventValueSize(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(TotalUserDataSize)
      .toInt();
  }

  /**
   * 获取事件时间
   * @param userDataIndex 事件索引
   * @return 事件时间[秒]
   */
  public getEventTime(userDataIndex: number): number {
    return this._json
      .getRoot()
      .getValueByString(UserData)
      .getValueByIndex(userDataIndex)
      .getValueByString(Time)
      .toFloat();
  }

  /**
   * 获取事件
   * @param userDataIndex 事件索引
   * @return 事件字符串
   */
  public getEventValue(userDataIndex: number): string {
    return this._json
      .getRoot()
      .getValueByString(UserData)
      .getValueByIndex(userDataIndex)
      .getValueByString(Value)
      .getRawString();
  }

  _json: CubismJson; // motion3.json 数据
}

/**
 * @brief 贝塞尔曲线解释方式的标志类型
 */
export enum EvaluationOptionFlag {
  EvaluationOptionFlag_AreBeziersRistricted = 0 ///< 贝塞尔手柄限制状态
}

// 兼容性命名空间定义。
import * as $ from './cubismmotionjson';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismMotionJson = $.CubismMotionJson;
  export type CubismMotionJson = $.CubismMotionJson;
}
