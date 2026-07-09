// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismMatrix44 } from '../math/cubismmatrix44';
import {
  CubismColorBlend,
  CubismModel,
  CubismAlphaBlend
} from '../model/cubismmodel';
import { csmRect } from '../type/csmrectf';
import { CubismLogError, CubismLogWarning } from '../utils/cubismdebug';
import { CubismRenderTarget_WebGL } from './cubismrendertarget_webgl';
import { CubismOffscreenRenderTarget_WebGL } from './cubismoffscreenrendertarget_webgl';
import { CubismBlendMode, CubismTextureColor } from './cubismrenderer';
import { CubismRenderer_WebGL } from './cubismrenderer_webgl';
import { Shaders } from './shaders';

// 着色器
const VertShaderSrcPath = 'vertshadersrc.vert';
const VertShaderSrcMaskedPath = 'vertshadersrcmasked.vert';
const VertShaderSrcSetupMaskPath = 'vertshadersrcsetupmask.vert';
const FragShaderSrcSetupMaskPath = 'fragshadersrcsetupmask.frag';
const FragShaderSrcPremultipliedAlphaPath =
  'fragshadersrcpremultipliedalpha.frag';
const FragShaderSrcMaskPremultipliedAlphaPath =
  'fragshadersrcmaskpremultipliedalpha.frag';
const FragShaderSrcMaskInvertedPremultipliedAlphaPath =
  'fragshadersrcmaskinvertedpremultipliedalpha.frag';

// 复制与混合着色器
const VertShaderSrcCopyPath = 'vertshadersrccopy.vert';
const FragShaderSrcCopyPath = 'fragshadersrccopy.frag';
const FragShaderSrcColorBlendPath = 'fragshadersrccolorblend.frag';
const FragShaderSrcAlphaBlendPath = 'fragshadersrcalphablend.frag';
const VertShaderSrcBlendPath = 'vertshadersrcblend.vert';
const FragShaderSrcBlendPath = 'fragshadersrcpremultipliedalphablend.frag';

// 混合模式前缀
const ColorBlendPrefix = 'ColorBlend_';
const AlphaBlendPrefix = 'AlphaBlend_';

let s_instance: CubismShaderManager_WebGL; // 实例（单例）

const s_renderTargetVertexArray: Float32Array = new Float32Array([
  -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0
]);
const s_renderTargetUvArray: Float32Array = new Float32Array([
  0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 1.0, 1.0
]);
const s_renderTargetReverseUvArray = new Float32Array([
  0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0
]);

/**
 * 生成并销毁 WebGL 着色器程序的类
 */
