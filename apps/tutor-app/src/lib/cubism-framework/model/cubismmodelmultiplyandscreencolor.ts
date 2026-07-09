// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismTextureColor } from '../rendering/cubismrenderer';
import { CubismModelObjectType, NoOffscreenIndex } from './cubismmodel';
import { CubismLogWarning } from '../utils/cubismdebug';

/**
 * SDK側から与えられた描画オブジェクトの乗算色・スクリーン色上書きフラグと
 * その色を保持する構造体
 */
export class ColorData {
  constructor(
    isOverridden = false,
    color: CubismTextureColor = new CubismTextureColor()
  ) {
    this.isOverridden = isOverridden;
    this.color = color;
  }

  public isOverridden: boolean;
  public color: CubismTextureColor;
}

/**
 * 处理模型的乘色和屏幕色。
 */
export class CubismModelMultiplyAndScreenColor {
  private _model: any; // CubismModel
  private _isOverriddenModelMultiplyColors: boolean;
  private _isOverriddenModelScreenColors: boolean;
  private _userPartScreenColors: Array<ColorData>;
  private _userPartMultiplyColors: Array<ColorData>;
  private _userDrawableScreenColors: Array<ColorData>;
  private _userDrawableMultiplyColors: Array<ColorData>;
  private _userOffscreenScreenColors: Array<ColorData>;
  private _userOffscreenMultiplyColors: Array<ColorData>;

  /**
   * 构造函数。
   *
   * @param model Cubism 模型。
   */
  public constructor(model: any) {
    this._model = model;
    this._isOverriddenModelMultiplyColors = false;
    this._isOverriddenModelScreenColors = false;
    this._userPartScreenColors = [];
    this._userPartMultiplyColors = [];
    this._userDrawableScreenColors = [];
    this._userDrawableMultiplyColors = [];
    this._userOffscreenScreenColors = [];
    this._userOffscreenMultiplyColors = [];
  }

  /**
   * 初始化乘色和屏幕色的使用。
   *
   * @param partCount 部件数量。
   * @param drawableCount 可绘制对象数量。
   * @param offscreenCount 离屏缓冲数量。
   */
  public initialize(
    partCount: number,
    drawableCount: number,
    offscreenCount: number
  ): void {
    // 乗算色の初期値
    const userMultiplyColor = new ColorData(
      false,
      new CubismTextureColor(1.0, 1.0, 1.0, 1.0)
    );

    // スクリーン色の初期値
    const userScreenColor = new ColorData(
      false,
      new CubismTextureColor(0.0, 0.0, 0.0, 1.0)
    );

    // 部件
    this._userPartMultiplyColors = new Array(partCount);
    this._userPartScreenColors = new Array(partCount);
    for (let i = 0; i < partCount; i++) {
      this._userPartMultiplyColors[i] = new ColorData(
        userMultiplyColor.isOverridden,
        new CubismTextureColor(
          userMultiplyColor.color.r,
          userMultiplyColor.color.g,
          userMultiplyColor.color.b,
          userMultiplyColor.color.a
        )
      );
      this._userPartScreenColors[i] = new ColorData(
        userScreenColor.isOverridden,
        new CubismTextureColor(
          userScreenColor.color.r,
          userScreenColor.color.g,
          userScreenColor.color.b,
          userScreenColor.color.a
        )
      );
    }

    // 可绘制对象
    this._userDrawableMultiplyColors = new Array(drawableCount);
    this._userDrawableScreenColors = new Array(drawableCount);
    for (let i = 0; i < drawableCount; i++) {
      this._userDrawableMultiplyColors[i] = new ColorData(
        userMultiplyColor.isOverridden,
        new CubismTextureColor(
          userMultiplyColor.color.r,
          userMultiplyColor.color.g,
          userMultiplyColor.color.b,
          userMultiplyColor.color.a
        )
      );
      this._userDrawableScreenColors[i] = new ColorData(
        userScreenColor.isOverridden,
        new CubismTextureColor(
          userScreenColor.color.r,
          userScreenColor.color.g,
          userScreenColor.color.b,
          userScreenColor.color.a
        )
      );
    }

    // 离屏缓冲
    this._userOffscreenMultiplyColors = new Array(offscreenCount);
    this._userOffscreenScreenColors = new Array(offscreenCount);
    for (let i = 0; i < offscreenCount; i++) {
      this._userOffscreenMultiplyColors[i] = new ColorData(
        userMultiplyColor.isOverridden,
        new CubismTextureColor(
          userMultiplyColor.color.r,
          userMultiplyColor.color.g,
          userMultiplyColor.color.b,
          userMultiplyColor.color.a
        )
      );
      this._userOffscreenScreenColors[i] = new ColorData(
        userScreenColor.isOverridden,
        new CubismTextureColor(
          userScreenColor.color.r,
          userScreenColor.color.g,
          userScreenColor.color.b,
          userScreenColor.color.a
        )
      );
    }
  }

