// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { updateSize } from '../utils/cubismarrayutils';
import { CubismLogError } from '../utils/cubismdebug';
import { CubismRenderTarget_WebGL } from './cubismrendertarget_webgl';

/**
 * 帧缓冲等容器类
 */
class CubismRenderTargetContainer {
  /**
   * 构造函数
   *
   * @param colorBuffer 颜色缓冲
   * @param renderTexture 渲染纹理
   * @param inUse 是否正在使用
   */
  public constructor(
    colorBuffer: WebGLTexture = null,
    renderTexture: WebGLFramebuffer = null,
    inUse: boolean = false
  ) {
    this.colorBuffer = colorBuffer;
    this.renderTexture = renderTexture;
    this.inUse = inUse;
  }

  public clear(): void {
    this.colorBuffer = null;
    this.renderTexture = null;
    this.inUse = false;
  }

  /**
   * 获取颜色缓冲
   *
   * @returns 颜色缓冲
   */
  public getColorBuffer(): WebGLTexture {
    return this.colorBuffer;
  }

  /**
   * 获取渲染纹理
   *
   * @returns 渲染纹理
   */
  public getRenderTexture(): WebGLFramebuffer {
    return this.renderTexture;
  }

  public colorBuffer: WebGLTexture; // 颜色缓冲
  public renderTexture: WebGLFramebuffer; // 渲染目标
  public inUse: boolean; // 该容器的渲染目标是否正在使用
}

/**
 * 按 WebGL 上下文管理资源的内部类
 */
class CubismWebGLContextManager {
  constructor(gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.gl = gl;
    this.offscreenRenderTargetContainers =
      new Array<CubismRenderTargetContainer>();
    this.previousActiveRenderTextureMaxCount = 0;
    this.currentActiveRenderTextureCount = 0;
    this.hasResetThisFrame = false;
    this.width = 0;
    this.height = 0;
  }

  public release(): void {
    if (this.offscreenRenderTargetContainers != null) {
      for (
        let index = 0;
        index < this.offscreenRenderTargetContainers.length;
        ++index
      ) {
        const container = this.offscreenRenderTargetContainers[index];
        this.gl.deleteTexture(container.colorBuffer);
        this.gl.deleteFramebuffer(container.renderTexture);
      }
      this.offscreenRenderTargetContainers.length = 0;
      this.offscreenRenderTargetContainers = null;
    }
  }

  public gl: WebGLRenderingContext | WebGL2RenderingContext; // WebGL 上下文
  public offscreenRenderTargetContainers: Array<CubismRenderTargetContainer>; // 离屏绘制渲染目标列表
  public previousActiveRenderTextureMaxCount: number; // 上一帧活跃渲染目标的最大数量
  public currentActiveRenderTextureCount: number; // 当前活跃渲染目标的数量
  public hasResetThisFrame: boolean; // 当前帧是否已重置
  public width: number; // 宽度
  public height: number; // 高度
}

/**
 * 管理 WebGL 离屏绘制功能的管理器
 * 管理离屏绘制功能所需的帧缓冲等容器。
 * 支持多个 WebGL 上下文。
 */
export class CubismWebGLOffscreenManager {
  /**
   * 构造函数
   */
  private constructor() {
    this._contextManagers = new Map<
      WebGLRenderingContext | WebGL2RenderingContext,
      CubismWebGLContextManager
    >();
  }

  /**
   * 相当于析构函数的处理
   */
  public release(): void {
    if (this._contextManagers != null) {
      for (const manager of this._contextManagers.values()) {
        manager.release();
      }
      this._contextManagers.clear();
      this._contextManagers = null;
    }
    CubismWebGLOffscreenManager._instance = null;
  }

  /**
   * 获取实例
   *
   * @return 实例
   */
  public static getInstance(): CubismWebGLOffscreenManager {
    if (this._instance == null) {
      this._instance = new CubismWebGLOffscreenManager();
    }

    return this._instance;
  }

  /**
   * 获取或创建对应 WebGL 上下文的管理器
   *
   * @param gl WebGLRenderingContext 或 WebGL2RenderingContext
   * @return WebGLContextManager
   */
  private getContextManager(
    gl: WebGLRenderingContext | WebGL2RenderingContext
  ): CubismWebGLContextManager {
    if (!this._contextManagers.has(gl)) {
      this._contextManagers.set(gl, new CubismWebGLContextManager(gl));
    }
    return this._contextManagers.get(gl);
  }

