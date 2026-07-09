// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismMath } from '../math/cubismmath';
import { CubismMatrix44 } from '../math/cubismmatrix44';
import { CubismModel } from '../model/cubismmodel';
import { csmRect } from '../type/csmrectf';
import { ICubismClippingManager } from './cubismclippingmanager';
import { CubismLogInfo } from '../utils/cubismdebug';

/**
 * 处理模型渲染的渲染器
 *
 * 子类实现环境相关的绘制指令。
 */
export abstract class CubismRenderer {
  /**
   * 创建并获取渲染器实例
   *
   * @return 渲染器实例
   */
  public static create(): CubismRenderer {
    return null;
  }

  /**
   * 释放渲染器实例
   */
  public static delete(renderer: CubismRenderer): void {
    renderer = null;
  }

  /**
   * 执行渲染器初始化
   * 可从传入的模型中提取初始化所需信息
   *
   * @param model 模型实例
   */
  public initialize(model: CubismModel): void {
    this._model = model;

    // 使用混合模式时必须使用高精度
    if (model.isBlendModeEnabled()) {
      this.useHighPrecisionMask(true);
      CubismLogInfo(
        'This model uses a high-resolution mask because it operates in blend mode.'
      );
    }
  }

  /**
   * 绘制模型
   * @param shaderPath 混合模式着色器路径
   */
  public drawModel(shaderPath: string = null): void {
    if (this.getModel() == null) return;

    // NOTE: 为了 WebGL 优化，默认注释掉
    //this.saveProfile();

    this.doDrawModel(shaderPath);

    // NOTE: 为了 WebGL 优化，默认注释掉
    //this.restoreProfile();
  }

  /**
   * 设置 Model-View-Projection 矩阵
   * 数组会被复制，原始数组可在外部丢弃
   *
   * @param matrix44 Model-View-Projection 矩阵
   */
  public setMvpMatrix(matrix44: CubismMatrix44): void {
    this._mvpMatrix4x4.setMatrix(matrix44.getArray());
  }

  /**
   * 获取 Model-View-Projection 矩阵
   *
   * @return Model-View-Projection 矩阵
   */
  public getMvpMatrix(): CubismMatrix44 {
    return this._mvpMatrix4x4;
  }

  /**
   * 设置模型颜色
   * 各色在 0.0~1.0 之间指定（1.0 为标准状态）
   *
   * @param red 红色通道值
   * @param green 绿色通道值
   * @param blue 蓝色通道值
   * @param alpha α 通道值
   */
  public setModelColor(
    red: number,
    green: number,
    blue: number,
    alpha: number
  ): void {
    this._modelColor.r = CubismMath.clamp(red, 0.0, 1.0);
    this._modelColor.g = CubismMath.clamp(green, 0.0, 1.0);
    this._modelColor.b = CubismMath.clamp(blue, 0.0, 1.0);
    this._modelColor.a = CubismMath.clamp(alpha, 0.0, 1.0);
  }

  /**
   * 获取模型颜色
   * 各色在 0.0~1.0 之间指定（1.0 为标准状态）
   *
   * @return RGBA 颜色信息
   */
  public getModelColor(): CubismTextureColor {
    return JSON.parse(JSON.stringify(this._modelColor));
  }

  /**
   * 计算考虑透明度后的模型颜色。
   *
   * @param opacity 透明度
   *
   * @return RGBA 颜色信息
   */
  getModelColorWithOpacity(opacity: number): CubismTextureColor {
    const modelColorRGBA: CubismTextureColor = this.getModelColor();
    modelColorRGBA.a *= opacity;
    if (this.isPremultipliedAlpha()) {
      modelColorRGBA.r *= modelColorRGBA.a;
      modelColorRGBA.g *= modelColorRGBA.a;
      modelColorRGBA.b *= modelColorRGBA.a;
    }
    return modelColorRGBA;
  }

  /**
   * 设置是否启用预乘 Alpha
   * 启用设为 true，禁用设为 false
   */
  public setIsPremultipliedAlpha(enable: boolean): void {
    this._isPremultipliedAlpha = enable;
  }

  /**
   * 获取是否启用预乘 Alpha
   * @return true 预乘 Alpha 启用
   *         false 预乘 Alpha 禁用
   */
  public isPremultipliedAlpha(): boolean {
    return this._isPremultipliedAlpha;
  }

