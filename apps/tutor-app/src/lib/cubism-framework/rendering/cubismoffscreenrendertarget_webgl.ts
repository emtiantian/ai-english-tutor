// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismRenderTarget_WebGL } from './cubismrendertarget_webgl';
import { CubismWebGLOffscreenManager } from './cubismoffscreenmanager';
import { CubismLogError } from '../utils/cubismdebug';

/**
 * WebGL 离屏表面
 * 管理遮罩绘制及离屏功能所需的帧缓冲等。
 */
export class CubismOffscreenRenderTarget_WebGL extends CubismRenderTarget_WebGL {
  /**
   * 初始化资源容器管理器。
   *
   * @param displayBufferWidth 渲染目标宽度
   * @param displayBufferHeight 渲染目标高度
   */
  private initializeOffscreenManager(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    displayBufferWidth: number,
    displayBufferHeight: number
  ): void {
    this._gl = gl;
    this._webGLOffscreenManager = CubismWebGLOffscreenManager.getInstance();
    if (this._webGLOffscreenManager.getContainerSize(gl) === 0) {
      this._webGLOffscreenManager.initialize(
        gl,
        displayBufferWidth,
        displayBufferHeight
      );
    }
  }

  /**
   * 设置离屏绘制渲染目标。
   *
   * @param gl WebGLRenderingContext 或 WebGL2RenderingContext
   *          NOTE: 使用 Cubism 5.3 及以后版本的模型时，请使用 WebGL2RenderingContext。
   * @param displayBufferWidth 渲染目标宽度
   * @param displayBufferHeight 渲染目标高度
   * @param previousFramebuffer 前一个帧缓冲
   */
  public setOffscreenRenderTarget(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    displayBufferWidth: number,
    displayBufferHeight: number,
    previousFramebuffer: WebGLFramebuffer
  ): void {
    // 若管理器不存在则初始化
    if (this._webGLOffscreenManager == null) {
      this.initializeOffscreenManager(
        gl,
        displayBufferWidth,
        displayBufferHeight
      );
    }

    // 获取可用的资源容器
    const offscreenRenderTargetContainer =
      this._webGLOffscreenManager.getOffscreenRenderTargetContainers(
        gl,
        displayBufferWidth,
        displayBufferHeight,
        previousFramebuffer
      );

    if (offscreenRenderTargetContainer == null) {
      CubismLogError('Failed to acquire offscreen render texture container.');
      return;
    }

    this._colorBuffer = offscreenRenderTargetContainer.getColorBuffer();
    this._renderTexture = offscreenRenderTargetContainer.getRenderTexture();

    this._bufferWidth = displayBufferWidth;
    this._bufferHeight = displayBufferHeight;

    this._gl = gl;

    if (this._renderTexture == null) {
      this._renderTexture = previousFramebuffer;
      CubismLogError('Failed to create offscreen render texture.');
    }

    return;
  }

  /**
   * 获取资源容器的使用状态
   *
   * @return 使用中为 true，未使用为 false
   */
  public getUsingRenderTextureState(): boolean {
    if (this._webGLOffscreenManager == null || this._gl == null) {
      return true;
    }

    return this._webGLOffscreenManager.getUsingRenderTextureState(
      this._gl,
      this._renderTexture
    );
  }

  /**
   * 开始使用资源容器。
   */
  public startUsingRenderTexture(): void {
    if (this._webGLOffscreenManager == null || this._gl == null) {
      return;
    }

    this._webGLOffscreenManager.startUsingRenderTexture(
      this._gl,
      this._renderTexture
    );
  }

  /**
   * 结束使用资源容器。
   */
  public stopUsingRenderTexture(): void {
    if (this._webGLOffscreenManager == null || this._gl == null) {
      return;
    }

    this._webGLOffscreenManager.stopUsingRenderTexture(
      this._gl,
      this._renderTexture
    );
  }

  /**
   * 设置离屏索引。
   *
   * @param offscreenIndex 离屏索引
   */
  public setOffscreenIndex(offscreenIndex: number): void {
    this._offscreenIndex = offscreenIndex;
  }

  /**
   * 获取离屏索引。
   *
   * @return 离屏索引
   */
  public getOffscreenIndex(): number {
    return this._offscreenIndex;
  }

  /**
   * 设置之前的离屏绘制渲染目标。
   *
   * @param oldOffscreen 之前的离屏绘制渲染目标
   */
  public setOldOffscreen(
    oldOffscreen: CubismOffscreenRenderTarget_WebGL
  ): void {
    this._oldOffscreen = oldOffscreen;
  }

  /**
   * 获取之前的离屏绘制渲染目标。
   *
   * @return 之前的离屏绘制渲染目标
   */
  public getOldOffscreen(): CubismOffscreenRenderTarget_WebGL {
    return this._oldOffscreen;
  }

  /**
   * 设置父级离屏绘制渲染目标。
   *
   * @param parentOffscreenRenderTarget 父级离屏绘制渲染目标
   */
  public setParentPartOffscreen(
    parentOffscreenRenderTarget: CubismOffscreenRenderTarget_WebGL
  ): void {
    this._parentOffscreenRenderTarget = parentOffscreenRenderTarget;
  }

  /**
   * 获取父级离屏绘制渲染目标。
   *
   * @return 父级离屏绘制渲染目标
   */
  public getParentPartOffscreen(): CubismOffscreenRenderTarget_WebGL {
    return this._parentOffscreenRenderTarget;
  }

  /**
   * 构造函数
   */
  constructor() {
    super();
    this._offscreenIndex = -1;
    this._parentOffscreenRenderTarget = null;
    this._oldOffscreen = null;
    this._webGLOffscreenManager = null;
  }

  public release(): void {
    if (
      this._webGLOffscreenManager != null &&
      this._gl != null &&
      this._renderTexture != null
    ) {
      this._webGLOffscreenManager.stopUsingRenderTexture(
        this._gl,
        this._renderTexture
      );
    }

    if (this._colorBuffer && this._gl) {
      this._gl.deleteTexture(this._colorBuffer);
      this._colorBuffer = null;
    }
    if (this._renderTexture && this._gl) {
      this._gl.deleteFramebuffer(this._renderTexture);
      this._renderTexture = null;
    }

    if (this._webGLOffscreenManager != null) {
      this._webGLOffscreenManager = null;
    }

    this._oldOffscreen = null;
    this._parentOffscreenRenderTarget = null;
  }

  private _offscreenIndex: number; // 离屏索引
  private _parentOffscreenRenderTarget: CubismOffscreenRenderTarget_WebGL; // 父级离屏绘制渲染目标
  private _oldOffscreen: CubismOffscreenRenderTarget_WebGL; // 之前的离屏绘制渲染目标
  private _webGLOffscreenManager: CubismWebGLOffscreenManager; // 离屏绘制渲染目标管理器
  protected _gl: WebGLRenderingContext | WebGL2RenderingContext; // WebGL 上下文
}