  /**
   * 输出索引越界错误的警告信息。
   *
   * @param functionName 调用函数的名称
   * @param index 无效的索引值
   * @param maxIndex 最大有效索引（length - 1）
   */
  private warnIndexOutOfRange(
    functionName: string,
    index: number,
    maxIndex: number
  ): void {
    CubismLogWarning(
      `${functionName}: index is out of range. index=${index}, valid range=[0, ${maxIndex}].`
    );
  }

  /**
   * 校验给定的部件索引是否在有效范围内。
   *
   * @param index 要校验的部件索引
   * @param functionName 用于错误报告的调用函数名称
   * @return 索引有效则返回 true，否则返回 false
   */
  private isValidPartIndex(index: number, functionName: string): boolean {
    if (index < 0 || index >= this._model.getPartCount()) {
      this.warnIndexOutOfRange(
        functionName,
        index,
        this._model.getPartCount() - 1
      );
      return false;
    }
    return true;
  }

  /**
   * 校验给定的可绘制对象索引是否在有效范围内。
   *
   * @param index 要校验的可绘制对象索引
   * @param functionName 用于错误报告的调用函数名称
   * @return 索引有效则返回 true，否则返回 false
   */
  private isValidDrawableIndex(index: number, functionName: string): boolean {
    if (index < 0 || index >= this._model.getDrawableCount()) {
      this.warnIndexOutOfRange(
        functionName,
        index,
        this._model.getDrawableCount() - 1
      );
      return false;
    }
    return true;
  }

  /**
   * 校验给定的离屏缓冲索引是否在有效范围内。
   *
   * @param index 要校验的离屏缓冲索引
   * @param functionName 用于错误报告的调用函数名称
   * @return 索引有效则返回 true，否则返回 false
   */
  private isValidOffscreenIndex(index: number, functionName: string): boolean {
    if (index < 0 || index >= this._model.getOffscreenCount()) {
      this.warnIndexOutOfRange(
        functionName,
        index,
        this._model.getOffscreenCount() - 1
      );
      return false;
    }
    return true;
  }

  /**
   * 设置是否将运行时设置的颜色用作整个模型渲染时的乘色。
   *
   * @param value 要使用运行时设置的颜色则为 true，否则为 false。
   */
  public setMultiplyColorEnabled(value: boolean): void {
    this._isOverriddenModelMultiplyColors = value;
  }

  /**
   * 返回是否将运行时设置的颜色用作整个模型渲染时的乘色。
   *
   * @return 使用运行时设置的颜色则返回 true，否则返回 false。
   */
  public getMultiplyColorEnabled(): boolean {
    return this._isOverriddenModelMultiplyColors;
  }

  /**
   * 设置是否将运行时设置的颜色用作整个模型渲染时的屏幕色。
   *
   * @param value 要使用运行时设置的颜色则为 true，否则为 false。
   */
  public setScreenColorEnabled(value: boolean): void {
    this._isOverriddenModelScreenColors = value;
  }

  /**
   * 返回是否将运行时设置的颜色用作整个模型渲染时的屏幕色。
   *
   * @return 使用运行时设置的颜色则返回 true，否则返回 false。
   */
  public getScreenColorEnabled(): boolean {
    return this._isOverriddenModelScreenColors;
  }