  /**
   * 设置是否启用剔除（单面绘制）。
   * 启用设为 true，禁用设为 false
   */
  public setIsCulling(culling: boolean): void {
    this._isCulling = culling;
  }

  /**
   * 获取是否启用剔除（单面绘制）。
   *
   * @return true 剔除启用
   *         false 剔除禁用
   */
  public isCulling(): boolean {
    return this._isCulling;
  }

  /**
   * 设置纹理各向异性过滤参数
   * 参数影响程度取决于渲染器实现
   *
   * @param n 参数值
   */
  public setAnisotropy(n: number): void {
    this._anisotropy = n;
  }

  /**
   * 获取纹理各向异性过滤参数
   *
   * @return 各向异性过滤参数
   */
  public getAnisotropy(): number {
    return this._anisotropy;
  }

  /**
   * 获取要渲染的模型
   *
   * @return 要渲染的模型
   */
  public getModel(): CubismModel {
    return this._model;
  }

  /**
   * 更改遮罩绘制方式。
   * false 时，将遮罩分割绘制到一张纹理上（默认）
   * 速度快，但遮罩数量上限为 36，质量也较粗糙
   * true 时，在部件绘制前每次都重绘所需遮罩
   * 渲染质量高，但绘制负载增加
   *
   * @param high 是否切换为高精度遮罩
   */
  public useHighPrecisionMask(high: boolean): void {
    this._useHighPrecisionMask = high;
  }

  /**
   * 获取遮罩绘制方式
   *
   * @return true 高精度方式
   *         false 默认方式
   */
  public isUsingHighPrecisionMask(): boolean {
    return this._useHighPrecisionMask;
  }

  /**
   * 设置绘制模型的缓冲区大小
   *
   * @param[in]   width  -> 绘制模型的缓冲区宽度
   * @param[in]   height -> 绘制模型的缓冲区高度
   */
  public setRenderTargetSize(width: number, height: number): void {
    this._modelRenderTargetWidth = width;
    this._modelRenderTargetHeight = height;
  }

  /**
   * 构造函数
   */
  protected constructor(width: number, height: number) {
    this._modelRenderTargetWidth = width;
    this._modelRenderTargetHeight = height;
    this._isCulling = false;
    this._isPremultipliedAlpha = false;
    this._anisotropy = 0.0;
    this._model = null;
    this._modelColor = new CubismTextureColor();
    this._useHighPrecisionMask = false;

    // 初始化为单位矩阵
    this._mvpMatrix4x4 = new CubismMatrix44();
    this._mvpMatrix4x4.loadIdentity();
  }

  /**
   * 在模型绘制前设置离屏缓冲
   */
  public abstract beforeDrawModelRenderTarget(): void;

  /**
   * 在模型绘制后设置离屏缓冲
   */
  public abstract afterDrawModelRenderTarget(): void;

  /**
   * 模型绘制实现
   * @param shaderPath 混合模式着色器路径
   */
  public abstract doDrawModel(shaderPath: string): void;

  /**
   * 在模型绘制前保存渲染器状态
   */
  protected abstract saveProfile(): void;

  /**
   * 在模型绘制前恢复渲染器状态
   */
  protected abstract restoreProfile(): void;

  /**
   * 释放渲染器持有的静态资源
   */
  public static staticRelease: any;

  protected _mvpMatrix4x4: CubismMatrix44; // Model-View-Projection 矩阵
  protected _modelColor: CubismTextureColor; // 模型自身的颜色（RGBA）
  protected _isCulling: boolean; // 剔除启用时为 true
  protected _isPremultipliedAlpha: boolean; // 预乘 Alpha 时为 true
  protected _anisotropy: any; // 纹理各向异性过滤参数
  protected _model: CubismModel; // 渲染目标模型
  protected _useHighPrecisionMask: boolean; // false 时集中绘制遮罩，true 时每个部件绘制前重绘遮罩

  protected _modelRenderTargetWidth: number;
  protected _modelRenderTargetHeight: number;
}

export enum CubismBlendMode {
  CubismBlendMode_Normal = 0, // 正常
  CubismBlendMode_Additive = 1, // 相加
  CubismBlendMode_Multiplicative = 2 // 相乘
}