export class CubismShader_WebGL {
  /**
   * 异步从路径读取着色器
   *
   * @param url 着色器 URL
   *
   * @return 着色器源码
   */
  private async loadShader(url: string): Promise<string> {
    // 使用同步 XMLHttpRequest，避免某些环境下 fetch 卡住
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.onload = () => resolve(xhr.responseText || '');
      xhr.onerror = () => {
        console.error('[Shader] XHR error for', url);
        resolve('');
      };
      xhr.ontimeout = () => {
        console.error('[Shader] XHR timeout for', url);
        resolve('');
      };
      xhr.timeout = 5000;
      xhr.send();
    });
  }

  /**
   * 读取混合模式用着色器
   */
  private async loadShaders(): Promise<void> {
    // 使用内联着色器源码，避免异步 fetch 问题
    (this as any)['_vertShaderSrc'] = Shaders.vertshadersrc_vert;
    (this as any)['_vertShaderSrcMasked'] = Shaders.vertshadersrcmasked_vert;
    (this as any)['_vertShaderSrcSetupMask'] = Shaders.vertshadersrcsetupmask_vert;
    (this as any)['_fragShaderSrcSetupMask'] = Shaders.fragshadersrcsetupmask_frag;
    (this as any)['_fragShaderSrcPremultipliedAlpha'] = Shaders.fragshadersrcpremultipliedalpha_frag;
    (this as any)['_fragShaderSrcMaskPremultipliedAlpha'] = Shaders.fragshadersrcmaskpremultipliedalpha_frag;
    (this as any)['_fragShaderSrcMaskInvertedPremultipliedAlpha'] = Shaders.fragshadersrcmaskinvertedpremultipliedalpha_frag;
    (this as any)['_vertShaderSrcCopy'] = Shaders.vertshadersrccopy_vert;
    (this as any)['_fragShaderSrcCopy'] = Shaders.fragshadersrccopy_frag;
    (this as any)['_fragShaderSrcColorBlend'] = Shaders.fragshadersrccolorblend_frag;
    (this as any)['_fragShaderSrcAlphaBlend'] = Shaders.fragshadersrcalphablend_frag;
    (this as any)['_vertShaderSrcBlend'] = Shaders.vertshadersrcblend_vert;
    (this as any)['_fragShaderSrcBlend'] = Shaders.fragshadersrcpremultipliedalphablend_frag;
  }

  /**
   * 构造函数
   */
  public constructor() {
    this._shaderSets = new Array<CubismShaderSet>();
    this._isShaderLoading = false;
    this._isShaderLoaded = false;
    this._instanceId = ++CubismShader_WebGL._instanceCounter;

    // 颜色混合用映射
    this._colorBlendMap = new Map<CubismColorBlend, string>();
    this._colorBlendValues = new Array<CubismColorBlend>();

    const colorBlendKeys = Object.keys(CubismColorBlend);

    // Object.values() 的 polyfill
    const colorBlendRawValues = Object.keys(CubismColorBlend).map(
      k => CubismColorBlend[k as keyof typeof CubismColorBlend]
    );

    for (let i = 0; i < colorBlendKeys.length; i++) {
      const colorBlendKey = colorBlendKeys[i];

      if (colorBlendKey.includes(ColorBlendPrefix)) {
        const blendModeName = colorBlendKey.slice(ColorBlendPrefix.length);

        const colorBlendNumber = parseInt(colorBlendRawValues[i].toString());

        this._colorBlendMap.set(colorBlendNumber, blendModeName);

        this._colorBlendValues.push(colorBlendNumber);
      }
    }

    // 透明度混合用映射
    this._alphaBlendMap = new Map<CubismAlphaBlend, string>();
    this._alphaBlendValues = new Array<CubismAlphaBlend>();

    const alphaBlendKeys = Object.keys(CubismAlphaBlend);

    // Object.values() 的 polyfill
    const alphaBlendRawValues = Object.keys(CubismAlphaBlend).map(
      k => CubismAlphaBlend[k as keyof typeof CubismAlphaBlend]
    );

    for (let i = 0; i < alphaBlendKeys.length; i++) {
      const alphaBlendKey = alphaBlendKeys[i];

      if (alphaBlendKey.includes(AlphaBlendPrefix)) {
        const blendModeName = alphaBlendKey.slice(AlphaBlendPrefix.length);

        const alphaBlendNumber = parseInt(alphaBlendRawValues[i].toString());

        this._alphaBlendMap.set(alphaBlendNumber, blendModeName);

        this._alphaBlendValues.push(alphaBlendNumber);
      }
    }

    this._blendShaderSetMap = new Map<string, number>();

    this._shaderCount =
      ShaderNames.ShaderNames_ShaderCount +
      1 +
      (this._colorBlendValues.length - 3) *
        (this._alphaBlendValues.length - 1) *
        3;
    // 着色器数量 =
    // （遮罩生成用 + (普通 + 加算 + 乘算) * (无遮罩的预乘 alpha 版 + 有遮罩的预乘 alpha 版 + 有遮罩反转的预乘 alpha 版)）
    // + 1（复制用着色器）
    // + 颜色混合数量（排除向后兼容和 None） * 透明度混合数量（排除 None） * （普通 + 遮罩 + 反转遮罩）

    this._defaultShaderPath = '/shaders/WebGL/';
    this._shaderPath = this._defaultShaderPath;
  }

  /**
   * 析构对应处理
   */
  public release(): void {
    this.releaseShaderProgram();
  }

  /**
   * 执行绘制用着色器程序的一整套设置
   *
   * @param renderer 渲染器
   * @param model 绘制对象模型
   * @param index 绘制对象网格的索引
   */
  public setupShaderProgramForDrawable(
    renderer: CubismRenderer_WebGL,
    model: Readonly<CubismModel>,
    index: number
  ): void {
    if (!renderer.isPremultipliedAlpha()) {
      CubismLogError('NoPremultipliedAlpha is not allowed');
    }

    if (this._shaderSets.length == 0) {
      this.generateShaders();
    }

    if (this._isShaderLoaded == false) {
      console.warn('[Shader] instance#' + this._instanceId + ' drawable: _isShaderLoaded=false, sets=' + this._shaderSets.length);
      CubismLogWarning('Shader program is not initialized.');
      return;
    }

    // 混合
    let srcColor: number;
    let dstColor: number;
    let srcAlpha: number;
    let dstAlpha: number;

    // 计算 _shaderSets 用的偏移
    const masked: boolean =
      renderer.getClippingContextBufferForDrawable() != null; // 该绘制对象是否被遮罩
    const invertedMask: boolean = model.getDrawableInvertedMaskBit(index);
    const offset: number = masked ? (invertedMask ? 2 : 1) : 0;

    let shaderSet: CubismShaderSet;
    // 使用 Cubism 5.2 及以前版本着色器时为 true
    let isUsingCompatible: boolean = true;

    if (model.isBlendModeEnabled()) {
      const colorBlendMode: CubismColorBlend =
        model.getDrawableColorBlend(index);
      const alphaBlendMode: CubismAlphaBlend =
        model.getDrawableAlphaBlend(index);

      if (
        colorBlendMode == CubismColorBlend.ColorBlend_None ||
        alphaBlendMode == CubismAlphaBlend.AlphaBlend_None ||
        (colorBlendMode == CubismColorBlend.ColorBlend_Normal &&
          alphaBlendMode == CubismAlphaBlend.AlphaBlend_Over)
      ) {
        // 使用 Cubism 5.2 及以前版本着色器。
        shaderSet =
          this._shaderSets[
            ShaderNames.ShaderNames_NormalPremultipliedAlpha + offset
          ];

        srcColor = this.gl.ONE;
        dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
        srcAlpha = this.gl.ONE;
        dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
      } else {
        switch (colorBlendMode) {
          // 使用 Cubism 5.2 及以前版本着色器。
          case CubismColorBlend.ColorBlend_AddCompatible:
            shaderSet =
              this._shaderSets[
                ShaderNames.ShaderNames_AddPremultipliedAlpha + offset
              ];
            srcColor = this.gl.ONE;
            dstColor = this.gl.ONE;
            srcAlpha = this.gl.ZERO;
            dstAlpha = this.gl.ONE;
            break;
          // 使用 Cubism 5.2 及以前版本着色器。
          case CubismColorBlend.ColorBlend_MultiplyCompatible:
            shaderSet =
              this._shaderSets[
                ShaderNames.ShaderNames_MultPremultipliedAlpha + offset
              ];
            srcColor = this.gl.DST_COLOR;
            dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
            srcAlpha = this.gl.ZERO;
            dstAlpha = this.gl.ONE;
            break;
          // 根据混合模式组合决定着色器
          default:
            {
              const srcBuffer =
                renderer._currentOffscreen != null
                  ? renderer._currentOffscreen
                  : renderer.getModelRenderTarget(0);

              // 先执行复制
              CubismRenderTarget_WebGL.copyBuffer(
                this.gl as WebGL2RenderingContext,
                srcBuffer,
                renderer.getModelRenderTarget(1)
              );
              const baseShaderSetIndex = this._blendShaderSetMap.get(
                this._colorBlendMap.get(colorBlendMode) +
                  this._alphaBlendMap.get(alphaBlendMode)
              );
              shaderSet = this._shaderSets[baseShaderSetIndex + offset];
              srcColor = this.gl.ONE;
              dstColor = this.gl.ZERO;
              srcAlpha = this.gl.ONE;
              dstAlpha = this.gl.ZERO;
              isUsingCompatible = false;
            }
            break;
        }
      }
    } else {
      // 使用 Cubism 5.2 及以前版本着色器。
      switch (model.getDrawableBlendMode(index)) {
        case CubismBlendMode.CubismBlendMode_Normal:
        default:
          shaderSet =
            this._shaderSets[
              ShaderNames.ShaderNames_NormalPremultipliedAlpha + offset
            ];
          srcColor = this.gl.ONE;
          dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
          srcAlpha = this.gl.ONE;
          dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
          break;

        case CubismBlendMode.CubismBlendMode_Additive:
          shaderSet =
            this._shaderSets[
              ShaderNames.ShaderNames_AddPremultipliedAlpha + offset
            ];
          srcColor = this.gl.ONE;
          dstColor = this.gl.ONE;
          srcAlpha = this.gl.ZERO;
          dstAlpha = this.gl.ONE;
          break;

        case CubismBlendMode.CubismBlendMode_Multiplicative:
          shaderSet =
            this._shaderSets[
              ShaderNames.ShaderNames_MultPremultipliedAlpha + offset
            ];
          srcColor = this.gl.DST_COLOR;
          dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
          srcAlpha = this.gl.ZERO;
          dstAlpha = this.gl.ONE;
          break;
      }
    }

    this.gl.useProgram(shaderSet.shaderProgram);

    // 设置顶点数组
    if (renderer._bufferData.vertex == null) {
      renderer._bufferData.vertex = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);

    // 设置顶点数组
    const vertexArray: Float32Array = model.getDrawableVertices(index);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertexArray, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributePositionLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    // 设置纹理顶点
    if (renderer._bufferData.uv == null) {
      renderer._bufferData.uv = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
    const uvArray: Float32Array = model.getDrawableVertexUvs(index);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, uvArray, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributeTexCoordLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    if (masked) {
      this.gl.activeTexture(this.gl.TEXTURE1);

      // 写入 frameBuffer 的纹理
      const tex: WebGLTexture = renderer
        .getDrawableMaskBuffer(
          renderer.getClippingContextBufferForDrawable()._bufferIndex
        )
        .getColorBuffer();
      this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
      this.gl.uniform1i(shaderSet.samplerTexture1Location, 1);

      // 设置将 view 坐标转换为 ClippingContext 坐标的矩阵
      this.gl.uniformMatrix4fv(
        shaderSet.uniformClipMatrixLocation,
        false,
        renderer.getClippingContextBufferForDrawable()._matrixForDraw.getArray()
      );

      // 设置要使用的颜色通道
      const channelIndex: number =
        renderer.getClippingContextBufferForDrawable()._layoutChannelIndex;
      const colorChannel: CubismTextureColor = renderer
        .getClippingContextBufferForDrawable()
        .getClippingManager()
        .getChannelFlagAsColor(channelIndex);
      this.gl.uniform4f(
        shaderSet.uniformChannelFlagLocation,
        colorChannel.r,
        colorChannel.g,
        colorChannel.b,
        colorChannel.a
      );

      if (model.isBlendModeEnabled()) {
        this.gl.uniform1f(
          shaderSet.uniformInvertMaskFlagLocation,
          invertedMask ? 1.0 : 0.0
        );
      }
    }

    // 设置纹理
    const textureNo: number = model.getDrawableTextureIndex(index);
    const textureId: WebGLTexture = renderer.getBindedTextures().get(textureNo);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, textureId);
    this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);

    // 坐标变换
    const matrix4x4: CubismMatrix44 = renderer.getMvpMatrix();
    this.gl.uniformMatrix4fv(
      shaderSet.uniformMatrixLocation,
      false,
      matrix4x4.getArray()
    );

    // 获取基础色
    let baseColor: CubismTextureColor = null;

    if (model.isBlendModeEnabled()) {
      // 混合模式下模型颜色最后处理，因此仅支持不透明度
      const drawableOpacity = model.getDrawableOpacity(index);
      baseColor = new CubismTextureColor(
        drawableOpacity,
        drawableOpacity,
        drawableOpacity,
        drawableOpacity
      );
    } else {
      baseColor = renderer.getModelColorWithOpacity(
        model.getDrawableOpacity(index)
      );
    }

    const multiplyAndScreenColor = model.getOverrideMultiplyAndScreenColor();
    const multiplyColor: CubismTextureColor =
      multiplyAndScreenColor.getDrawableMultiplyColor(index);
    const screenColor: CubismTextureColor =
      multiplyAndScreenColor.getDrawableScreenColor(index);

    this.gl.uniform4f(
      shaderSet.uniformBaseColorLocation,
      baseColor.r,
      baseColor.g,
      baseColor.b,
      baseColor.a
    );

    this.gl.uniform4f(
      shaderSet.uniformMultiplyColorLocation,
      multiplyColor.r,
      multiplyColor.g,
      multiplyColor.b,
      multiplyColor.a
    );

    this.gl.uniform4f(
      shaderSet.uniformScreenColorLocation,
      screenColor.r,
      screenColor.g,
      screenColor.b,
      screenColor.a
    );

    // 使用 Cubism 5.3 及以后版本着色器时
    if (model.isBlendModeEnabled()) {
      this.gl.activeTexture(this.gl.TEXTURE2);

      // 使用 Cubism 5.2 及以前版本着色器时不需要，跳过此处理
      if (!isUsingCompatible) {
        const tex: WebGLTexture = renderer
          .getModelRenderTarget(1)
          .getColorBuffer();
        this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
        this.gl.uniform1i(shaderSet.samplerFrameBufferTextureLocation, 2);
      }
    }

    // 创建 IBO 并传输数据
    if (renderer._bufferData.index == null) {
      renderer._bufferData.index = this.gl.createBuffer();
    }
    const indexArray: Uint16Array = model.getDrawableVertexIndices(index);

    this.gl.bindBuffer(
      this.gl.ELEMENT_ARRAY_BUFFER,
      renderer._bufferData.index
    );
    this.gl.bufferData(
      this.gl.ELEMENT_ARRAY_BUFFER,
      indexArray,
      this.gl.DYNAMIC_DRAW
    );

    this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
  }

  /**
   * 执行离屏用着色器程序的一整套设置
   *
   * @param renderer 渲染器
   * @param model 绘制对象模型
   * @param offscreen 绘制对象离屏
   */
  public setupShaderProgramForOffscreen(
    renderer: CubismRenderer_WebGL,
    model: Readonly<CubismModel>,
    offscreen: CubismOffscreenRenderTarget_WebGL
  ): void {
    if (!renderer.isPremultipliedAlpha()) {
      CubismLogError('NoPremultipliedAlpha is not allowed');
    }

    if (this._shaderSets.length == 0) {
      this.generateShaders();
    }

    if (this._isShaderLoaded == false) {
      CubismLogWarning('Shader program is not initialized.');
      return;
    }

    // 混合
    let srcColor: number;
    let dstColor: number;
    let srcAlpha: number;
    let dstAlpha: number;

    const offscreenIndex: number = offscreen.getOffscreenIndex();
    // 计算 _shaderSets 用的偏移
    const masked: boolean =
      renderer.getClippingContextBufferForOffscreen() != null; // 该绘制对象是否被遮罩
    const invertedMask: boolean =
      model.getOffscreenInvertedMask(offscreenIndex);
    const offset: number = masked ? (invertedMask ? 2 : 1) : 0;

    let shaderSet: CubismShaderSet;
    // 使用 Cubism 5.2 及以前版本着色器时为 true
    let isUsingCompatible: boolean = true;

    const colorBlendMode: CubismColorBlend =
      model.getOffscreenColorBlend(offscreenIndex);
    const alphaBlendMode: CubismAlphaBlend =
      model.getOffscreenAlphaBlend(offscreenIndex);

    if (
      colorBlendMode == CubismColorBlend.ColorBlend_None ||
      alphaBlendMode == CubismAlphaBlend.AlphaBlend_None ||
      (colorBlendMode == CubismColorBlend.ColorBlend_Normal &&
        alphaBlendMode == CubismAlphaBlend.AlphaBlend_Over)
    ) {
      // 使用 Cubism 5.2 及以前版本着色器。
      shaderSet =
        this._shaderSets[
          ShaderNames.ShaderNames_NormalPremultipliedAlpha + offset
        ];

      srcColor = this.gl.ONE;
      dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
      srcAlpha = this.gl.ONE;
      dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;
    } else {
      switch (colorBlendMode as CubismColorBlend) {
        // 使用 Cubism 5.2 及以前版本着色器。
        case CubismColorBlend.ColorBlend_AddCompatible:
          shaderSet =
            this._shaderSets[
              ShaderNames.ShaderNames_AddPremultipliedAlpha + offset
            ];
          srcColor = this.gl.ONE;
          dstColor = this.gl.ONE;
          srcAlpha = this.gl.ZERO;
          dstAlpha = this.gl.ONE;
          break;
        case CubismColorBlend.ColorBlend_MultiplyCompatible:
          shaderSet =
            this._shaderSets[
              ShaderNames.ShaderNames_MultPremultipliedAlpha + offset
            ];
          srcColor = this.gl.DST_COLOR;
          dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
          srcAlpha = this.gl.ZERO;
          dstAlpha = this.gl.ONE;
          break;
        default:
          {
            const srcBuffer =
              offscreen.getOldOffscreen() != null
                ? offscreen.getOldOffscreen()
                : renderer.getModelRenderTarget(0);

            // 先执行复制
            CubismRenderTarget_WebGL.copyBuffer(
              this.gl as WebGL2RenderingContext,
              srcBuffer,
              renderer.getModelRenderTarget(1)
            );
            const baseShaderSetIndex = this._blendShaderSetMap.get(
              this._colorBlendMap.get(colorBlendMode) +
                this._alphaBlendMap.get(alphaBlendMode)
            );
            shaderSet = this._shaderSets[baseShaderSetIndex + offset];
            srcColor = this.gl.ONE;
            dstColor = this.gl.ZERO;
            srcAlpha = this.gl.ONE;
            dstAlpha = this.gl.ZERO;
            isUsingCompatible = false;
          }
          break;
      }
    }

    this.gl.useProgram(shaderSet.shaderProgram);

    // 设置顶点数组
    CubismRenderTarget_WebGL.copyBuffer(
      this.gl as WebGL2RenderingContext,
      offscreen,
      renderer.getModelRenderTarget(2)
    );
    this.gl.activeTexture(this.gl.TEXTURE0);
    const tex0 = renderer.getModelRenderTarget(2).getColorBuffer();
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex0);
    this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);

    // 坐标变换
    const matrix4x4: CubismMatrix44 = new CubismMatrix44();
    matrix4x4.loadIdentity();
    this.gl.uniformMatrix4fv(
      shaderSet.uniformMatrixLocation,
      false,
      matrix4x4.getArray()
    );

    // 获取基础色
    const offscreenOpacity = model.getOffscreenOpacity(offscreenIndex);
    // 使用预乘 alpha，因此将离屏透明度乘以 1.0 的状态
    const baseColor: CubismTextureColor = new CubismTextureColor(
      offscreenOpacity,
      offscreenOpacity,
      offscreenOpacity,
      offscreenOpacity
    );

    const multiplyAndScreenColor = model.getOverrideMultiplyAndScreenColor();
    const multiplyColor: CubismTextureColor =
      multiplyAndScreenColor.getOffscreenMultiplyColor(offscreenIndex);
    const screenColor: CubismTextureColor =
      multiplyAndScreenColor.getOffscreenScreenColor(offscreenIndex);

    this.gl.uniform4f(
      shaderSet.uniformBaseColorLocation,
      baseColor.r,
      baseColor.g,
      baseColor.b,
      baseColor.a
    );

    this.gl.uniform4f(
      shaderSet.uniformMultiplyColorLocation,
      multiplyColor.r,
      multiplyColor.g,
      multiplyColor.b,
      multiplyColor.a
    );

    this.gl.uniform4f(
      shaderSet.uniformScreenColorLocation,
      screenColor.r,
      screenColor.g,
      screenColor.b,
      screenColor.a
    );

    this.gl.activeTexture(this.gl.TEXTURE2);

    // 使用 Cubism 5.2 及以前版本着色器时不需要，跳过此处理
    if (!isUsingCompatible) {
      const tex1: WebGLTexture = renderer
        .getModelRenderTarget(1)
        .getColorBuffer();
      this.gl.bindTexture(this.gl.TEXTURE_2D, tex1);
      this.gl.uniform1i(shaderSet.samplerFrameBufferTextureLocation, 2);
    }

    if (masked) {
      this.gl.activeTexture(this.gl.TEXTURE1);

      // 写入 frameBuffer 的纹理
      const tex2: WebGLTexture = renderer
        .getOffscreenMaskBuffer(
          renderer.getClippingContextBufferForOffscreen()._bufferIndex
        )
        .getColorBuffer();
      this.gl.bindTexture(this.gl.TEXTURE_2D, tex2);
      this.gl.uniform1i(shaderSet.samplerTexture1Location, 1);

      // 设置将 view 坐标转换为 ClippingContext 坐标的矩阵
      this.gl.uniformMatrix4fv(
        shaderSet.uniformClipMatrixLocation,
        false,
        renderer
          .getClippingContextBufferForOffscreen()
          ._matrixForDraw.getArray()
      );

      // 设置要使用的颜色通道
      const channelIndex: number =
        renderer.getClippingContextBufferForOffscreen()._layoutChannelIndex;
      const colorChannel: CubismTextureColor = renderer
        .getClippingContextBufferForOffscreen()
        .getClippingManager()
        .getChannelFlagAsColor(channelIndex);
      this.gl.uniform4f(
        shaderSet.uniformChannelFlagLocation,
        colorChannel.r,
        colorChannel.g,
        colorChannel.b,
        colorChannel.a
      );

      if (model.isBlendModeEnabled()) {
        this.gl.uniform1f(
          shaderSet.uniformInvertMaskFlagLocation,
          invertedMask ? 1.0 : 0.0
        );
      }
    }

    // 设置顶点位置属性
    if (!renderer._bufferData.vertex) {
      renderer._bufferData.vertex = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      s_renderTargetVertexArray,
      this.gl.STATIC_DRAW
    );
    this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributePositionLocation,
      2,
      this.gl.FLOAT,
      false,
      Float32Array.BYTES_PER_ELEMENT * 2,
      0
    );

    // 设置纹理坐标属性
    if (!renderer._bufferData.uv) {
      renderer._bufferData.uv = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      s_renderTargetReverseUvArray,
      this.gl.STATIC_DRAW
    );
    this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributeTexCoordLocation,
      2,
      this.gl.FLOAT,
      false,
      Float32Array.BYTES_PER_ELEMENT * 2,
      0
    );

    this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
  }

  /**
   * 执行遮罩用着色器程序的一整套设置
   *
   * @param renderer 渲染器
   * @param model 绘制对象模型
   * @param index 绘制对象网格的索引
   */
  public setupShaderProgramForMask(
    renderer: CubismRenderer_WebGL,
    model: Readonly<CubismModel>,
    index: number
  ): void {
    if (!renderer.isPremultipliedAlpha()) {
      CubismLogError('NoPremultipliedAlpha is not allowed');
    }

    if (this._shaderSets.length == 0) {
      this.generateShaders();
    }

    if (this._isShaderLoaded == false) {
      CubismLogWarning('Shader program is not initialized.');
      return;
    }

    const shaderSet: CubismShaderSet =
      this._shaderSets[ShaderNames.ShaderNames_SetupMask];
    this.gl.useProgram(shaderSet.shaderProgram);

    // 设置顶点数组
    if (renderer._bufferData.vertex == null) {
      renderer._bufferData.vertex = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);
    const vertexArray: Float32Array = model.getDrawableVertices(index);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertexArray, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributePositionLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    // 设置纹理
    if (renderer._bufferData.uv == null) {
      renderer._bufferData.uv = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
    const textureNo: number = model.getDrawableTextureIndex(index);
    const textureId: WebGLTexture = renderer.getBindedTextures().get(textureNo);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, textureId);
    this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);

    // 设置纹理顶点
    if (renderer._bufferData.uv == null) {
      renderer._bufferData.uv = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
    const uvArray: Float32Array = model.getDrawableVertexUvs(index);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, uvArray, this.gl.DYNAMIC_DRAW);
    this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributeTexCoordLocation,
      2,
      this.gl.FLOAT,
      false,
      0,
      0
    );

    // 通道
    const channelIndex: number =
      renderer.getClippingContextBufferForMask()._layoutChannelIndex;
    const colorChannel: CubismTextureColor = renderer
      .getClippingContextBufferForMask()
      .getClippingManager()
      .getChannelFlagAsColor(channelIndex);
    this.gl.uniform4f(
      shaderSet.uniformChannelFlagLocation,
      colorChannel.r,
      colorChannel.g,
      colorChannel.b,
      colorChannel.a
    );

    this.gl.uniformMatrix4fv(
      shaderSet.uniformClipMatrixLocation,
      false,
      renderer.getClippingContextBufferForMask()._matrixForMask.getArray()
    );

    const rect: csmRect =
      renderer.getClippingContextBufferForMask()._layoutBounds;

    this.gl.uniform4f(
      shaderSet.uniformBaseColorLocation,
      rect.x * 2.0 - 1.0,
      rect.y * 2.0 - 1.0,
      rect.getRight() * 2.0 - 1.0,
      rect.getBottom() * 2.0 - 1.0
    );

    // 混合
    const srcColor: number = this.gl.ZERO;
    const dstColor: number = this.gl.ONE_MINUS_SRC_COLOR;
    const srcAlpha: number = this.gl.ZERO;
    const dstAlpha: number = this.gl.ONE_MINUS_SRC_ALPHA;

    // 创建 IBO 并传输数据
    if (renderer._bufferData.index == null) {
      renderer._bufferData.index = this.gl.createBuffer();
    }
    const indexArray: Uint16Array = model.getDrawableVertexIndices(index);

    this.gl.bindBuffer(
      this.gl.ELEMENT_ARRAY_BUFFER,
      renderer._bufferData.index
    );
    this.gl.bufferData(
      this.gl.ELEMENT_ARRAY_BUFFER,
      indexArray,
      this.gl.DYNAMIC_DRAW
    );

    this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
  }

  /**
   * 设置离屏渲染目标用着色器程序
   *
   * @param renderer 渲染器
   */
  public setupShaderProgramForOffscreenRenderTarget(
    renderer: CubismRenderer_WebGL
  ): void {
    if (this._shaderSets.length == 0) {
      this.generateShaders();
    }

    if (this._isShaderLoaded == false) {
      CubismLogWarning('Shader program is not initialized.');
      return;
    }

    // 此时纹理应为 PMA，因此进行计算
    const baseColor = renderer.getModelColor();
    baseColor.r *= baseColor.a;
    baseColor.g *= baseColor.a;
    baseColor.b *= baseColor.a;
    this.copyTexture(renderer, baseColor);
  }

  /**
   * 复制离屏渲染目标内容
   *
   * @param renderer 渲染器
   * @param baseColor 基础色
   */
  public copyTexture(
    renderer: CubismRenderer_WebGL,
    baseColor: CubismTextureColor
  ) {
    // 混合
    const srcColor = this.gl.ONE;
    const dstColor = this.gl.ONE_MINUS_SRC_ALPHA;
    const srcAlpha = this.gl.ONE;
    const dstAlpha = this.gl.ONE_MINUS_SRC_ALPHA;

    const shaderSet = this._shaderSets[10]; // ShaderNames_Copy = 10

    this.gl.useProgram(shaderSet.shaderProgram);

    this.gl.uniform4f(
      shaderSet.uniformBaseColorLocation,
      baseColor.r,
      baseColor.g,
      baseColor.b,
      baseColor.a
    );

    // 设置离屏内容
    this.gl.activeTexture(this.gl.TEXTURE0);
    const tex = renderer.getModelRenderTarget(0).getColorBuffer();
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
    this.gl.uniform1i(shaderSet.samplerTexture0Location, 0);

    // 设置顶点位置属性
    if (!renderer._bufferData.vertex) {
      renderer._bufferData.vertex = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.vertex);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      s_renderTargetVertexArray,
      this.gl.STATIC_DRAW
    );
    this.gl.enableVertexAttribArray(shaderSet.attributePositionLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributePositionLocation,
      2,
      this.gl.FLOAT,
      false,
      Float32Array.BYTES_PER_ELEMENT * 2,
      0
    );

    // 设置纹理坐标属性
    if (!renderer._bufferData.uv) {
      renderer._bufferData.uv = this.gl.createBuffer();
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, renderer._bufferData.uv);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      s_renderTargetUvArray,
      this.gl.STATIC_DRAW
    );
    this.gl.enableVertexAttribArray(shaderSet.attributeTexCoordLocation);
    this.gl.vertexAttribPointer(
      shaderSet.attributeTexCoordLocation,
      2,
      this.gl.FLOAT,
      false,
      Float32Array.BYTES_PER_ELEMENT * 2,
      0
    );

    this.gl.blendFuncSeparate(srcColor, dstColor, srcAlpha, dstAlpha);
  }

  /**
   * 释放着色器程序
   */
  public releaseShaderProgram(): void {
    for (let i = 0; i < this._shaderSets.length; i++) {
      this.gl.deleteProgram(this._shaderSets[i].shaderProgram);
      this._shaderSets[i].shaderProgram = 0;
      this._shaderSets[i] = void 0;
      this._shaderSets[i] = null;
    }
  }

  /**
   * 初始化着色器程序
   *
   * @param vertShaderSrc 顶点着色器源码
   * @param fragShaderSrc 片段着色器源码
   */
  public generateShaders(): void {
    if (this._isShaderLoading) {
      console.log('[Shader] instance#' + this._instanceId + ' Already loading, skipping');
      return;
    }
    console.log('[Shader] instance#' + this._instanceId + ' generateShaders start, count=' + this._shaderCount);
    this._isShaderLoading = true;
    this._isShaderLoaded = false;
    // 释放旧的 shader programs，强制重新编译
    for (const set of this._shaderSets) {
      if (set && set.shaderProgram) {
        this.gl.deleteProgram(set.shaderProgram);
      }
    }
    this._shaderSets.length = this._shaderCount;
    for (let i = 0; i < this._shaderCount; i++) {
      this._shaderSets[i] = new CubismShaderSet();
    }

    // 读取着色器源码（同步、内联）
    try {
      this.loadShaders();
      this.registerShader(); // 注册普通着色器
      this.registerBlendShader(); // 注册混合模式着色器
      this._isShaderLoading = false;
      this._isShaderLoaded = true;
      console.log('[Shader] instance#' + this._instanceId + ' All shaders registered successfully');
    } catch (error) {
      this._isShaderLoading = false;
      console.error('[Shader] Failed to load shaders:', error);
    }
  }

  /**
   * 注册着色器程序
   */
  public registerShader(): void {
    const vertexShaderSrc = this._vertShaderSrc;
    const vertexShaderSrcMasked = this._vertShaderSrcMasked;
    const vertexShaderSrcSetupMask = this._vertShaderSrcSetupMask;
    const fragmentShaderSrcSetupMask = this._fragShaderSrcSetupMask;
    const fragmentShaderSrcPremultipliedAlpha =
      this._fragShaderSrcPremultipliedAlpha;
    const fragmentShaderSrcMaskPremultipliedAlpha =
      this._fragShaderSrcMaskPremultipliedAlpha;
    const fragmentShaderSrcMaskInvertedPremultipliedAlpha =
      this._fragShaderSrcMaskInvertedPremultipliedAlpha;

    this._shaderSets[0].shaderProgram = this.loadShaderProgram(
      vertexShaderSrcSetupMask,
      fragmentShaderSrcSetupMask
    );
    this._shaderSets[1].shaderProgram = this.loadShaderProgram(
      vertexShaderSrc,
      fragmentShaderSrcPremultipliedAlpha
    );
    this._shaderSets[2].shaderProgram = this.loadShaderProgram(
      vertexShaderSrcMasked,
      fragmentShaderSrcMaskPremultipliedAlpha
    );
    this._shaderSets[3].shaderProgram = this.loadShaderProgram(
      vertexShaderSrcMasked,
      fragmentShaderSrcMaskInvertedPremultipliedAlpha
    );

    // 加算也与普通使用相同着色器
    this._shaderSets[4].shaderProgram = this._shaderSets[1].shaderProgram;
    this._shaderSets[5].shaderProgram = this._shaderSets[2].shaderProgram;
    this._shaderSets[6].shaderProgram = this._shaderSets[3].shaderProgram;

    // 乘算也与普通使用相同着色器
    this._shaderSets[7].shaderProgram = this._shaderSets[1].shaderProgram;
    this._shaderSets[8].shaderProgram = this._shaderSets[2].shaderProgram;
    this._shaderSets[9].shaderProgram = this._shaderSets[3].shaderProgram;

    // SetupMask
    this._shaderSets[0].attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets[0].shaderProgram,
      'a_position'
    );
    this._shaderSets[0].attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets[0].shaderProgram,
      'a_texCoord'
    );
    this._shaderSets[0].samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets[0].shaderProgram,
      's_texture0'
    );
    this._shaderSets[0].uniformClipMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[0].shaderProgram,
      'u_clipMatrix'
    );
    this._shaderSets[0].uniformChannelFlagLocation = this.gl.getUniformLocation(
      this._shaderSets[0].shaderProgram,
      'u_channelFlag'
    );
    this._shaderSets[0].uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets[0].shaderProgram,
      'u_baseColor'
    );

    // 普通（PremultipliedAlpha）
    this._shaderSets[1].attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets[1].shaderProgram,
      'a_position'
    );
    this._shaderSets[1].attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets[1].shaderProgram,
      'a_texCoord'
    );
    this._shaderSets[1].samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets[1].shaderProgram,
      's_texture0'
    );
    this._shaderSets[1].uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[1].shaderProgram,
      'u_matrix'
    );
    this._shaderSets[1].uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets[1].shaderProgram,
      'u_baseColor'
    );
    this._shaderSets[1].uniformMultiplyColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets[1].shaderProgram,
        'u_multiplyColor'
      );
    this._shaderSets[1].uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets[1].shaderProgram,
      'u_screenColor'
    );

    // 普通（裁剪，PremultipliedAlpha）
    this._shaderSets[2].attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets[2].shaderProgram,
      'a_position'
    );
    this._shaderSets[2].attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets[2].shaderProgram,
      'a_texCoord'
    );
    this._shaderSets[2].samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets[2].shaderProgram,
      's_texture0'
    );
    this._shaderSets[2].samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets[2].shaderProgram,
      's_texture1'
    );
    this._shaderSets[2].uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[2].shaderProgram,
      'u_matrix'
    );
    this._shaderSets[2].uniformClipMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[2].shaderProgram,
      'u_clipMatrix'
    );
    this._shaderSets[2].uniformChannelFlagLocation = this.gl.getUniformLocation(
      this._shaderSets[2].shaderProgram,
      'u_channelFlag'
    );
    this._shaderSets[2].uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets[2].shaderProgram,
      'u_baseColor'
    );
    this._shaderSets[2].uniformMultiplyColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets[2].shaderProgram,
        'u_multiplyColor'
      );
    this._shaderSets[2].uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets[2].shaderProgram,
      'u_screenColor'
    );

    // 普通（裁剪·反转，PremultipliedAlpha）
    this._shaderSets[3].attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets[3].shaderProgram,
      'a_position'
    );
    this._shaderSets[3].attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets[3].shaderProgram,
      'a_texCoord'
    );
    this._shaderSets[3].samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets[3].shaderProgram,
      's_texture0'
    );
    this._shaderSets[3].samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets[3].shaderProgram,
      's_texture1'
    );
    this._shaderSets[3].uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[3].shaderProgram,
      'u_matrix'
    );
    this._shaderSets[3].uniformClipMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[3].shaderProgram,
      'u_clipMatrix'
    );
    this._shaderSets[3].uniformChannelFlagLocation = this.gl.getUniformLocation(
      this._shaderSets[3].shaderProgram,
      'u_channelFlag'
    );
    this._shaderSets[3].uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets[3].shaderProgram,
      'u_baseColor'
    );
    this._shaderSets[3].uniformMultiplyColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets[3].shaderProgram,
        'u_multiplyColor'
      );
    this._shaderSets[3].uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets[3].shaderProgram,
      'u_screenColor'
    );

    // 加算（PremultipliedAlpha）
    this._shaderSets[4].attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets[4].shaderProgram,
      'a_position'
    );
    this._shaderSets[4].attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets[4].shaderProgram,
      'a_texCoord'
    );
    this._shaderSets[4].samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets[4].shaderProgram,
      's_texture0'
    );
    this._shaderSets[4].uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[4].shaderProgram,
      'u_matrix'
    );
    this._shaderSets[4].uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets[4].shaderProgram,
      'u_baseColor'
    );
    this._shaderSets[4].uniformMultiplyColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets[4].shaderProgram,
        'u_multiplyColor'
      );
    this._shaderSets[4].uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets[4].shaderProgram,
      'u_screenColor'
    );

    // 加算（裁剪，PremultipliedAlpha）
    this._shaderSets[5].attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets[5].shaderProgram,
      'a_position'
    );
    this._shaderSets[5].attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets[5].shaderProgram,
      'a_texCoord'
    );
    this._shaderSets[5].samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets[5].shaderProgram,
      's_texture0'
    );
    this._shaderSets[5].samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets[5].shaderProgram,
      's_texture1'
    );
    this._shaderSets[5].uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[5].shaderProgram,
      'u_matrix'
    );
    this._shaderSets[5].uniformClipMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[5].shaderProgram,
      'u_clipMatrix'
    );
    this._shaderSets[5].uniformChannelFlagLocation = this.gl.getUniformLocation(
      this._shaderSets[5].shaderProgram,
      'u_channelFlag'
    );
    this._shaderSets[5].uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets[5].shaderProgram,
      'u_baseColor'
    );
    this._shaderSets[5].uniformMultiplyColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets[5].shaderProgram,
        'u_multiplyColor'
      );
    this._shaderSets[5].uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets[5].shaderProgram,
      'u_screenColor'
    );

    // 加算（裁剪·反转，PremultipliedAlpha）
    this._shaderSets[6].attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets[6].shaderProgram,
      'a_position'
    );
    this._shaderSets[6].attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets[6].shaderProgram,
      'a_texCoord'
    );
    this._shaderSets[6].samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets[6].shaderProgram,
      's_texture0'
    );
    this._shaderSets[6].samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets[6].shaderProgram,
      's_texture1'
    );
    this._shaderSets[6].uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[6].shaderProgram,
      'u_matrix'
    );
    this._shaderSets[6].uniformClipMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[6].shaderProgram,
      'u_clipMatrix'
    );
    this._shaderSets[6].uniformChannelFlagLocation = this.gl.getUniformLocation(
      this._shaderSets[6].shaderProgram,
      'u_channelFlag'
    );
    this._shaderSets[6].uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets[6].shaderProgram,
      'u_baseColor'
    );
    this._shaderSets[6].uniformMultiplyColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets[6].shaderProgram,
        'u_multiplyColor'
      );
    this._shaderSets[6].uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets[6].shaderProgram,
      'u_screenColor'
    );

    // 乘算（PremultipliedAlpha）
    this._shaderSets[7].attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets[7].shaderProgram,
      'a_position'
    );
    this._shaderSets[7].attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets[7].shaderProgram,
      'a_texCoord'
    );
    this._shaderSets[7].samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets[7].shaderProgram,
      's_texture0'
    );
    this._shaderSets[7].uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[7].shaderProgram,
      'u_matrix'
    );
    this._shaderSets[7].uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets[7].shaderProgram,
      'u_baseColor'
    );
    this._shaderSets[7].uniformMultiplyColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets[7].shaderProgram,
        'u_multiplyColor'
      );
    this._shaderSets[7].uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets[7].shaderProgram,
      'u_screenColor'
    );

    // 乘算（裁剪，PremultipliedAlpha）
    this._shaderSets[8].attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets[8].shaderProgram,
      'a_position'
    );
    this._shaderSets[8].attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets[8].shaderProgram,
      'a_texCoord'
    );
    this._shaderSets[8].samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets[8].shaderProgram,
      's_texture0'
    );
    this._shaderSets[8].samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets[8].shaderProgram,
      's_texture1'
    );
    this._shaderSets[8].uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[8].shaderProgram,
      'u_matrix'
    );
    this._shaderSets[8].uniformClipMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[8].shaderProgram,
      'u_clipMatrix'
    );
    this._shaderSets[8].uniformChannelFlagLocation = this.gl.getUniformLocation(
      this._shaderSets[8].shaderProgram,
      'u_channelFlag'
    );
    this._shaderSets[8].uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets[8].shaderProgram,
      'u_baseColor'
    );
    this._shaderSets[8].uniformMultiplyColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets[8].shaderProgram,
        'u_multiplyColor'
      );
    this._shaderSets[8].uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets[8].shaderProgram,
      'u_screenColor'
    );

    // 乘算（裁剪·反转，PremultipliedAlpha）
    this._shaderSets[9].attributePositionLocation = this.gl.getAttribLocation(
      this._shaderSets[9].shaderProgram,
      'a_position'
    );
    this._shaderSets[9].attributeTexCoordLocation = this.gl.getAttribLocation(
      this._shaderSets[9].shaderProgram,
      'a_texCoord'
    );
    this._shaderSets[9].samplerTexture0Location = this.gl.getUniformLocation(
      this._shaderSets[9].shaderProgram,
      's_texture0'
    );
    this._shaderSets[9].samplerTexture1Location = this.gl.getUniformLocation(
      this._shaderSets[9].shaderProgram,
      's_texture1'
    );
    this._shaderSets[9].uniformMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[9].shaderProgram,
      'u_matrix'
    );
    this._shaderSets[9].uniformClipMatrixLocation = this.gl.getUniformLocation(
      this._shaderSets[9].shaderProgram,
      'u_clipMatrix'
    );
    this._shaderSets[9].uniformChannelFlagLocation = this.gl.getUniformLocation(
      this._shaderSets[9].shaderProgram,
      'u_channelFlag'
    );
    this._shaderSets[9].uniformBaseColorLocation = this.gl.getUniformLocation(
      this._shaderSets[9].shaderProgram,
      'u_baseColor'
    );
    this._shaderSets[9].uniformMultiplyColorLocation =
      this.gl.getUniformLocation(
        this._shaderSets[9].shaderProgram,
        'u_multiplyColor'
      );
    this._shaderSets[9].uniformScreenColorLocation = this.gl.getUniformLocation(
      this._shaderSets[9].shaderProgram,
      'u_screenColor'
    );
  }

  /**
   * 注册混合模式用着色器程序
   */
  public registerBlendShader(): void {
    // 设置复制用着色器
    const vertShaderSrcCopy = this._vertShaderSrcCopy;
    const fragShaderSrcCopy = this._fragShaderSrcCopy;

    const copyShaderSet = this._shaderSets[10]; // ShaderNames_Copy = 10
    copyShaderSet.shaderProgram = this.loadShaderProgram(
      vertShaderSrcCopy,
      fragShaderSrcCopy
    );
    copyShaderSet.attributeTexCoordLocation = this.gl.getAttribLocation(
      copyShaderSet.shaderProgram,
      'a_texCoord'
    );
    copyShaderSet.attributePositionLocation = this.gl.getAttribLocation(
      copyShaderSet.shaderProgram,
      'a_position'
    );
    copyShaderSet.uniformBaseColorLocation = this.gl.getUniformLocation(
      copyShaderSet.shaderProgram,
      'u_baseColor'
    );

    let shaderSetIndex = 11;
    // 设置混合模式用着色器
    for (
      let colorBlendIndex = 0;
      colorBlendIndex < this._colorBlendValues.length;
      colorBlendIndex++
    ) {
      // 跳过 NONE 和向后兼容
      if (
        this._colorBlendValues[colorBlendIndex] ==
          CubismColorBlend.ColorBlend_None ||
        this._colorBlendValues[colorBlendIndex] ==
          CubismColorBlend.ColorBlend_AddCompatible ||
        this._colorBlendValues[colorBlendIndex] ==
          CubismColorBlend.ColorBlend_MultiplyCompatible
      ) {
        continue;
      }

      // 颜色混合宏
      const colorBlendValue = this._colorBlendValues[colorBlendIndex];
      const colorBlendName = this._colorBlendMap
        .get(colorBlendValue)
        .toUpperCase();
      const colorBlendMacro = `#define COLOR_BLEND_${colorBlendName}\n`;

      for (
        let alphablendIndex = 0;
        alphablendIndex < this._alphaBlendValues.length;
        alphablendIndex++
      ) {
        // 跳过 NONE，以及颜色混合为 Normal 且透明度混合为 Over 的情况
        if (
          this._alphaBlendValues[alphablendIndex] ==
            CubismAlphaBlend.AlphaBlend_None ||
          (this._colorBlendValues[colorBlendIndex] ==
            CubismColorBlend.ColorBlend_Normal &&
            this._alphaBlendValues[alphablendIndex] ==
              CubismAlphaBlend.AlphaBlend_Over)
        ) {
          continue;
        }

        // 透明度混合宏
        const alphaBlendValue = this._alphaBlendValues[alphablendIndex];
        const alphaBlendName = this._alphaBlendMap
          .get(alphaBlendValue)
          .toUpperCase();
        const alphaBlendMacro = `#define ALPHA_BLEND_${alphaBlendName}\n`;

        // 生成着色器源码
        this.generateBlendShader(
          colorBlendMacro,
          alphaBlendMacro,
          shaderSetIndex
        );

        this._blendShaderSetMap.set(
          this._colorBlendMap.get(this._colorBlendValues[colorBlendIndex]) +
            this._alphaBlendMap.get(this._alphaBlendValues[alphablendIndex]),
          shaderSetIndex
        );

        // 一个组合结束时更新着色器索引
        shaderSetIndex += ShaderType.ShaderType_Count;
      }
    }
  }

  /**
   * 生成混合模式用着色器程序
   *
   * @param colorBlendMacro 颜色混合宏
   * @param alphaBlendMacro 透明度混合宏
   * @param shaderSetBaseIndex _shaderSets 的索引
   */
  private generateBlendShader(
    colorBlendMacro: string,
    alphaBlendMacro: string,
    shaderSetBaseIndex: number
  ): void {
    for (
      let shaderTypeIndex: ShaderType = 0;
      shaderTypeIndex < ShaderType.ShaderType_Count;
      shaderTypeIndex++
    ) {
      // 每次循环初始化着色器源码
      let vertexShaderSrc: string = '';
      let fragmentShaderStr: string = 'precision mediump float;\n';

      // 着色器种类变化时更改索引
      const shaderSetIndex = shaderSetBaseIndex + shaderTypeIndex;

      // 宏定义
      fragmentShaderStr += colorBlendMacro;
      fragmentShaderStr += alphaBlendMacro;

      // 根据混合模式种类定义宏
      fragmentShaderStr += this._fragShaderSrcColorBlend;
      fragmentShaderStr += this._fragShaderSrcAlphaBlend;

      // 根据着色器种类定义宏
      if (
        shaderTypeIndex == ShaderType.ShaderType_Masked ||
        shaderTypeIndex == ShaderType.ShaderType_MaskedInverted
      ) {
        const clippingMaskMacro = '#define CLIPPING_MASK\n';
        vertexShaderSrc += clippingMaskMacro;
        fragmentShaderStr += clippingMaskMacro;
      }

      // 从文件读取着色器本体源码
      vertexShaderSrc += this._vertShaderSrcBlend;
      fragmentShaderStr += this._fragShaderSrcBlend;

      // 生成着色器程序
      this._shaderSets[shaderSetIndex].shaderProgram = this.loadShaderProgram(
        vertexShaderSrc,
        fragmentShaderStr
      );

      // 链接着色器程序变量
      this._shaderSets[shaderSetIndex].attributePositionLocation =
        this.gl.getAttribLocation(
          this._shaderSets[shaderSetIndex].shaderProgram,
          'a_position'
        );
      this._shaderSets[shaderSetIndex].attributeTexCoordLocation =
        this.gl.getAttribLocation(
          this._shaderSets[shaderSetIndex].shaderProgram,
          'a_texCoord'
        );
      this._shaderSets[shaderSetIndex].samplerTexture0Location =
        this.gl.getUniformLocation(
          this._shaderSets[shaderSetIndex].shaderProgram,
          's_texture0'
        );
      this._shaderSets[shaderSetIndex].uniformMatrixLocation =
        this.gl.getUniformLocation(
          this._shaderSets[shaderSetIndex].shaderProgram,
          'u_matrix'
        );
      this._shaderSets[shaderSetIndex].uniformBaseColorLocation =
        this.gl.getUniformLocation(
          this._shaderSets[shaderSetIndex].shaderProgram,
          'u_baseColor'
        );
      this._shaderSets[shaderSetIndex].uniformMultiplyColorLocation =
        this.gl.getUniformLocation(
          this._shaderSets[shaderSetIndex].shaderProgram,
          'u_multiplyColor'
        );
      this._shaderSets[shaderSetIndex].uniformScreenColorLocation =
        this.gl.getUniformLocation(
          this._shaderSets[shaderSetIndex].shaderProgram,
          'u_screenColor'
        );

      // 混合模式用纹理
      this._shaderSets[shaderSetIndex].samplerFrameBufferTextureLocation =
        this.gl.getUniformLocation(
          this._shaderSets[shaderSetIndex].shaderProgram,
          's_blendTexture'
        );

      // 裁剪对象的情况
      if (
        shaderTypeIndex == ShaderType.ShaderType_Masked ||
        shaderTypeIndex == ShaderType.ShaderType_MaskedInverted
      ) {
        // 遮罩用纹理
        this._shaderSets[shaderSetIndex].samplerTexture1Location =
          this.gl.getUniformLocation(
            this._shaderSets[shaderSetIndex].shaderProgram,
            's_texture1'
          );

        // 裁剪用矩阵
        this._shaderSets[shaderSetIndex].uniformClipMatrixLocation =
          this.gl.getUniformLocation(
            this._shaderSets[shaderSetIndex].shaderProgram,
            'u_clipMatrix'
          );

        // 通道标志
        this._shaderSets[shaderSetIndex].uniformChannelFlagLocation =
          this.gl.getUniformLocation(
            this._shaderSets[shaderSetIndex].shaderProgram,
            'u_channelFlag'
          );

        // 反转遮罩用值（反转时赋值为 1.0）
        this._shaderSets[shaderSetIndex].uniformInvertMaskFlagLocation =
          this.gl.getUniformLocation(
            this._shaderSets[shaderSetIndex].shaderProgram,
            'u_invertClippingMask'
          );
      }
    }
  }

  /**
   * 加载着色器程序并返回地址
   *
   * @param vertexShaderSource    顶点着色器源码
   * @param fragmentShaderSource  片段着色器源码
   *
   * @return 着色器程序地址
   */
  public loadShaderProgram(
    vertexShaderSource: string,
    fragmentShaderSource: string
  ): WebGLProgram {
    // 创建着色器程序
    let shaderProgram: WebGLProgram = this.gl.createProgram();

    let vertShader = this.compileShaderSource(
      this.gl.VERTEX_SHADER,
      vertexShaderSource
    );

    if (!vertShader) {
      CubismLogError('Vertex shader compile error!');
      return 0;
    }

    let fragShader = this.compileShaderSource(
      this.gl.FRAGMENT_SHADER,
      fragmentShaderSource
    );
    if (!fragShader) {
      CubismLogError('Fragment shader compile error!');
      return 0;
    }

    // 将顶点着色器附加到程序
    this.gl.attachShader(shaderProgram, vertShader);

    // 将片段着色器附加到程序
    this.gl.attachShader(shaderProgram, fragShader);

    // 链接程序
    this.gl.linkProgram(shaderProgram);
    const linkStatus = this.gl.getProgramParameter(
      shaderProgram,
      this.gl.LINK_STATUS
    );

    // 链接失败则删除着色器
    if (!linkStatus) {
      CubismLogError('Failed to link program: {0}', shaderProgram);

      this.gl.deleteShader(vertShader);
      vertShader = 0;

      this.gl.deleteShader(fragShader);
      fragShader = 0;

      if (shaderProgram) {
        this.gl.deleteProgram(shaderProgram);
        shaderProgram = 0;
      }

      return 0;
    }

    // 释放顶点和片段着色器
    this.gl.deleteShader(vertShader);
    this.gl.deleteShader(fragShader);

    return shaderProgram;
  }

  /**
   * 编译着色器程序
   *
   * @param shaderType 着色器类型（Vertex/Fragment）
   * @param shaderSource 着色器源码
   *
   * @return 编译后的着色器程序
   */
  public compileShaderSource(
    shaderType: GLenum,
    shaderSource: string
  ): WebGLProgram {
    const source: string = shaderSource;

    const shader: WebGLProgram = this.gl.createShader(shaderType);
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);

    if (!shader) {
      const log: string = this.gl.getShaderInfoLog(shader);
      CubismLogError('Shader compile log: {0} ', log);
    }

    const status: any = this.gl.getShaderParameter(
      shader,
      this.gl.COMPILE_STATUS
    );
    if (!status) {
      const log: string = this.gl.getShaderInfoLog(shader);
      CubismLogError('Shader compile log: {0} ', log);
      this.gl.deleteShader(shader);
      return null;
    }

    return shader;
  }

  /**
   * 设置 WebGL 渲染上下文
   *
   * @param gl WebGL 渲染上下文
   */
  public setGl(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.gl = gl;
  }

  /**
   * 设置混合模式用着色器路径
   *
   * @param shaderPath 着色器路径
   */
  public setShaderPath(shaderPath: string): void {
    this._shaderPath = shaderPath;
  }

  /**
   * 获取着色器路径
   *
   * @return 着色器路径
   */
  public getShaderPath(): string {
    return this._shaderPath;
  }

  _shaderSets: Array<CubismShaderSet>; // 保存已加载着色器程序的变量
  gl: WebGLRenderingContext | WebGL2RenderingContext; // WebGL 上下文

  _colorBlendMap: Map<CubismColorBlend, string>; // 颜色混合值与名称的映射变量
  _alphaBlendMap: Map<CubismAlphaBlend, string>; // 透明度混合值与名称的映射变量

  _colorBlendValues: Array<CubismColorBlend>; // 保存颜色混合值的变量
  _alphaBlendValues: Array<CubismAlphaBlend>; // 保存透明度混合值的变量

  _blendShaderSetMap: Map<string, number>; // 混合模式用着色器名称与索引的映射变量

  _shaderCount: number; // 着色器程序数量

  _vertShaderSrc: string; // 顶点着色器源码
  _vertShaderSrcMasked: string; // 遮罩用顶点着色器源码
  _vertShaderSrcSetupMask: string; // 遮罩用顶点着色器源码
  _fragShaderSrcSetupMask: string; // 遮罩用片段着色器源码
  _fragShaderSrcPremultipliedAlpha: string; // 预乘 alpha 用片段着色器源码
  _fragShaderSrcMaskPremultipliedAlpha: string; // 遮罩用预乘 alpha 片段着色器源码
  _fragShaderSrcMaskInvertedPremultipliedAlpha: string; // 反转遮罩用预乘 alpha 片段着色器源码

  _vertShaderSrcCopy: string; // 复制用顶点着色器源码
  _fragShaderSrcCopy: string; // 复制用片段着色器源码

  _fragShaderSrcColorBlend: string; // 混合模式用着色器源码
  _fragShaderSrcAlphaBlend: string; // 透明度混合用着色器源码
  _vertShaderSrcBlend: string; // 混合模式用顶点着色器源码
  _fragShaderSrcBlend: string; // 混合模式用片段着色器源码
  _isShaderLoading: boolean; // 是否正在读取着色器
  _isShaderLoaded: boolean; // 着色器读取是否完成
  _defaultShaderPath: string; // 默认着色器路径
  _shaderPath: string; // 着色器路径
  _instanceId: number; // 调试用的实例 id
  static _instanceCounter = 0;
}