  /**
   * 设置是否由 SDK 覆盖部件乘色。
   * 传入 true 使用 SDK 提供的颜色信息，false 则使用模型中的颜色信息。
   *
   * @param partIndex 部件索引
   * @param value true 启用覆盖，false 禁用覆盖
   */
  public setPartMultiplyColorEnabled(partIndex: number, value: boolean): void {
    if (!this.isValidPartIndex(partIndex, 'setPartMultiplyColorEnabled')) {
      return;
    }
    this.setPartColorEnabled(
      partIndex,
      value,
      this._userPartMultiplyColors,
      this._userDrawableMultiplyColors,
      this._userOffscreenMultiplyColors
    );
  }

  /**
   * 检查部件乘色是否由 SDK 覆盖。
   *
   * @param partIndex 部件索引
   *
   * @return 使用 SDK 提供的颜色信息则返回 true，否则返回 false。
   */
  public getPartMultiplyColorEnabled(partIndex: number): boolean {
    if (!this.isValidPartIndex(partIndex, 'getPartMultiplyColorEnabled')) {
      return false;
    }
    return this._userPartMultiplyColors[partIndex].isOverridden;
  }

  /**
   * 设置是否由 SDK 覆盖部件屏幕色。
   * 传入 true 使用 SDK 提供的颜色信息，false 则使用模型中的颜色信息。
   *
   * @param partIndex 部件索引
   * @param value true 启用覆盖，false 禁用覆盖
   */
  public setPartScreenColorEnabled(partIndex: number, value: boolean): void {
    if (!this.isValidPartIndex(partIndex, 'setPartScreenColorEnabled')) {
      return;
    }
    this.setPartColorEnabled(
      partIndex,
      value,
      this._userPartScreenColors,
      this._userDrawableScreenColors,
      this._userOffscreenScreenColors
    );
  }

  /**
   * 检查部件屏幕色是否由 SDK 覆盖。
   *
   * @param partIndex 部件索引
   *
   * @return 使用 SDK 提供的颜色信息则返回 true，否则返回 false。
   */
  public getPartScreenColorEnabled(partIndex: number): boolean {
    if (!this.isValidPartIndex(partIndex, 'getPartScreenColorEnabled')) {
      return false;
    }
    return this._userPartScreenColors[partIndex].isOverridden;
  }

  /**
   * 设置部件的乘色。
   *
   * @param partIndex 部件索引
   * @param color 要设置的乘色（CubismTextureColor）
   */
  public setPartMultiplyColorByTextureColor(
    partIndex: number,
    color: CubismTextureColor
  ): void {
    if (
      !this.isValidPartIndex(partIndex, 'setPartMultiplyColorByTextureColor')
    ) {
      return;
    }
    this.setPartMultiplyColorByRGBA(
      partIndex,
      color.r,
      color.g,
      color.b,
      color.a
    );
  }

  /**
   * 设置部件的乘色。
   *
   * @param partIndex 部件索引
   * @param r 要设置的乘色红色分量
   * @param g 要设置的乘色绿色分量
   * @param b 要设置的乘色蓝色分量
   * @param a 要设置的乘色透明度分量
   */
  public setPartMultiplyColorByRGBA(
    partIndex: number,
    r: number,
    g: number,
    b: number,
    a: number = 1.0
  ): void {
    if (!this.isValidPartIndex(partIndex, 'setPartMultiplyColorByRGBA')) {
      return;
    }
    this.setPartColor(
      partIndex,
      r,
      g,
      b,
      a,
      this._userPartMultiplyColors,
      this._userDrawableMultiplyColors,
      this._userOffscreenMultiplyColors
    );
  }

  /**
   * 返回部件的乘色。
   *
   * @param partIndex 部件索引
   *
   * @return 乘色（CubismTextureColor）
   */
  public getPartMultiplyColor(partIndex: number): CubismTextureColor {
    if (!this.isValidPartIndex(partIndex, 'getPartMultiplyColor')) {
      return new CubismTextureColor(1.0, 1.0, 1.0, 1.0);
    }
    return this._userPartMultiplyColors[partIndex].color;
  }

