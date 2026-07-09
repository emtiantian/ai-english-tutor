// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismIdHandle } from './id/cubismid';

/**
 * 声明处理模型设置信息的纯虚类。
 *
 * 继承此类后，即成为处理模型设置信息的类。
 */
export abstract class ICubismModelSetting {
  /**
   * 获取 Moc 文件名
   * @return Moc 文件名
   */
  public abstract getModelFileName(): string;

  /**
   * 获取模型使用的纹理数量
   * 纹理数量
   */
  public abstract getTextureCount(): number;

  /**
   * 获取纹理所在目录的名称
   * @return 纹理所在目录的名称
   */
  public abstract getTextureDirectory(): string;

  /**
   * 获取模型使用的纹理名称
   * @param index 数组索引值
   * @return 纹理名称
   */
  public abstract getTextureFileName(index: number): string;

  /**
   * 获取模型中设置的命中判定数量
   * @return 命中判定数量
   */
  public abstract getHitAreasCount(): number;

  /**
   * 获取命中判定中设置的 ID
   *
   * @param index 数组的 index
   * @return 命中判定中设置的 ID
   */
  public abstract getHitAreaId(index: number): CubismIdHandle;

  /**
   * 获取命中判定中设置的名称
   * @param index 数组索引值
   * @return 命中判定中设置的名称
   */
  public abstract getHitAreaName(index: number): string;

  /**
   * 获取物理演算设置文件的名称
   * @return 物理演算设置文件的名称
   */
  public abstract getPhysicsFileName(): string;

  /**
   * 获取部件切换设置文件的名称
   * @return 部件切换设置文件的名称
   */
  public abstract getPoseFileName(): string;

  /**
   * 获取表情设置文件的数量
   * @return 表情设置文件的数量
   */
  public abstract getExpressionCount(): number;

  /**
   * 获取用于识别表情设置文件的名称（别名）
   * @param index 数组索引值
   * @return 表情名称
   */
  public abstract getExpressionName(index: number): string;

  /**
   * 获取表情设置文件的名称
   * @param index 数组索引值
   * @return 表情设置文件的名称
   */
  public abstract getExpressionFileName(index: number): string;

  /**
   * 获取动作组的数量
   * @return 动作组的数量
   */
  public abstract getMotionGroupCount(): number;

  /**
   * 获取动作组的名称
   * @param index 数组索引值
   * @return 动作组的名称
   */
  public abstract getMotionGroupName(index: number): string;

  /**
   * 获取动作组中包含的动作数量
   * @param groupName 动作组的名称
   * @return 动作组的数量
   */
  public abstract getMotionCount(groupName: string): number;

  /**
   * 根据组名和索引值获取动作文件名
   * @param groupName 动作组的名称
   * @param index     数组索引值
   * @return 动作文件的名称
   */
  public abstract getMotionFileName(groupName: string, index: number): string;

  /**
   * 获取动作对应的音效文件名称
   * @param groupName 动作组的名称
   * @param index 数组索引值
   * @return 音效文件的名称
   */
  public abstract getMotionSoundFileName(
    groupName: string,
    index: number
  ): string;

  /**
   * 获取动作开始时的淡入处理时间
   * @param groupName 动作组的名称
   * @param index 数组索引值
   * @return 淡入处理时间[秒]
   */
  public abstract getMotionFadeInTimeValue(
    groupName: string,
    index: number
  ): number;

  /**
   * 获取动作结束时的淡出处理时间
   * @param groupName 动作组的名称
   * @param index 数组索引值
   * @return 淡出处理时间[秒]
   */
  public abstract getMotionFadeOutTimeValue(
    groupName: string,
    index: number
  ): number;

  /**
   * 获取用户数据文件名
   * @return 用户数据文件名
   */
  public abstract getUserDataFile(): string;

  /**
   * 获取布局信息
   * @param outLayoutMap Map 类的实例
   * @return true 布局信息存在
   * @return false 布局信息不存在
   */
  public abstract getLayoutMap(outLayoutMap: Map<string, number>): boolean;

  /**
   * 获取与眨眼关联的参数数量
   * @return 与眨眼关联的参数数量
   */
  public abstract getEyeBlinkParameterCount(): number;

  /**
   * 获取与眨眼关联的参数 ID
   * @param index 数组索引值
   * @return 参数 ID
   */
  public abstract getEyeBlinkParameterId(index: number): CubismIdHandle;

  /**
   * 获取与口型同步关联的参数数量
   * @return 与口型同步关联的参数数量
   */
  public abstract getLipSyncParameterCount(): number;

  /**
   * 获取与口型同步关联的参数 ID
   * @param index 数组索引值
   * @return 参数 ID
   */
  public abstract getLipSyncParameterId(index: number): CubismIdHandle;
}

// 用于兼容性的命名空间定义。
import * as $ from './icubismmodelsetting';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const ICubismModelSetting = $.ICubismModelSetting;
  export type ICubismModelSetting = $.ICubismModelSetting;
}