/**
 * 为每个 GLContext 分配 CubismShader_WebGL 的类
 * 是单例类，通过 CubismShaderManager_WebGL.getInstance 访问。
 */
export class CubismShaderManager_WebGL {
  /**
   * 获取实例（单例）
   *
   * @return 实例
   */
  public static getInstance(): CubismShaderManager_WebGL {
    if (s_instance == null) {
      s_instance = new CubismShaderManager_WebGL();
    }
    return s_instance;
  }

  /**
   * 释放实例（单例）
   */
  public static deleteInstance(): void {
    if (s_instance) {
      s_instance.release();
      s_instance = null;
    }
  }

  /**
   * 私有构造函数
   */
  private constructor() {
    this._shaderMap = new Map<WebGLRenderingContext, CubismShader_WebGL>();
  }

  /**
   * 析构对应处理
   */
  public release(): void {
    for (const item of this._shaderMap) {
      item[1].release();
    }
    this._shaderMap.clear();
  }

  /**
   * 以 GLContext 为键获取 Shader
   *
   * @param gl gl 上下文
   *
   * @return 返回 shader
   */
  public getShader(gl: WebGLRenderingContext): CubismShader_WebGL {
    return this._shaderMap.get(gl);
  }

  /**
   * 注册 GLContext
   *
   * @param gl gl 上下文
   */
  public setGlContext(gl: WebGLRenderingContext): void {
    if (!this._shaderMap.has(gl)) {
      const instance = new CubismShader_WebGL();
      instance.setGl(gl);
      this._shaderMap.set(gl, instance);
    }
  }