  /**
   * 删除指定 WebGL 上下文的管理器
   *
   * @param gl WebGLRenderingContext 或 WebGL2RenderingContext
   */
  public removeContext(
    gl: WebGLRenderingContext | WebGL2RenderingContext
  ): void {
    if (this._contextManagers.has(gl)) {
      const manager = this._contextManagers.get(gl);
      manager.release();
      this._contextManagers.delete(gl);
    }
  }

  /**
   * 初始化处理
   *
   * @param gl WebGLRenderingContext 或 WebGL2RenderingContext
   * @param width 宽度
   * @param height 高度
   */
  public initialize(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    width: number,
    height: number
  ): void {
    const contextManager = this.getContextManager(gl);

    // 初始化离屏渲染目标容器
    if (contextManager.offscreenRenderTargetContainers != null) {
      for (
        let index = 0;
        index < contextManager.offscreenRenderTargetContainers.length;
        ++index
      ) {
        const container = contextManager.offscreenRenderTargetContainers[index];
        contextManager.gl.deleteTexture(container.colorBuffer);
        contextManager.gl.deleteFramebuffer(container.renderTexture);
        container.clear();
      }
      contextManager.offscreenRenderTargetContainers.length = 0;
    } else {
      contextManager.offscreenRenderTargetContainers =
        new Array<CubismRenderTargetContainer>();
    }

    contextManager.width = width;
    contextManager.height = height;
    contextManager.previousActiveRenderTextureMaxCount = 0;
    contextManager.currentActiveRenderTextureCount = 0;
    contextManager.hasResetThisFrame = false;
  }

  /**
   * 执行绘制模型前帧开始时的处理
   *
   * @param gl WebGLRenderingContext 或 WebGL2RenderingContext
   */
  public beginFrameProcess(
    gl: WebGLRenderingContext | WebGL2RenderingContext
  ): void {
    const contextManager = this.getContextManager(gl);
    if (contextManager.hasResetThisFrame) {
      return;
    }
    contextManager.previousActiveRenderTextureMaxCount = 0;
    contextManager.hasResetThisFrame = true;
  }

  /**
   * 执行模型绘制结束后帧结束时的处理
   *
   * @param gl WebGLRenderingContext 或 WebGL2RenderingContext
   */
  public endFrameProcess(
    gl: WebGLRenderingContext | WebGL2RenderingContext
  ): void {
    const contextManager = this.getContextManager(gl);
    contextManager.hasResetThisFrame = false;
  }

  /**
   * 获取容器大小
   *
   * @param gl WebGLRenderingContext 或 WebGL2RenderingContext
   */
  public getContainerSize(
    gl: WebGLRenderingContext | WebGL2RenderingContext
  ): number {
    const contextManager = this.getContextManager(gl);
    if (contextManager.offscreenRenderTargetContainers == null) {
      return 0;
    }
    return contextManager.offscreenRenderTargetContainers.length;
  }

  /**
   * 获取可用的资源容器
   *
   * @param gl WebGLRenderingContext 或 WebGL2RenderingContext
   * @param width 宽度
   * @param height 高度
   * @param previousFramebuffer 前一个帧缓冲
   * @return 可用的资源容器
   */
  public getOffscreenRenderTargetContainers(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    width: number,
    height: number,
    previousFramebuffer: WebGLFramebuffer
  ): CubismRenderTargetContainer {
    const contextManager = this.getContextManager(gl);

    // 容器未初始化或尺寸变化时重新初始化
    if (
      contextManager.width != width ||
      contextManager.height != height ||
      contextManager.offscreenRenderTargetContainers == null
    ) {
      this.initialize(gl, width, height);
    }

    // 更新使用数量
    this.updateRenderTargetContainerCount(gl);

    // 如果有未使用的资源容器，则直接返回
    const container = this.getUnusedOffscreenRenderTargetContainer(gl);
    if (container != null) {
      return container;
    }

    // 没有未使用的资源容器，则创建新的
    const offscreenRenderTextureContainer =
      this.createOffscreenRenderTargetContainer(
        gl,
        width,
        height,
        previousFramebuffer
      );

    return offscreenRenderTextureContainer;
  }