/**
 * 对象类型
 */
export enum DrawableObjectType {
  DrawableObjectType_Drawable = 0,
  DrawableObjectType_Offscreen = 1
}

/**
 * 以 RGBA 处理纹理颜色的类
 */
export class CubismTextureColor {
  /**
   * 构造函数
   */
  constructor(r = 1.0, g = 1.0, b = 1.0, a = 1.0) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }

  r: number; // 红色通道
  g: number; // 绿色通道
  b: number; // 蓝色通道
  a: number; // α 通道
}

/**
 * 裁剪遮罩上下文
 */
export abstract class CubismClippingContext {
  /**
   * 带参数的构造函数
   */
  public constructor(clippingDrawableIndices: Int32Array, clipCount: number) {
    // 参与裁剪（即作为遮罩的）Drawable 索引列表
    this._clippingIdList = clippingDrawableIndices;

    // 遮罩数量
    this._clippingIdCount = clipCount;

    this._allClippedDrawRect = new csmRect();
    this._layoutBounds = new csmRect();

    this._clippedDrawableIndexList = [];
    this._clippedOffscreenIndexList = [];

    this._matrixForMask = new CubismMatrix44();
    this._matrixForDraw = new CubismMatrix44();

    this._bufferIndex = 0;
    this._layoutChannelIndex = 0;
  }

  /**
   * 获取管理此遮罩的管理器实例
   * @return 裁剪管理器实例
   */
  public abstract getClippingManager(): ICubismClippingManager;

  /**
   * 析构等价处理
   */
  public release(): void {
    if (this._layoutBounds != null) {
      this._layoutBounds = null;
    }

    if (this._allClippedDrawRect != null) {
      this._allClippedDrawRect = null;
    }

    if (this._clippedDrawableIndexList != null) {
      this._clippedDrawableIndexList = null;
    }
    if (this._clippedOffscreenIndexList != null) {
      this._clippedOffscreenIndexList = null;
    }
  }

  /**
   * 添加被此遮罩裁剪的绘制对象
   *
   * @param drawableIndex 要添加为裁剪目标的绘制对象索引
   */
  public addClippedDrawable(drawableIndex: number) {
    this._clippedDrawableIndexList.push(drawableIndex);
  }

  /**
   * 添加被此遮罩裁剪的离屏对象
   *
   * @param offscreenIndex 要添加为裁剪目标的离屏对象索引
   */
  public addClippedOffscreen(offscreenIndex: number) {
    this._clippedOffscreenIndexList.push(offscreenIndex);
  }

  public _isUsing: boolean; // 当前绘制状态下需要准备遮罩时为 true
  public readonly _clippingIdList: Int32Array; // 裁剪遮罩 ID 列表
  public _clippingIdCount: number; // 裁剪遮罩数量
  public _layoutChannelIndex: number; // 该裁剪布局到 RGBA 的哪个通道（0:R, 1:G, 2:B, 3:A）
  public _layoutBounds: csmRect; // 在遮罩通道的哪个区域放置遮罩（View 坐标 -1~1，UV 换算为 0~1）
  public _allClippedDrawRect: csmRect; // 本次裁剪中所有被裁剪绘制对象的包围矩形（每帧更新）
  public _matrixForMask: CubismMatrix44; // 保存遮罩位置计算结果的矩阵
  public _matrixForDraw: CubismMatrix44; // 保存绘制对象位置计算结果的矩阵
  public _clippedDrawableIndexList: number[]; // 被该遮罩裁剪的绘制对象列表
  public _clippedOffscreenIndexList: number[]; // 被该遮罩裁剪的离屏对象列表
  public _bufferIndex: number; // 该遮罩被分配的渲染纹理（帧缓冲）或颜色缓冲索引
}

// Namespace definition for compatibility.
import * as $ from './cubismrenderer';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismBlendMode = $.CubismBlendMode;
  export type CubismBlendMode = $.CubismBlendMode;
  export const CubismRenderer = $.CubismRenderer;
  export type CubismRenderer = $.CubismRenderer;
  export const CubismTextureColor = $.CubismTextureColor;
  export type CubismTextureColor = $.CubismTextureColor;
}