  /**
   * 保存每个 GLContext 对应 Shader 的变量
   */
  private _shaderMap: Map<WebGLRenderingContext, CubismShader_WebGL>;
}

/**
 * CubismShader_WebGL 的内部类
 */
export class CubismShaderSet {
  shaderProgram: WebGLProgram; // 着色器程序地址
  attributePositionLocation: GLuint; // 传递给着色器程序的变量地址（Position）
  attributeTexCoordLocation: GLuint; // 传递给着色器程序的变量地址（TexCoord）
  uniformMatrixLocation: WebGLUniformLocation; // 传递给着色器程序的变量地址（Matrix）
  uniformClipMatrixLocation: WebGLUniformLocation; // 传递给着色器程序的变量地址（ClipMatrix）
  samplerTexture0Location: WebGLUniformLocation; // 传递给着色器程序的变量地址（Texture0）
  samplerTexture1Location: WebGLUniformLocation; // 传递给着色器程序的变量地址（Texture1）
  uniformBaseColorLocation: WebGLUniformLocation; // 传递给着色器程序的变量地址（BaseColor）
  uniformChannelFlagLocation: WebGLUniformLocation; // 传递给着色器程序的变量地址（ChannelFlag）
  uniformMultiplyColorLocation: WebGLUniformLocation; // 传递给着色器程序的变量地址（MultiplyColor）
  uniformScreenColorLocation: WebGLUniformLocation; // 传递给着色器程序的变量地址（ScreenColor）
  samplerFrameBufferTextureLocation: WebGLUniformLocation; // 传递给着色器程序的变量地址（BlendTexture）
  uniformInvertMaskFlagLocation: WebGLUniformLocation; // 传递给着色器程序的变量地址（InvertMask）
}