  /**
   * 设置部件的屏幕色。
   *
   * @param partIndex 部件索引
   * @param color 要设置的屏幕色（CubismTextureColor）
   */
  public setPartScreenColorByTextureColor(
    partIndex: number,
    color: CubismTextureColor
  ): void {
    if (!this.isValidPartIndex(partIndex, 'setPartScreenColorByTextureColor')) {
      return;
    }
    this.setPartScreenColorByRGBA(
      partIndex,
      color.r,
      color.g,
      color.b,
      color.a
    );
  }

  /**
   * 设置部件的屏幕色。
   *
   * @param partIndex 部件索引
   * @param r 要设置的屏幕色红色分量
   * @param g 要设置的屏幕色绿色分量
   * @param b 要设置的屏幕色蓝色分量
   * @param a 要设置的屏幕色透明度分量
   */
  public setPartScreenColorByRGBA(
    partIndex: number,
    r: number,
    g: number,
    b: number,
    a: number = 1.0
  ): void {
    if (!this.isValidPartIndex(partIndex, 'setPartScreenColorByRGBA')) {
      return;
    }
    this.setPartColor(
      partIndex,
      r,
      g,
      b,
      a,
      this._userPartScreenColors,
      this._userDrawableScreenColors,
      this._userOffscreenScreenColors
    );
  }

  /**
   * 返回部件的屏幕色。
   *
   * @param partIndex 部件索引
   *
   * @return 屏幕色（CubismTextureColor）
   */
  public getPartScreenColor(partIndex: number): CubismTextureColor {
    if (!this.isValidPartIndex(partIndex, 'getPartScreenColor')) {
      return new CubismTextureColor(0.0, 0.0, 0.0, 1.0);
    }
    return this._userPartScreenColors[partIndex].color;
  }

  /**
   * 设置是否将运行时设置的颜色用作可绘制对象渲染时的乘色。
   *
   * @param drawableIndex 可绘制对象索引
   * @param value 要使用运行时设置的颜色则为 true，否则为 false。
   */
  public setDrawableMultiplyColorEnabled(
    drawableIndex: number,
    value: boolean
  ): void {
    if (
      !this.isValidDrawableIndex(
        drawableIndex,
        'setDrawableMultiplyColorEnabled'
      )
    ) {
      return;
    }
    this._userDrawableMultiplyColors[drawableIndex].isOverridden = value;
  }

  /**
   * 返回是否将运行时设置的颜色用作可绘制对象渲染时的乘色。
   *
   * @param drawableIndex 可绘制对象索引
   *
   * @return 使用运行时设置的颜色则返回 true，否则返回 false。
   */
  public getDrawableMultiplyColorEnabled(drawableIndex: number): boolean {
    if (
      !this.isValidDrawableIndex(
        drawableIndex,
        'getDrawableMultiplyColorEnabled'
      )
    ) {
      return false;
    }
    return this._userDrawableMultiplyColors[drawableIndex].isOverridden;
  }

  /**
   * 设置是否将运行时设置的颜色用作可绘制对象渲染时的屏幕色。
   *
   * @param drawableIndex 可绘制对象索引
   * @param value 要使用运行时设置的颜色则为 true，否则为 false。
   */
  public setDrawableScreenColorEnabled(
    drawableIndex: number,
    value: boolean
  ): void {
    if (
      !this.isValidDrawableIndex(drawableIndex, 'setDrawableScreenColorEnabled')
    ) {
      return;
    }
    this._userDrawableScreenColors[drawableIndex].isOverridden = value;
  }

  /**
   * 返回是否将运行时设置的颜色用作可绘制对象渲染时的屏幕色。
   *
   * @param drawableIndex 可绘制对象索引
   *
   * @return 使用运行时设置的颜色则返回 true，否则返回 false。
   */
  public getDrawableScreenColorEnabled(drawableIndex: number): boolean {
    if (
      !this.isValidDrawableIndex(drawableIndex, 'getDrawableScreenColorEnabled')
    ) {
      return false;
    }
    return this._userDrawableScreenColors[drawableIndex].isOverridden;
  }

