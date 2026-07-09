// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismLogError } from '../utils/cubismdebug';

/**
 * WebGL 离屏表面
 * 管理绘制遮罩所需的帧缓冲区等。
 */
export class CubismRenderTarget_WebGL {
  /**
   * 使用 WebGL2RenderingContext.blitFramebuffer() 复制缓冲。
   *
   * @param src 源离屏表面
   * @param dst 目标离屏表面
   */
  public static copyBuffer(
    gl: WebGL2RenderingContext,
    src: CubismRenderTarget_WebGL,
    dst: CubismRenderTarget_WebGL
  ): void {
    if (src == null || dst == null) {
      return;
    }

    if (!(gl instanceof WebGL2RenderingContext)) {
      throw new Error('WebGL2RenderingContext is required for buffer copy.');
    }

    const previousFramebuffer = gl.getParameter(
      gl.FRAMEBUFFER_BINDING
    ) as WebGLFramebuffer;

    // 绑定各离屏表面的渲染纹理
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src.getRenderTexture());
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst.getRenderTexture());

    // 执行缓冲复制
    gl.blitFramebuffer(
      0,
      0,
      src.getBufferWidth(),
      src.getBufferHeight(),
      0,
      0,
      dst.getBufferWidth(),
      dst.getBufferHeight(),
      gl.COLOR_BUFFER_BIT,
      gl.NEAREST
    );

    // 复制后恢复原始帧缓冲
    gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
  }

  /**
   * 开始绘制。
   *
   * @param restoreFbo 指定 endDraw 时要恢复的 FBO。传入 null 则会在 beginDraw 时记住当前 FBO。
   */
  public beginDraw(restoreFbo: WebGLFramebuffer = null): void {
    if (this._renderTexture == null) {
      console.error('_renderTexture is null');
      return;
    }

    // 记住后台缓冲表面。
    if (restoreFbo == null) {
      this._oldFbo = this._gl.getParameter(this._gl.FRAMEBUFFER_BINDING);
    } else {
      this._oldFbo = restoreFbo;
    }

    // 激活 RenderTexture
    this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, this._renderTexture);
  }

  /**
   * 结束绘制，恢复后台缓冲表面。
   */
  public endDraw(): void {
    // 恢复后台缓冲表面
    this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, this._oldFbo);
  }

  /**
   * 清除已绑定的颜色缓冲。
   *
   * @param r 红色分量 (0.0 - 1.0)
   * @param g 绿色分量 (0.0 - 1.0)
   * @param b 蓝色分量 (0.0 - 1.0)
   * @param a 透明分量 (0.0 - 1.0)
   */
  public clear(r: number, g: number, b: number, a: number): void {
    // 清除处理
    this._gl.clearColor(r, g, b, a);
    this._gl.clear(this._gl.COLOR_BUFFER_BIT);
  }

  /**
   * 创建离屏表面。
   *
   * @param gl WebGLRenderingContext 或 WebGL2RenderingContext
   *          NOTE: 使用 Cubism 5.3 及以后版本的模型时，请使用 WebGL2RenderingContext。
   * @param displayBufferWidth 离屏表面宽度
   * @param displayBufferHeight 离屏表面高度
   * @param previousFramebuffer 前一个帧缓冲
   *
   * @return 成功返回 true，失败返回 false
   */
  public createRenderTarget(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    displayBufferWidth: number,
    displayBufferHeight: number,
    previousFramebuffer: WebGLFramebuffer
  ): boolean {
    this.destroyRenderTarget();

    this._colorBuffer = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this._colorBuffer);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      displayBufferWidth,
      displayBufferHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.bindTexture(gl.TEXTURE_2D, null);

    // 创建帧缓冲
    const ret = gl.createFramebuffer();
    if (ret == null) {
      CubismLogError('Failed to create framebuffer');
      return false;
    }

    // 绑定创建的帧缓冲
    gl.bindFramebuffer(gl.FRAMEBUFFER, ret);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this._colorBuffer,
      0
    );

    // 检查状态
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);

    // 帧缓冲不完整时输出错误并恢复之前的帧缓冲
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      CubismLogError('Framebuffer is not complete');
      gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
      gl.deleteFramebuffer(ret);

      this.destroyRenderTarget();

      return false;
    }

    this._renderTexture = ret;
    this._bufferWidth = displayBufferWidth;
    this._bufferHeight = displayBufferHeight;

    this._gl = gl;

    return true;
  }

  /**
   * 销毁渲染目标。
   */
  public destroyRenderTarget(): void {
    if (this._colorBuffer) {
      this._gl.bindTexture(this._gl.TEXTURE_2D, null);
      this._gl.deleteTexture(this._colorBuffer);
      this._colorBuffer = null;
    }

    if (this._renderTexture) {
      this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, null);
      this._gl.deleteFramebuffer(this._renderTexture);
      this._renderTexture = null;
    }
  }

  /**
   * 获取 WebGL 上下文。
   *
   * @return WebGLRenderingContext 或 WebGL2RenderingContext
   */
  public getGL(): WebGLRenderingContext | WebGL2RenderingContext {
    return this._gl;
  }

  /**
   * 获取渲染纹理。
   *
   * @return WebGLFramebuffer
   */
  public getRenderTexture(): WebGLFramebuffer {
    return this._renderTexture;
  }

  /**
   * 获取颜色缓冲。
   *
   * @return WebGLTexture
   */
  public getColorBuffer(): WebGLTexture {
    return this._colorBuffer;
  }

  /**
   * 获取颜色缓冲宽度。
   *
   * @return 颜色缓冲宽度
   */
  public getBufferWidth(): number {
    return this._bufferWidth;
  }

  /**
   * 获取颜色缓冲高度。
   *
   * @return 颜色缓冲高度
   */
  public getBufferHeight(): number {
    return this._bufferHeight;
  }

  /**
   * 检查离屏表面是否有效。
   *
   * @return 有效返回 true，无效返回 false
   */
  public isValid(): boolean {
    return this._renderTexture != null;
  }

  /**
   * 获取之前的帧缓冲。
   *
   * @return 之前的帧缓冲
   */
  public getOldFBO(): WebGLFramebuffer {
    return this._oldFbo;
  }

  /**
   * 构造函数
   */
  constructor() {
    this._gl = null;
    this._colorBuffer = null;
    this._renderTexture = null;
    this._bufferWidth = 0;
    this._bufferHeight = 0;
    this._oldFbo = null;
  }

  protected _gl: WebGLRenderingContext | WebGL2RenderingContext; // WebGL 上下文
  protected _colorBuffer: WebGLTexture; // 颜色缓冲
  protected _renderTexture: WebGLFramebuffer; // 帧缓冲
  protected _bufferWidth: number; // 颜色缓冲宽度
  protected _bufferHeight: number; // 颜色缓冲高度
  private _oldFbo: WebGLFramebuffer; // 之前的帧缓冲
}

// 兼容性命名空间定义。
import * as $ from './cubismrendertarget_webgl';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismOffscreenSurface_WebGL = $.CubismRenderTarget_WebGL;
  export type CubismOffscreenSurface_WebGL = $.CubismRenderTarget_WebGL;
}