  /**
   * 获取资源容器的使用状态
   *
   * @param gl WebGLRenderingContext 或 WebGL2RenderingContext
   * @param renderTexture WebGLFramebuffer
   * @return 使用中为 true，未使用为 false
   */
  public getUsingRenderTextureState(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    renderTexture: WebGLFramebuffer
  ): boolean {
    const contextManager = this.getContextManager(gl);
    for (
      let index = 0;
      index < contextManager.offscreenRenderTargetContainers.length;
      ++index
    ) {
      if (
        contextManager.offscreenRenderTargetContainers[index].renderTexture ==
        renderTexture
      ) {
        return contextManager.offscreenRenderTargetContainers[index].inUse;
      }
    }
    return true;
  }

  /**
   * 开始使用资源容器。
   *
   * @param gl WebGLRenderingContext 或 WebGL2RenderingContext
   * @param renderTexture WebGLFramebuffer
   */
  public startUsingRenderTexture(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    renderTexture: WebGLFramebuffer
  ): void {
    const contextManager = this.getContextManager(gl);
    for (
      let index = 0;
      index < contextManager.offscreenRenderTargetContainers.length;
      ++index
    ) {
      if (
        contextManager.offscreenRenderTargetContainers[index].renderTexture !=
        renderTexture
      ) {
        continue;
      }

      contextManager.offscreenRenderTargetContainers[index].inUse = true;

      this.updateRenderTargetContainerCount(gl);

      break;
    }
  }

  /**
   * 结束使用资源容器。
   *
   * @param gl WebGLRenderingContext 或 WebGL2RenderingContext
   * @param renderTexture WebGLFramebuffer
   */
  public stopUsingRenderTexture(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    renderTexture: WebGLFramebuffer
  ): void {
    const contextManager = this.getContextManager(gl);
    for (
      let index = 0;
      index < contextManager.offscreenRenderTargetContainers.length;
      ++index
    ) {
      if (
        contextManager.offscreenRenderTargetContainers[index].renderTexture !=
        renderTexture
      ) {
        continue;
      }

      contextManager.offscreenRenderTargetContainers[index].inUse = false;

      contextManager.currentActiveRenderTextureCount--;
      if (contextManager.currentActiveRenderTextureCount < 0) {
        contextManager.currentActiveRenderTextureCount = 0;
      }
      break;
    }
  }

  /**
   * 结束所有资源容器的使用。
   *
   * @param gl WebGLRenderingContext 或 WebGL2RenderingContext
   */
  public stopUsingAllRenderTextures(
    gl: WebGLRenderingContext | WebGL2RenderingContext
  ): void {
    const contextManager = this.getContextManager(gl);
    for (
      let index = 0;
      index < contextManager.offscreenRenderTargetContainers.length;
      ++index
    ) {
      contextManager.offscreenRenderTargetContainers[index].inUse = false;
    }

    contextManager.currentActiveRenderTextureCount = 0;
  }

  /**
   * 释放未使用的资源容器。
   *
   * @param gl WebGLRenderingContext 或 WebGL2RenderingContext
   */
  public releaseStaleRenderTextures(
    gl: WebGLRenderingContext | WebGL2RenderingContext
  ): void {
    const contextManager = this.getContextManager(gl);
    const listSize = contextManager.offscreenRenderTargetContainers.length;

    if (contextManager.hasResetThisFrame || listSize === 0) {
      // 如果使用量发生变化，则不释放
      return;
    }

    // 释放未使用的位置，并调整到上一帧最大数量的大小
    let findPos = 0;
    let resize = contextManager.previousActiveRenderTextureMaxCount;
    for (
      let i = listSize;
      contextManager.previousActiveRenderTextureMaxCount < i;
      --i
    ) {
      const index = i - 1;
      if (contextManager.offscreenRenderTargetContainers[index].inUse) {
        // 寻找空闲位置并移动过去
        let isFind = false;
        for (
          ;
          findPos < contextManager.previousActiveRenderTextureMaxCount;
          ++findPos
        ) {
          if (!contextManager.offscreenRenderTargetContainers[findPos].inUse) {
            const tempContainer =
              contextManager.offscreenRenderTargetContainers[findPos];
            contextManager.offscreenRenderTargetContainers[findPos] =
              contextManager.offscreenRenderTargetContainers[index];
            contextManager.offscreenRenderTargetContainers[findPos].inUse =
              true;
            contextManager.offscreenRenderTargetContainers[index] =
              tempContainer;
            contextManager.offscreenRenderTargetContainers[index].inUse = false;
            isFind = true;
            break;
          }
        }
        if (!isFind) {
          // 如果找不到空闲位置，则按当前大小调整
          resize = i;
          break;
        }
      }
      const container = contextManager.offscreenRenderTargetContainers[index];
      contextManager.gl.bindTexture(contextManager.gl.TEXTURE_2D, null);
      contextManager.gl.deleteTexture(container.colorBuffer);
      contextManager.gl.bindFramebuffer(contextManager.gl.FRAMEBUFFER, null);
      contextManager.gl.deleteFramebuffer(container.renderTexture);
      container.clear();
    }
    updateSize(contextManager.offscreenRenderTargetContainers, resize);
  }