  /**
   * 设置可绘制对象的乘色。
   *
   * @param drawableIndex 可绘制对象索引
   * @param color 要设置的乘色（CubismTextureColor）
   */
  public setDrawableMultiplyColorByTextureColor(
    drawableIndex: number,
    color: CubismTextureColor
  ): void {
    if (
      !this.isValidDrawableIndex(
        drawableIndex,
        'setDrawableMultiplyColorByTextureColor'
      )
    ) {
      return;
    }
    this.setDrawableMultiplyColorByRGBA(
      drawableIndex,
      color.r,
      color.g,
      color.b,
      color.a
    );
  }

  /**
   * 设置可绘制对象的乘色。
   *
   * @param drawableIndex 可绘制对象索引
   * @param r 要设置的乘色红色分量
   * @param g 要设置的乘色绿色分量
   * @param b 要设置的乘色蓝色分量
   * @param a 要设置的乘色透明度分量
   */
  public setDrawableMultiplyColorByRGBA(
    drawableIndex: number,
    r: number,
    g: number,
    b: number,
    a: number = 1.0
  ): void {
    if (
      !this.isValidDrawableIndex(
        drawableIndex,
        'setDrawableMultiplyColorByRGBA'
      )
    ) {
      return;
    }
    this._userDrawableMultiplyColors[drawableIndex].color.r = r;
    this._userDrawableMultiplyColors[drawableIndex].color.g = g;
    this._userDrawableMultiplyColors[drawableIndex].color.b = b;
    this._userDrawableMultiplyColors[drawableIndex].color.a = a;
  }

  /**
   * 从可绘制对象列表中返回乘色。
   *
   * @param drawableIndex 可绘制对象索引
   *
   * @return 乘色（CubismTextureColor）
   */
  public getDrawableMultiplyColor(drawableIndex: number): CubismTextureColor {
    if (!this.isValidDrawableIndex(drawableIndex, 'getDrawableMultiplyColor')) {
      return new CubismTextureColor(1.0, 1.0, 1.0, 1.0);
    }
    if (
      this.getMultiplyColorEnabled() ||
      this.getDrawableMultiplyColorEnabled(drawableIndex)
    ) {
      return this._userDrawableMultiplyColors[drawableIndex].color;
    }
    return this._model.getDrawableMultiplyColor(drawableIndex);
  }

  /**
   * 设置可绘制对象的屏幕色。
   *
   * @param drawableIndex 可绘制对象索引
   * @param color 要设置的屏幕色（CubismTextureColor）
   */
  public setDrawableScreenColorByTextureColor(
    drawableIndex: number,
    color: CubismTextureColor
  ): void {
    if (
      !this.isValidDrawableIndex(
        drawableIndex,
        'setDrawableScreenColorByTextureColor'
      )
    ) {
      return;
    }
    this.setDrawableScreenColorByRGBA(
      drawableIndex,
      color.r,
      color.g,
      color.b,
      color.a
    );
  }

  /**
   * 设置可绘制对象的屏幕色。
   *
   * @param drawableIndex 可绘制对象索引
   * @param r 要设置的屏幕色红色分量
   * @param g 要设置的屏幕色绿色分量
   * @param b 要设置的屏幕色蓝色分量
   * @param a 要设置的屏幕色透明度分量
   */
  public setDrawableScreenColorByRGBA(
    drawableIndex: number,
    r: number,
    g: number,
    b: number,
    a: number = 1.0
  ): void {
    if (
      !this.isValidDrawableIndex(drawableIndex, 'setDrawableScreenColorByRGBA')
    ) {
      return;
    }
    this._userDrawableScreenColors[drawableIndex].color.r = r;
    this._userDrawableScreenColors[drawableIndex].color.g = g;
    this._userDrawableScreenColors[drawableIndex].color.b = b;
    this._userDrawableScreenColors[drawableIndex].color.a = a;
  }

  /**
   * 从可绘制对象列表中返回屏幕色。
   *
   * @param drawableIndex 可绘制对象索引
   *
   * @return 屏幕色（CubismTextureColor）
   */
  public getDrawableScreenColor(drawableIndex: number): CubismTextureColor {
    if (!this.isValidDrawableIndex(drawableIndex, 'getDrawableScreenColor')) {
      return new CubismTextureColor(0.0, 0.0, 0.0, 1.0);
    }
    if (
      this.getScreenColorEnabled() ||
      this.getDrawableScreenColorEnabled(drawableIndex)
    ) {
      return this._userDrawableScreenColors[drawableIndex].color;
    }
    return this._model.getDrawableScreenColor(drawableIndex);
  }