/**
 * 定义着色器名称的枚举
 */
export enum ShaderNames {
  // 设置遮罩
  ShaderNames_SetupMask,

  // 普通
  ShaderNames_NormalPremultipliedAlpha,
  ShaderNames_NormalMaskedPremultipliedAlpha,
  ShaderNames_NomralMaskedInvertedPremultipliedAlpha,

  // 加算
  ShaderNames_AddPremultipliedAlpha,
  ShaderNames_AddMaskedPremultipliedAlpha,
  ShaderNames_AddMaskedPremultipliedAlphaInverted,

  // 乘算
  ShaderNames_MultPremultipliedAlpha,
  ShaderNames_MultMaskedPremultipliedAlpha,
  ShaderNames_MultMaskedPremultipliedAlphaInverted,

  // 着色器数量
  ShaderNames_ShaderCount
}

/**
 * 定义着色器种类的枚举
 */
export enum ShaderType {
  ShaderType_Normal = 0,
  ShaderType_Masked = 1,
  ShaderType_MaskedInverted = 2,
  ShaderType_Count
}

// 兼容性命名空间定义。
import * as $ from './cubismshader_webgl';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismShaderSet = $.CubismShaderSet;
  export type CubismShaderSet = $.CubismShaderSet;
  export const CubismShader_WebGL = $.CubismShader_WebGL;
  export type CubismShader_WebGL = $.CubismShader_WebGL;
  export const CubismShaderManager_WebGL = $.CubismShaderManager_WebGL;
  export type CubismShaderManager_WebGL = $.CubismShaderManager_WebGL;
  export const ShaderNames = $.ShaderNames;
  export type ShaderNames = $.ShaderNames;
}