  /**
   * 获取上一帧活跃渲染目标的最大数量
   *
   * @param gl WebGLRenderingContext 或 WebGL2RenderingContext
   * @returns 上一帧活跃渲染目标的最大数量
   */
  public getPreviousActiveRenderTextureCount(
    gl: WebGLRenderingContext | WebGL2RenderingContext
  ): number {
    const contextManager = this.getContextManager(gl);
    return contextManager.previousActiveRenderTextureMaxCount;
  }

  /**
   * 获取当前活跃渲染目标的数量
   *
   * @param gl WebGLRenderingContext 或 WebGL2RenderingContext
   * @returns 当前活跃渲染目标的数量
   */
  public getCurrentActiveRenderTextureCount(
    gl: WebGLRenderingContext | WebGL2RenderingContext
  ): number {
    const contextManager = this.getContextManager(gl);
    return contextManager.currentActiveRenderTextureCount;
  }

  /**
   * 更新当前活跃渲染目标的数量
   *
   * @param gl WebGLRenderingContext 或 WebGL2RenderingContext
   */
  public updateRenderTargetContainerCount(
    gl: WebGLRenderingContext | WebGL2RenderingContext
  ): void {
    const contextManager = this.getContextManager(gl);
    ++contextManager.currentActiveRenderTextureCount;

    // 更新最大值
    contextManager.previousActiveRenderTextureMaxCount =
      contextManager.currentActiveRenderTextureCount >
      contextManager.previousActiveRenderTextureMaxCount
        ? contextManager.currentActiveRenderTextureCount
        : contextManager.previousActiveRenderTextureMaxCount;
  }

  /**
   * 获取未使用的资源容器
   *
   * @param gl WebGLRenderingContext 或 WebGL2RenderingContext
   * @return 未使用的资源容器
   */
  public getUnusedOffscreenRenderTargetContainer(
    gl: WebGLRenderingContext | WebGL2RenderingContext
  ): CubismRenderTargetContainer {
    const contextManager = this.getContextManager(gl);
    // 如果有未使用的资源容器，则直接返回
    for (
      let index = 0;
      index < contextManager.offscreenRenderTargetContainers.length;
      ++index
    ) {
      const container = contextManager.offscreenRenderTargetContainers[index];
      if (container.inUse == false) {
        container.inUse = true;
        return container;
      }
    }
    return null;
  }

  /**
   * 创建新的资源容器。
   *
   * @param gl WebGLRenderingContext 或 WebGL2RenderingContext
   * @param width 宽度
   * @param height 高度
   * @param previousFramebuffer 前一个帧缓冲
   * @return 创建的资源容器
   */
  public createOffscreenRenderTargetContainer(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    width: number,
    height: number,
    previousFramebuffer: WebGLFramebuffer
  ): CubismRenderTargetContainer {
    const renderTarget = new CubismRenderTarget_WebGL();

    if (
      !renderTarget.createRenderTarget(gl, width, height, previousFramebuffer)
    ) {
      CubismLogError('Failed to create offscreen render texture.');
      return null;
    }

    const offscreenRenderTextureContainer = new CubismRenderTargetContainer(
      renderTarget.getColorBuffer(),
      renderTarget.getRenderTexture(),
      true
    );

    const contextManager = this.getContextManager(gl);
    contextManager.offscreenRenderTargetContainers.push(
      offscreenRenderTextureContainer
    );

    return offscreenRenderTextureContainer;
  }

  private static _instance: CubismWebGLOffscreenManager; // 离屏绘制渲染目标管理器
  private _contextManagers: Map<
    WebGLRenderingContext | WebGL2RenderingContext,
    CubismWebGLContextManager
  >; // 每个 WebGL 上下文对应的管理器
}