  /**
   * 设置是否由 SDK 覆盖离屏缓冲乘色。
   * 传入 true 使用 SDK 提供的颜色信息，false 则使用模型中的颜色信息。
   *
   * @param offscreenIndex 离屏缓冲索引
   * @param value true 启用覆盖，false 禁用覆盖
   */
  public setOffscreenMultiplyColorEnabled(
    offscreenIndex: number,
    value: boolean
  ): void {
    if (
      !this.isValidOffscreenIndex(
        offscreenIndex,
        'setOffscreenMultiplyColorEnabled'
      )
    ) {
      return;
    }
    this._userOffscreenMultiplyColors[offscreenIndex].isOverridden = value;
  }

  /**
   * 检查离屏缓冲乘色是否由 SDK 覆盖。
   *
   * @param offscreenIndex 离屏缓冲索引
   *
   * @return 使用 SDK 提供的颜色信息则返回 true，否则返回 false。
   */
  public getOffscreenMultiplyColorEnabled(offscreenIndex: number): boolean {
    if (
      !this.isValidOffscreenIndex(
        offscreenIndex,
        'getOffscreenMultiplyColorEnabled'
      )
    ) {
      return false;
    }
    return this._userOffscreenMultiplyColors[offscreenIndex].isOverridden;
  }

  /**
   * 设置是否由 SDK 覆盖离屏缓冲屏幕色。
   * 传入 true 使用 SDK 提供的颜色信息，false 则使用模型中的颜色信息。
   *
   * @param offscreenIndex 离屏缓冲索引
   * @param value true 启用覆盖，false 禁用覆盖
   */
  public setOffscreenScreenColorEnabled(
    offscreenIndex: number,
    value: boolean
  ): void {
    if (
      !this.isValidOffscreenIndex(
        offscreenIndex,
        'setOffscreenScreenColorEnabled'
      )
    ) {
      return;
    }
    this._userOffscreenScreenColors[offscreenIndex].isOverridden = value;
  }

  /**
   * 检查离屏缓冲屏幕色是否由 SDK 覆盖。
   *
   * @param offscreenIndex 离屏缓冲索引
   *
   * @return 使用 SDK 提供的颜色信息则返回 true，否则返回 false。
   */
  public getOffscreenScreenColorEnabled(offscreenIndex: number): boolean {
    if (
      !this.isValidOffscreenIndex(
        offscreenIndex,
        'getOffscreenScreenColorEnabled'
      )
    ) {
      return false;
    }
    return this._userOffscreenScreenColors[offscreenIndex].isOverridden;
  }

  /**
   * 设置离屏缓冲的乘色。
   *
   * @param offscreenIndex 离屏缓冲索引
   * @param color 要设置的乘色（CubismTextureColor）
   */
  public setOffscreenMultiplyColorByTextureColor(
    offscreenIndex: number,
    color: CubismTextureColor
  ): void {
    if (
      !this.isValidOffscreenIndex(
        offscreenIndex,
        'setOffscreenMultiplyColorByTextureColor'
      )
    ) {
      return;
    }
    this.setOffscreenMultiplyColorByRGBA(
      offscreenIndex,
      color.r,
      color.g,
      color.b,
      color.a
    );
  }

  /**
   * 设置离屏缓冲的乘色。
   *
   * @param offscreenIndex 离屏缓冲索引
   * @param r 要设置的乘色红色分量
   * @param g 要设置的乘色绿色分量
   * @param b 要设置的乘色蓝色分量
   * @param a 要设置的乘色透明度分量
   */
  public setOffscreenMultiplyColorByRGBA(
    offscreenIndex: number,
    r: number,
    g: number,
    b: number,
    a: number = 1.0
  ): void {
    if (
      !this.isValidOffscreenIndex(
        offscreenIndex,
        'setOffscreenMultiplyColorByRGBA'
      )
    ) {
      return;
    }
    this._userOffscreenMultiplyColors[offscreenIndex].color.r = r;
    this._userOffscreenMultiplyColors[offscreenIndex].color.g = g;
    this._userOffscreenMultiplyColors[offscreenIndex].color.b = b;
    this._userOffscreenMultiplyColors[offscreenIndex].color.a = a;
  }

  /**
   * 从离屏缓冲列表中返回乘色。
   *
   * @param offscreenIndex 离屏缓冲索引
   *
   * @return 乘色（CubismTextureColor）
   */
  public getOffscreenMultiplyColor(offscreenIndex: number): CubismTextureColor {
    if (
      !this.isValidOffscreenIndex(offscreenIndex, 'getOffscreenMultiplyColor')
    ) {
      return new CubismTextureColor(1.0, 1.0, 1.0, 1.0); // 默认离屏缓冲乘色
    }
    if (
      this.getMultiplyColorEnabled() ||
      this.getOffscreenMultiplyColorEnabled(offscreenIndex)
    ) {
      return this._userOffscreenMultiplyColors[offscreenIndex].color;
    }
    return this._model.getOffscreenMultiplyColor(offscreenIndex);
  }

  /**
   * 设置离屏缓冲的屏幕色。
   *
   * @param offscreenIndex 离屏缓冲索引
   * @param color 要设置的屏幕色（CubismTextureColor）
   */
  public setOffscreenScreenColorByTextureColor(
    offscreenIndex: number,
    color: CubismTextureColor
  ): void {
    if (
      !this.isValidOffscreenIndex(
        offscreenIndex,
        'setOffscreenScreenColorByTextureColor'
      )
    ) {
      return;
    }
    this.setOffscreenScreenColorByRGBA(
      offscreenIndex,
      color.r,
      color.g,
      color.b,
      color.a
    );
  }

  /**
   * 设置离屏缓冲的屏幕色。
   *
   * @param offscreenIndex 离屏缓冲索引
   * @param r 要设置的屏幕色红色分量
   * @param g 要设置的屏幕色绿色分量
   * @param b 要设置的屏幕色蓝色分量
   * @param a 要设置的屏幕色透明度分量
   */
  public setOffscreenScreenColorByRGBA(
    offscreenIndex: number,
    r: number,
    g: number,
    b: number,
    a: number = 1.0
  ): void {
    if (
      !this.isValidOffscreenIndex(
        offscreenIndex,
        'setOffscreenScreenColorByRGBA'
      )
    ) {
      return;
    }
    this._userOffscreenScreenColors[offscreenIndex].color.r = r;
    this._userOffscreenScreenColors[offscreenIndex].color.g = g;
    this._userOffscreenScreenColors[offscreenIndex].color.b = b;
    this._userOffscreenScreenColors[offscreenIndex].color.a = a;
  }

  /**
   * 从离屏缓冲列表中返回屏幕色。
   *
   * @param offscreenIndex 离屏缓冲索引
   *
   * @return 屏幕色（CubismTextureColor）
   */
  public getOffscreenScreenColor(offscreenIndex: number): CubismTextureColor {
    if (
      !this.isValidOffscreenIndex(offscreenIndex, 'getOffscreenScreenColor')
    ) {
      return new CubismTextureColor(0.0, 0.0, 0.0, 1.0); // 默认离屏缓冲屏幕色
    }
    if (
      this.getScreenColorEnabled() ||
      this.getOffscreenScreenColorEnabled(offscreenIndex)
    ) {
      return this._userOffscreenScreenColors[offscreenIndex].color;
    }
    return this._model.getOffscreenScreenColor(offscreenIndex);
  }

  /**
   * 设置部件颜色，并向子层级传播（内部方法）
   */
  private setPartColor(
    partIndex: number,
    r: number,
    g: number,
    b: number,
    a: number,
    partColors: Array<ColorData>,
    drawableColors: Array<ColorData>,
    offscreenColors: Array<ColorData>
  ): void {
    partColors[partIndex].color.r = r;
    partColors[partIndex].color.g = g;
    partColors[partIndex].color.b = b;
    partColors[partIndex].color.a = a;

    if (partColors[partIndex].isOverridden) {
      const offscreenIndices = this._model.getPartOffscreenIndices();
      const offscreenIndex = offscreenIndices[partIndex];
      if (offscreenIndex == NoOffscreenIndex) {
        // 未绑定离屏缓冲时，效果应用到子对象。
        const partsHierarchy = this._model.getPartsHierarchy();
        if (partsHierarchy && partsHierarchy[partIndex]) {
          for (let i = 0; i < partsHierarchy[partIndex].objects.length; ++i) {
            const objectInfo = partsHierarchy[partIndex].objects[i];
            if (
              objectInfo.objectType ===
              CubismModelObjectType.CubismModelObjectType_Drawable
            ) {
              const drawableIndex = objectInfo.objectIndex;
              drawableColors[drawableIndex].color.r = r;
              drawableColors[drawableIndex].color.g = g;
              drawableColors[drawableIndex].color.b = b;
              drawableColors[drawableIndex].color.a = a;
            } else {
              const childPartIndex = objectInfo.objectIndex;
              this.setPartColor(
                childPartIndex,
                r,
                g,
                b,
                a,
                partColors,
                drawableColors,
                offscreenColors
              );
            }
          }
        }
      } else {
        // 绑定了离屏缓冲时，只影响该离屏缓冲。
        offscreenColors[offscreenIndex].color.r = r;
        offscreenColors[offscreenIndex].color.g = g;
        offscreenColors[offscreenIndex].color.b = b;
        offscreenColors[offscreenIndex].color.a = a;
      }
    }
  }

  /**
   * 设置部件颜色启用标志，并向子层级传播（内部方法）
   */
  private setPartColorEnabled(
    partIndex: number,
    value: boolean,
    partColors: Array<ColorData>,
    drawableColors: Array<ColorData>,
    offscreenColors: Array<ColorData>
  ): void {
    partColors[partIndex].isOverridden = value;

    const offscreenIndices = this._model.getPartOffscreenIndices();
    const offscreenIndex = offscreenIndices[partIndex];
    if (offscreenIndex == NoOffscreenIndex) {
      // 未绑定离屏缓冲时，效果应用到子对象。
      const partsHierarchy = this._model.getPartsHierarchy();
      if (partsHierarchy && partsHierarchy[partIndex]) {
        for (let i = 0; i < partsHierarchy[partIndex].objects.length; ++i) {
          const objectInfo = partsHierarchy[partIndex].objects[i];
          if (
            objectInfo.objectType ===
            CubismModelObjectType.CubismModelObjectType_Drawable
          ) {
            const drawableIndex = objectInfo.objectIndex;
            drawableColors[drawableIndex].isOverridden = value;
            if (value) {
              drawableColors[drawableIndex].color.r =
                partColors[partIndex].color.r;
              drawableColors[drawableIndex].color.g =
                partColors[partIndex].color.g;
              drawableColors[drawableIndex].color.b =
                partColors[partIndex].color.b;
              drawableColors[drawableIndex].color.a =
                partColors[partIndex].color.a;
            }
          } else {
            const childPartIndex = objectInfo.objectIndex;
            if (value) {
              partColors[childPartIndex].color.r =
                partColors[partIndex].color.r;
              partColors[childPartIndex].color.g =
                partColors[partIndex].color.g;
              partColors[childPartIndex].color.b =
                partColors[partIndex].color.b;
              partColors[childPartIndex].color.a =
                partColors[partIndex].color.a;
            }
            this.setPartColorEnabled(
              childPartIndex,
              value,
              partColors,
              drawableColors,
              offscreenColors
            );
          }
        }
      }
    } else {
      // 绑定了离屏缓冲时，只影响该离屏缓冲。
      offscreenColors[offscreenIndex].isOverridden = value;
      if (value) {
        offscreenColors[offscreenIndex].color.r = partColors[partIndex].color.r;
        offscreenColors[offscreenIndex].color.g = partColors[partIndex].color.g;
        offscreenColors[offscreenIndex].color.b = partColors[partIndex].color.b;
        offscreenColors[offscreenIndex].color.a = partColors[partIndex].color.a;
      }
    }
  }
}
