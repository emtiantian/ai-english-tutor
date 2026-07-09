// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { Constant } from '../live2dcubismframework';
import { csmRect } from '../type/csmrectf';
import { CubismMatrix44 } from '../math/cubismmatrix44';
import { CubismModel } from '../model/cubismmodel';
import { CubismClippingContext, CubismTextureColor } from './cubismrenderer';
import { CubismLogError, CubismLogWarning } from '../utils/cubismdebug';

const ColorChannelCount = 4; // 实验时单通道为1，仅RGB为3，包含Alpha则为4
const ClippingMaskMaxCountOnDefault = 36; // 普通帧缓冲单张的最大遮罩数
const ClippingMaskMaxCountOnMultiRenderTexture = 32; // 存在2张以上帧缓冲时单张的最大遮罩数

export type ClippingContextConstructor<
  T_ClippingContext extends CubismClippingContext
> = new (
  manager: CubismClippingManager<T_ClippingContext>,
  drawableMasks: Int32Array,
  drawableMaskCounts: number
) => T_ClippingContext;

export interface ICubismClippingManager {
  getClippingMaskBufferSize(): number;
}

export abstract class CubismClippingManager<
  T_ClippingContext extends CubismClippingContext
> implements ICubismClippingManager {
  /**
   * 构造函数
   */
  public constructor(
    clippingContextFactory: ClippingContextConstructor<T_ClippingContext>
  ) {
    this._renderTextureCount = 0;
    this._clippingMaskBufferSize = 256;
    this._clippingContextListForMask = new Array<T_ClippingContext>();
    this._clippingContextListForDraw = new Array<T_ClippingContext>();
    this._clippingContextListForOffscreen = new Array<T_ClippingContext>();
    this._tmpBoundsOnModel = new csmRect();
    this._tmpMatrix = new CubismMatrix44();
    this._tmpMatrixForMask = new CubismMatrix44();
    this._tmpMatrixForDraw = new CubismMatrix44();
    this._clearedMaskBufferFlags = new Array<boolean>();

    this._clippingContexttConstructor = clippingContextFactory;

    this._channelColors = [
      new CubismTextureColor(1.0, 0.0, 0.0, 0.0),
      new CubismTextureColor(0.0, 1.0, 0.0, 0.0),
      new CubismTextureColor(0.0, 0.0, 1.0, 0.0),
      new CubismTextureColor(0.0, 0.0, 0.0, 1.0)
    ];
  }

  /**
   * 相当于析构函数的处理
   */
  public release(): void {
    for (let i = 0; i < this._clippingContextListForMask.length; i++) {
      if (this._clippingContextListForMask[i]) {
        this._clippingContextListForMask[i].release();
        this._clippingContextListForMask[i] = void 0;
      }
      this._clippingContextListForMask[i] = null;
    }
    this._clippingContextListForMask = null;

    // _clippingContextListForDraw 指向 _clippingContextListForMask 中的实例，因此上述处理后无需逐个 DELETE 元素。
    for (let i = 0; i < this._clippingContextListForDraw.length; i++) {
      this._clippingContextListForDraw[i] = null;
    }
    this._clippingContextListForDraw = null;

    for (let i = 0; i < this._channelColors.length; i++) {
      this._channelColors[i] = null;
    }

    this._channelColors = null;

    if (this._clearedMaskBufferFlags != null) {
      this._clearedMaskBufferFlags.length = 0;
    }
    this._clearedMaskBufferFlags = null;
  }

  /**
   * 管理器的初始化处理
   * 注册使用裁剪遮罩的绘制对象
   * @param model 模型实例
   * @param renderTextureCount 缓冲的生成数量
   */
  public initializeForDrawable(
    model: CubismModel,
    renderTextureCount: number
  ): void {
    // 设置渲染纹理的总数
    // 若非大于等于1的整数则分别发出警告
    if (renderTextureCount % 1 != 0) {
      CubismLogWarning(
        'The number of render textures must be specified as an integer. The decimal point is rounded down and corrected to an integer.'
      );
      // 去除小数部分
      renderTextureCount = ~~renderTextureCount;
    }
    if (renderTextureCount < 1) {
      CubismLogWarning(
        'The number of render textures must be an integer greater than or equal to 1. Set the number of render textures to 1.'
      );
    }
    // 若使用了负值则强制设为1张
    this._renderTextureCount = renderTextureCount < 1 ? 1 : renderTextureCount;

    this._clearedMaskBufferFlags = new Array<boolean>(this._renderTextureCount);

    // 注册所有使用裁剪遮罩的绘制对象
    // 裁剪遮罩通常应限制在数个以内使用
    this._clippingContextListForDraw.length = model.getDrawableCount();
    for (let i = 0; i < model.getDrawableCount(); i++) {
      if (model.getDrawableMaskCounts()[i] <= 0) {
        // 未使用裁剪遮罩的 ArtMesh（多数情况下不使用）
        this._clippingContextListForDraw[i] = null;
        continue;
      }

      // 检查是否与已有的 ClipContext 相同
      let clippingContext: T_ClippingContext = this.findSameClip(
        model.getDrawableMasks()[i],
        model.getDrawableMaskCounts()[i]
      );
      if (clippingContext == null) {
        // 不存在相同遮罩时则创建

        clippingContext = new this._clippingContexttConstructor(
          this,
          model.getDrawableMasks()[i],
          model.getDrawableMaskCounts()[i]
        );
        this._clippingContextListForMask.push(clippingContext);
      }

      clippingContext.addClippedDrawable(i);

      this._clippingContextListForDraw[i] = clippingContext;
    }
  }

  /**
   * 离屏用初始化处理
   *
   * @param model 模型实例
   * @param maskBufferCount 离屏用遮罩缓冲数量
   */
  public initializeForOffscreen(
    model: CubismModel,
    maskBufferCount: number
  ): void {
    this._renderTextureCount = maskBufferCount;

    // 设置渲染纹理的清除标志
    this._clearedMaskBufferFlags.length = this._renderTextureCount;
    for (let i = 0; i < this._renderTextureCount; ++i) {
      this._clearedMaskBufferFlags[i] = false;
    }

    //注册所有使用裁剪遮罩的绘制对象
    //裁剪遮罩通常应限制在数个以内使用
    this._clippingContextListForOffscreen.length = model.getOffscreenCount();
    for (let i = 0; i < model.getOffscreenCount(); ++i) {
      if (model.getOffscreenMaskCounts()[i] <= 0) {
        //未使用裁剪遮罩的离屏对象（多数情况下不使用）
        this._clippingContextListForOffscreen.push(null);
        continue;
      }

      // 检查是否与已有的 ClipContext 相同
      let cc = this.findSameClip(
        model.getOffscreenMasks()[i],
        model.getOffscreenMaskCounts()[i]
      );
      if (cc == null) {
        // 不存在相同遮罩时则创建
        cc = new this._clippingContexttConstructor(
          this,
          model.getOffscreenMasks()[i],
          model.getOffscreenMaskCounts()[i]
        );
        this._clippingContextListForMask.push(cc);
      }

      cc.addClippedOffscreen(i);

      this._clippingContextListForOffscreen[i] = cc;
    }
  }

  /**
   * 确认是否已创建遮罩
   * 若已创建则返回对应的裁剪遮罩实例
   * 未创建则返回 NULL
   * @param drawableMasks 用于遮罩绘制对象的绘制对象列表
   * @param drawableMaskCounts 用于遮罩绘制对象的绘制对象数量
   * @return 存在对应裁剪遮罩则返回实例，否则返回 NULL
   */
  public findSameClip(
    drawableMasks: Int32Array,
    drawableMaskCounts: number
  ): T_ClippingContext {
    // 确认是否与已创建的 ClippingContext 一致
    for (let i = 0; i < this._clippingContextListForMask.length; i++) {
      const clippingContext: T_ClippingContext =
        this._clippingContextListForMask[i];
      const count: number = clippingContext._clippingIdCount;

      // 数量不同则为不同对象
      if (count != drawableMaskCounts) {
        continue;
      }

      let sameCount = 0;

      // 确认是否持有相同 ID。数组数量相同，因此若匹配数量相同则认为持有相同对象
      for (let j = 0; j < count; j++) {
        const clipId: number = clippingContext._clippingIdList[j];

        for (let k = 0; k < count; k++) {
          if (drawableMasks[k] == clipId) {
            sameCount++;
            break;
          }
        }
      }

      if (sameCount == count) {
        return clippingContext;
      }
    }

    return null; // 未找到
  }

  /**
   * 计算高精度遮罩处理用的矩阵
   * @param model 模型实例
   * @param isRightHanded 处理是否为右手坐标系
   */
  public setupMatrixForHighPrecision(
    model: CubismModel,
    isRightHanded: boolean
  ): void {
    // 准备所有裁剪
    // 使用相同裁剪（多个时合并为一个裁剪）时只设置一次
    let usingClipCount = 0;
    for (
      let clipIndex = 0;
      clipIndex < this._clippingContextListForMask.length;
      clipIndex++
    ) {
      // 针对单个裁剪遮罩
      const cc: T_ClippingContext = this._clippingContextListForMask[clipIndex];

      // 计算围绕使用该裁剪的绘制对象群的矩形
      this.calcClippedDrawableTotalBounds(model, cc);

      if (cc._isUsing) {
        usingClipCount++; // 按使用中计数
      }
    }

    // 遮罩矩阵创建处理
    if (usingClipCount > 0) {
      this.setupLayoutBounds(0);

      // 若大小与渲染纹理数量不一致则对齐
      if (this._clearedMaskBufferFlags.length != this._renderTextureCount) {
        this._clearedMaskBufferFlags.length = this._renderTextureCount;
        for (let i = 0; i < this._renderTextureCount; i++) {
          this._clearedMaskBufferFlags[i] = false;
        }
      } else {
        // 在每帧开始时初始化遮罩清除标志
        for (let i = 0; i < this._renderTextureCount; i++) {
          this._clearedMaskBufferFlags[i] = false;
        }
      }

      // 实际生成遮罩
      // 决定所有遮罩如何布局绘制，并记录到 ClipContext、ClippedDrawContext 中
      for (
        let clipIndex = 0;
        clipIndex < this._clippingContextListForMask.length;
        clipIndex++
      ) {
        // --- 实际绘制单个遮罩 ---
        const clipContext: T_ClippingContext =
          this._clippingContextListForMask[clipIndex];
        const allClippedDrawRect: csmRect = clipContext._allClippedDrawRect; // 使用该遮罩的所有绘制对象在逻辑坐标上的包围矩形
        const layoutBoundsOnTex01 = clipContext._layoutBounds; // 将遮罩收纳于此区域内
        const margin = 0.05;
        let scaleX = 0.0;
        let scaleY = 0.0;
        const ppu: number = model.getPixelsPerUnit();
        const maskPixelSize: number = clipContext
          .getClippingManager()
          .getClippingMaskBufferSize();
        const physicalMaskWidth: number =
          layoutBoundsOnTex01.width * maskPixelSize;
        const physicalMaskHeight: number =
          layoutBoundsOnTex01.height * maskPixelSize;

        this._tmpBoundsOnModel.setRect(allClippedDrawRect);
        if (this._tmpBoundsOnModel.width * ppu > physicalMaskWidth) {
          this._tmpBoundsOnModel.expand(allClippedDrawRect.width * margin, 0.0);
          scaleX = layoutBoundsOnTex01.width / this._tmpBoundsOnModel.width;
        } else {
          scaleX = ppu / physicalMaskWidth;
        }

        if (this._tmpBoundsOnModel.height * ppu > physicalMaskHeight) {
          this._tmpBoundsOnModel.expand(
            0.0,
            allClippedDrawRect.height * margin
          );
          scaleY = layoutBoundsOnTex01.height / this._tmpBoundsOnModel.height;
        } else {
          scaleY = ppu / physicalMaskHeight;
        }

        // 计算生成遮罩时使用的矩阵
        this.createMatrixForMask(
          isRightHanded,
          layoutBoundsOnTex01,
          scaleX,
          scaleY
        );

        clipContext._matrixForMask.setMatrix(this._tmpMatrixForMask.getArray());
        clipContext._matrixForDraw.setMatrix(this._tmpMatrixForDraw.getArray());
      }
    }
  }

  /**
   * 计算离屏高精度遮罩处理用的矩阵
   *
   * @param model 模型实例
   * @param isRightHanded 处理是否为右手坐标系
   * @param mvp 模型视图投影矩阵
   */
  public setupMatrixForOffscreenHighPrecision(
    model: CubismModel,
    isRightHanded: boolean,
    mvp: CubismMatrix44
  ): void {
    // 准备所有裁剪
    // 使用相同裁剪（多个时合并为一个裁剪）时只设置一次
    let usingClipCount = 0;
    for (
      let clipIndex = 0;
      clipIndex < this._clippingContextListForMask.length;
      clipIndex++
    ) {
      // 针对单个裁剪遮罩
      const cc: T_ClippingContext = this._clippingContextListForMask[clipIndex];

      // 计算围绕使用该裁剪的绘制对象群的矩形
      this.calcClippedOffscreenTotalBounds(model, cc);

      if (cc._isUsing) {
        usingClipCount++; //按使用中计数
      }
    }

    if (usingClipCount <= 0) {
      return;
    }
    // 遮罩矩阵创建处理
    this.setupLayoutBounds(0);

    // 若大小与渲染纹理数量不一致则对齐
    if (this._clearedMaskBufferFlags.length != this._renderTextureCount) {
      this._clearedMaskBufferFlags.length = this._renderTextureCount;

      for (let i = 0; i < this._renderTextureCount; ++i) {
        this._clearedMaskBufferFlags[i] = false;
      }
    } else {
      // 在每帧开始时初始化遮罩清除标志
      for (let i = 0; i < this._renderTextureCount; ++i) {
        this._clearedMaskBufferFlags[i] = false;
      }
    }

    // 实际生成遮罩
    // 决定所有遮罩如何布局绘制，并记录到 ClipContext、ClippedDrawContext 中
    for (
      let clipIndex = 0;
      clipIndex < this._clippingContextListForMask.length;
      clipIndex++
    ) {
      // --- 实际绘制单个遮罩 ---
      const clipContext = this._clippingContextListForMask[clipIndex];
      const allClippedDrawRect = clipContext._allClippedDrawRect; //使用该遮罩的所有绘制对象在逻辑坐标上的包围矩形
      const layoutBoundsOnTex01 = clipContext._layoutBounds; //将遮罩收纳于此区域内
      const margin = 0.05;
      let scaleX = 0.0;
      let scaleY = 0.0;
      const ppu = model.getPixelsPerUnit();
      const maskPixel = clipContext
        .getClippingManager()
        .getClippingMaskBufferSize();
      const physicalMaskWidth = layoutBoundsOnTex01.width * maskPixel;
      const physicalMaskHeight = layoutBoundsOnTex01.height * maskPixel;

      this._tmpBoundsOnModel.setRect(allClippedDrawRect);
      if (this._tmpBoundsOnModel.width * ppu > physicalMaskWidth) {
        this._tmpBoundsOnModel.expand(allClippedDrawRect.width * margin, 0.0);
        scaleX = layoutBoundsOnTex01.width / this._tmpBoundsOnModel.width;
      } else {
        scaleX = ppu / physicalMaskWidth;
      }

      if (this._tmpBoundsOnModel.height * ppu > physicalMaskHeight) {
        this._tmpBoundsOnModel.expand(0.0, allClippedDrawRect.height * margin);
        scaleY = layoutBoundsOnTex01.height / this._tmpBoundsOnModel.height;
      } else {
        scaleY = ppu / physicalMaskHeight;
      }

      // 计算生成遮罩时使用的矩阵
      this.createMatrixForMask(
        isRightHanded,
        layoutBoundsOnTex01,
        scaleX,
        scaleY
      );

      clipContext._matrixForMask.setMatrix(this._tmpMatrixForMask.getArray());
      clipContext._matrixForDraw.setMatrix(this._tmpMatrixForDraw.getArray());

      // clipContext * mvp^-1
      const invertMvp = mvp.getInvert();
      clipContext._matrixForDraw.multiplyByMatrix(invertMvp);
    }
  }

  /**
   * 计算使用遮罩的绘制对象群的整体矩形。
   *
   * @param model 模型实例
   * @param clippingContext 裁剪上下文
   */
  public calcClippedOffscreenTotalBounds(
    model: CubismModel,
    clippingContext: T_ClippingContext
  ): void {
    // 被裁剪遮罩（即被遮罩的绘制对象）的整体矩形
    let clippedDrawTotalMinX = Number.MAX_VALUE,
      clippedDrawTotalMinY = Number.MAX_VALUE;
    let clippedDrawTotalMaxX = -Number.MAX_VALUE,
      clippedDrawTotalMaxY = -Number.MAX_VALUE;

    // 判断该遮罩是否实际需要
    // 只要有一个使用该裁剪的「绘制对象」可用，就需要生成遮罩
    const clippedOffscreenCount =
      clippingContext._clippedOffscreenIndexList.length;

    const clippedOffscreenChildDrawableIndexList = new Array<number>();
    for (
      let clippedOffscreenIndex = 0;
      clippedOffscreenIndex < clippedOffscreenCount;
      clippedOffscreenIndex++
    ) {
      // 求使用遮罩的绘制对象的绘制矩形
      const offscreenIndex =
        clippingContext._clippedOffscreenIndexList[clippedOffscreenIndex];

      this.getOffscreenChildDrawableIndexList(
        model,
        offscreenIndex,
        clippedOffscreenChildDrawableIndexList
      );
    }

    const childDrawableCount = clippedOffscreenChildDrawableIndexList.length;
    for (
      let childDrawableIndex = 0;
      childDrawableIndex < childDrawableCount;
      childDrawableIndex++
    ) {
      const drawableVertexCount = model.getDrawableVertexCount(
        clippedOffscreenChildDrawableIndexList[childDrawableIndex]
      );
      const drawableVertexes = model.getDrawableVertices(
        clippedOffscreenChildDrawableIndexList[childDrawableIndex]
      );

      let minX = Number.MAX_VALUE,
        minY = Number.MAX_VALUE;
      let maxX = -Number.MAX_VALUE,
        maxY = -Number.MAX_VALUE;

      const loop = drawableVertexCount * Constant.vertexStep;
      for (
        let pi = Constant.vertexOffset;
        pi < loop;
        pi += Constant.vertexStep
      ) {
        const x = drawableVertexes[pi];
        const y = drawableVertexes[pi + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }

      if (minX == Number.MAX_VALUE) continue; // 未取到任何有效点，跳过

      // 反映到整体矩形
      if (minX < clippedDrawTotalMinX) clippedDrawTotalMinX = minX;
      if (minY < clippedDrawTotalMinY) clippedDrawTotalMinY = minY;
      if (maxX > clippedDrawTotalMaxX) clippedDrawTotalMaxX = maxX;
      if (maxY > clippedDrawTotalMaxY) clippedDrawTotalMaxY = maxY;
    }

    if (clippedDrawTotalMinX == Number.MAX_VALUE) {
      clippingContext._allClippedDrawRect.x = 0.0;
      clippingContext._allClippedDrawRect.y = 0.0;
      clippingContext._allClippedDrawRect.width = 0.0;
      clippingContext._allClippedDrawRect.height = 0.0;
      clippingContext._isUsing = false;
    } else {
      clippingContext._isUsing = true;
      const w = clippedDrawTotalMaxX - clippedDrawTotalMinX;
      const h = clippedDrawTotalMaxY - clippedDrawTotalMinY;
      clippingContext._allClippedDrawRect.x = clippedDrawTotalMinX;
      clippingContext._allClippedDrawRect.y = clippedDrawTotalMinY;
      clippingContext._allClippedDrawRect.width = w;
      clippingContext._allClippedDrawRect.height = h;
    }
  }

  /**
   * 计算使用遮罩的绘制对象群的整体矩形。
   *
   * @param model 模型实例
   * @param offscreenIndex 离屏索引
   * @param childDrawableIndexList 离屏子 Drawable 的索引列表
   */
  public getOffscreenChildDrawableIndexList(
    model: CubismModel,
    offscreenIndex: number,
    childDrawableIndexList: Array<number>
  ): void {
    // 获取父对象
    const ownerIndex = model.getOffscreenOwnerIndices()[offscreenIndex];

    // 仅部件
    this.getPartChildDrawableIndexList(
      model,
      ownerIndex,
      childDrawableIndexList
    );
  }

  /**
   * 获取部件子 Drawable 的索引列表。
   *
   * @param model 模型实例
   * @param partIndex 部件索引
   * @param childDrawableIndexList 部件子 Drawable 的索引列表
   */
  public getPartChildDrawableIndexList(
    model: CubismModel,
    partIndex: number,
    childDrawableIndexList: Array<number>
  ): void {
    const childDrawObjects =
      model.getPartsHierarchy()[partIndex].childDrawObjects;
    childDrawableIndexList.push(...childDrawObjects.drawableIndices);

    for (let i = 0; i < childDrawObjects.offscreenIndices.length; ++i) {
      this.getOffscreenChildDrawableIndexList(
        model,
        childDrawObjects.offscreenIndices[i],
        childDrawableIndexList
      );
    }
  }

  /**
   * 创建遮罩生成与绘制用的矩阵。
   * @param isRightHanded 指定是否将坐标作为右手系处理
   * @param layoutBoundsOnTex01 收纳遮罩的区域
   * @param scaleX 绘制对象的伸缩率
   * @param scaleY 绘制对象的伸缩率
   */
  public createMatrixForMask(
    isRightHanded: boolean,
    layoutBoundsOnTex01: csmRect,
    scaleX: number,
    scaleY: number
  ): void {
    this._tmpMatrix.loadIdentity();
    {
      // 将 Layout0..1 转换到 -1..1
      this._tmpMatrix.translateRelative(-1.0, -1.0);
      this._tmpMatrix.scaleRelative(2.0, 2.0);
    }
    {
      // view 转换到 Layout0..1
      this._tmpMatrix.translateRelative(
        layoutBoundsOnTex01.x,
        layoutBoundsOnTex01.y
      ); //new = [平移]
      this._tmpMatrix.scaleRelative(scaleX, scaleY); //new = [平移][缩放]
      this._tmpMatrix.translateRelative(
        -this._tmpBoundsOnModel.x,
        -this._tmpBoundsOnModel.y
      ); //new = [平移][缩放][平移]
    }
    // tmpMatrixForMask 为计算结果
    this._tmpMatrixForMask.setMatrix(this._tmpMatrix.getArray());

    this._tmpMatrix.loadIdentity();
    {
      this._tmpMatrix.translateRelative(
        layoutBoundsOnTex01.x,
        layoutBoundsOnTex01.y * (isRightHanded ? -1.0 : 1.0)
      ); //new = [平移]
      this._tmpMatrix.scaleRelative(
        scaleX,
        scaleY * (isRightHanded ? -1.0 : 1.0)
      ); //new = [平移][缩放]
      this._tmpMatrix.translateRelative(
        -this._tmpBoundsOnModel.x,
        -this._tmpBoundsOnModel.y
      ); //new = [平移][缩放][平移]
    }

    this._tmpMatrixForDraw.setMatrix(this._tmpMatrix.getArray());
  }

  /**
   * 裁剪上下文的布局
   * 尽量充分利用指定数量的渲染纹理来布局遮罩
   * 遮罩组数量为4及以下时，RGBA 各通道各放一个遮罩；5到6时按 2,2,1,1 分配到 RGBA。
   *
   * @param usingClipCount 要布局的裁剪上下文数量
   */
  public setupLayoutBounds(usingClipCount: number): void {
    const useClippingMaskMaxCount =
      this._renderTextureCount <= 1
        ? ClippingMaskMaxCountOnDefault
        : ClippingMaskMaxCountOnMultiRenderTexture * this._renderTextureCount;

    if (usingClipCount <= 0 || usingClipCount > useClippingMaskMaxCount) {
      if (usingClipCount > useClippingMaskMaxCount) {
        // 发出遮罩限制数量的警告
        CubismLogError(
          'not supported mask count : {0}\n[Details] render texture count : {1}, mask count : {2}',
          usingClipCount - useClippingMaskMaxCount,
          this._renderTextureCount,
          usingClipCount
        );
      }
      // 此种情况下每次都清除一个遮罩目标再使用
      for (
        let index = 0;
        index < this._clippingContextListForMask.length;
        index++
      ) {
        const clipContext: T_ClippingContext =
          this._clippingContextListForMask[index];
        clipContext._layoutChannelIndex = 0; // 反正每次都会清除，固定即可
        clipContext._layoutBounds.x = 0.0;
        clipContext._layoutBounds.y = 0.0;
        clipContext._layoutBounds.width = 1.0;
        clipContext._layoutBounds.height = 1.0;
        clipContext._bufferIndex = 0;
      }
      return;
    }

    // 若渲染纹理为1张则9分割（最多36张）
    const layoutCountMaxValue = this._renderTextureCount <= 1 ? 9 : 8;

    // 尽量充分利用指定数量的渲染纹理来布局遮罩（默认为1）。
    // 遮罩组数量为4及以下时，RGBA 各通道各放一个遮罩；5到6时按 2,2,1,1 分配到 RGBA。
    let countPerSheetDiv: number = usingClipCount / this._renderTextureCount; // 每张渲染纹理分配多少张遮罩。
    const reduceLayoutTextureCount: number =
      usingClipCount % this._renderTextureCount; // 减少布局数量的渲染纹理数量（仅有相应数量的渲染纹理会受影响）。

    // 因为要取每张渲染纹理分配的遮罩分割数，所以小数向上取整
    countPerSheetDiv = Math.ceil(countPerSheetDiv);

    // 依次使用 RGBA
    let divCount: number = countPerSheetDiv / ColorChannelCount; // 单个通道配置的基本遮罩数
    const modCount: number = countPerSheetDiv % ColorChannelCount; // 余数，会分配到该序号之前的通道各一个（不是索引）

    // 小数部分舍去
    divCount = ~~divCount;

    // 依次准备 RGBA 各通道（0:R, 1:G, 2:B, 3:A）
    let curClipIndex = 0; // 按顺序设置

    for (
      let renderTextureIndex = 0;
      renderTextureIndex < this._renderTextureCount;
      renderTextureIndex++
    ) {
      for (
        let channelIndex = 0;
        channelIndex < ColorChannelCount;
        channelIndex++
      ) {
        // 该通道要布局的数量
        // NOTE: 布局数 = 单个通道配置的基本遮罩数 + 若该通道要放置余数遮罩则再加1个
        let layoutCount: number = divCount + (channelIndex < modCount ? 1 : 0);

        // 决定减少布局数量时执行该操作的通道
        // div 为0时调整为处于正常索引范围内
        const checkChannelIndex = modCount + (divCount < 1 ? -1 : 0);

        // 当前为对象通道且存在要减少布局数量的渲染纹理时
        if (channelIndex == checkChannelIndex && reduceLayoutTextureCount > 0) {
          // 若当前渲染纹理为目标渲染纹理，则减少布局数量。
          layoutCount -= !(renderTextureIndex < reduceLayoutTextureCount)
            ? 1
            : 0;
        }

        // 决定分割方式
        if (layoutCount == 0) {
          // 什么都不做
        } else if (layoutCount == 1) {
          // 整体直接使用
          const clipContext: T_ClippingContext =
            this._clippingContextListForMask[curClipIndex++];
          clipContext._layoutChannelIndex = channelIndex;
          clipContext._layoutBounds.x = 0.0;
          clipContext._layoutBounds.y = 0.0;
          clipContext._layoutBounds.width = 1.0;
          clipContext._layoutBounds.height = 1.0;
          clipContext._bufferIndex = renderTextureIndex;
        } else if (layoutCount == 2) {
          for (let i = 0; i < layoutCount; i++) {
            let xpos: number = i % 2;

            // 小数部分舍去
            xpos = ~~xpos;

            const cc: T_ClippingContext =
              this._clippingContextListForMask[curClipIndex++];
            cc._layoutChannelIndex = channelIndex;

            // 将 UV 拆成两份使用
            cc._layoutBounds.x = xpos * 0.5;
            cc._layoutBounds.y = 0.0;
            cc._layoutBounds.width = 0.5;
            cc._layoutBounds.height = 1.0;
            cc._bufferIndex = renderTextureIndex;
          }
        } else if (layoutCount <= 4) {
          // 4 分割使用
          for (let i = 0; i < layoutCount; i++) {
            let xpos: number = i % 2;
            let ypos: number = i / 2;

            // 小数部分舍去
            xpos = ~~xpos;
            ypos = ~~ypos;

            const cc = this._clippingContextListForMask[curClipIndex++];
            cc._layoutChannelIndex = channelIndex;

            cc._layoutBounds.x = xpos * 0.5;
            cc._layoutBounds.y = ypos * 0.5;
            cc._layoutBounds.width = 0.5;
            cc._layoutBounds.height = 0.5;
            cc._bufferIndex = renderTextureIndex;
          }
        } else if (layoutCount <= layoutCountMaxValue) {
          // 9 分割使用
          for (let i = 0; i < layoutCount; i++) {
            let xpos = i % 3;
            let ypos = i / 3;

            // 小数部分舍去
            xpos = ~~xpos;
            ypos = ~~ypos;

            const cc: T_ClippingContext =
              this._clippingContextListForMask[curClipIndex++];
            cc._layoutChannelIndex = channelIndex;

            cc._layoutBounds.x = xpos / 3.0;
            cc._layoutBounds.y = ypos / 3.0;
            cc._layoutBounds.width = 1.0 / 3.0;
            cc._layoutBounds.height = 1.0 / 3.0;
            cc._bufferIndex = renderTextureIndex;
          }
        } else {
          // 超过遮罩限制数量时的处理
          CubismLogError(
            'not supported mask count : {0}\n[Details] render texture count : {1}, mask count : {2}',
            usingClipCount - useClippingMaskMaxCount,
            this._renderTextureCount,
            usingClipCount
          );

          // 为避免在 SetupShaderProgram 中发生越界访问，临时填入数值
          // 当然绘制结果将不再正确
          for (let index = 0; index < layoutCount; index++) {
            const cc: T_ClippingContext =
              this._clippingContextListForMask[curClipIndex++];

            cc._layoutChannelIndex = 0;

            cc._layoutBounds.x = 0.0;
            cc._layoutBounds.y = 0.0;
            cc._layoutBounds.width = 1.0;
            cc._layoutBounds.height = 1.0;
            cc._bufferIndex = 0;
          }
        }
      }
    }
  }

  /**
   * 计算被遮罩绘制对象群整体的包围矩形（模型坐标系）
   * @param model 模型实例
   * @param clippingContext 裁剪遮罩上下文
   */
  public calcClippedDrawableTotalBounds(
    model: CubismModel,
    clippingContext: T_ClippingContext
  ): void {
    // 被裁剪遮罩（即被遮罩的绘制对象）的整体矩形
    let clippedDrawTotalMinX: number = Number.MAX_VALUE;
    let clippedDrawTotalMinY: number = Number.MAX_VALUE;
    let clippedDrawTotalMaxX: number = Number.MIN_VALUE;
    let clippedDrawTotalMaxY: number = Number.MIN_VALUE;

    // 判断该遮罩是否实际需要
    // 只要有一个使用该裁剪的「绘制对象」可用，就需要生成遮罩
    const clippedDrawCount: number =
      clippingContext._clippedDrawableIndexList.length;

    for (
      let clippedDrawableIndex = 0;
      clippedDrawableIndex < clippedDrawCount;
      clippedDrawableIndex++
    ) {
      // 求使用遮罩的绘制对象的绘制矩形
      const drawableIndex: number =
        clippingContext._clippedDrawableIndexList[clippedDrawableIndex];

      const drawableVertexCount: number =
        model.getDrawableVertexCount(drawableIndex);
      const drawableVertexes: Float32Array =
        model.getDrawableVertices(drawableIndex);

      let minX: number = Number.MAX_VALUE;
      let minY: number = Number.MAX_VALUE;
      let maxX: number = -Number.MAX_VALUE;
      let maxY: number = -Number.MAX_VALUE;

      const loop: number = drawableVertexCount * Constant.vertexStep;
      for (
        let pi: number = Constant.vertexOffset;
        pi < loop;
        pi += Constant.vertexStep
      ) {
        const x: number = drawableVertexes[pi];
        const y: number = drawableVertexes[pi + 1];

        if (x < minX) {
          minX = x;
        }
        if (x > maxX) {
          maxX = x;
        }
        if (y < minY) {
          minY = y;
        }
        if (y > maxY) {
          maxY = y;
        }
      }

      // 未取到任何有效点，跳过
      if (minX == Number.MAX_VALUE) {
        continue;
      }

      // 反映到整体矩形
      if (minX < clippedDrawTotalMinX) {
        clippedDrawTotalMinX = minX;
      }
      if (minY < clippedDrawTotalMinY) {
        clippedDrawTotalMinY = minY;
      }
      if (maxX > clippedDrawTotalMaxX) {
        clippedDrawTotalMaxX = maxX;
      }
      if (maxY > clippedDrawTotalMaxY) {
        clippedDrawTotalMaxY = maxY;
      }

      if (clippedDrawTotalMinX == Number.MAX_VALUE) {
        clippingContext._allClippedDrawRect.x = 0.0;
        clippingContext._allClippedDrawRect.y = 0.0;
        clippingContext._allClippedDrawRect.width = 0.0;
        clippingContext._allClippedDrawRect.height = 0.0;
        clippingContext._isUsing = false;
      } else {
        clippingContext._isUsing = true;
        const w: number = clippedDrawTotalMaxX - clippedDrawTotalMinX;
        const h: number = clippedDrawTotalMaxY - clippedDrawTotalMinY;
        clippingContext._allClippedDrawRect.x = clippedDrawTotalMinX;
        clippingContext._allClippedDrawRect.y = clippedDrawTotalMinY;
        clippingContext._allClippedDrawRect.width = w;
        clippingContext._allClippedDrawRect.height = h;
      }
    }
  }

  /**
   * 获取画面绘制使用的裁剪遮罩列表
   * @return 画面绘制使用的裁剪遮罩列表
   */
  public getClippingContextListForDraw(): Array<T_ClippingContext> {
    return this._clippingContextListForDraw;
  }

  public getClippingContextListForOffscreen(): Array<T_ClippingContext> {
    return this._clippingContextListForOffscreen;
  }

  /**
   * 获取裁剪遮罩缓冲大小
   * @return 裁剪遮罩缓冲大小
   */
  public getClippingMaskBufferSize(): number {
    return this._clippingMaskBufferSize;
  }

  /**
   * 获取该缓冲的渲染纹理数量
   * @return 该缓冲的渲染纹理数量
   */
  public getRenderTextureCount(): number {
    return this._renderTextureCount;
  }

  /**
   * 获取颜色通道（RGBA）标志
   * @param channelNo 颜色通道（RGBA）编号（0:R, 1:G, 2:B, 3:A）
   */
  public getChannelFlagAsColor(channelNo: number): CubismTextureColor {
    return this._channelColors[channelNo];
  }

  /**
   * 设置裁剪遮罩缓冲大小
   * @param size 裁剪遮罩缓冲大小
   */
  public setClippingMaskBufferSize(size: number): void {
    this._clippingMaskBufferSize = size;
  }

  protected _clearedMaskBufferFlags: Array<boolean>; //遮罩清除标志数组

  protected _channelColors: Array<CubismTextureColor>;
  protected _clippingContextListForMask: Array<T_ClippingContext>; // 遮罩用裁剪上下文列表
  protected _clippingContextListForDraw: Array<T_ClippingContext>; // 绘制用裁剪上下文列表
  protected _clippingContextListForOffscreen: Array<T_ClippingContext>; // 离屏用裁剪上下文列表
  protected _clippingMaskBufferSize: number; // 裁剪遮罩缓冲大小（初始值:256）
  protected _renderTextureCount: number; // 要生成的渲染纹理数量

  protected _tmpMatrix: CubismMatrix44; // 遮罩计算用矩阵
  protected _tmpMatrixForMask: CubismMatrix44; // 遮罩计算用矩阵
  protected _tmpMatrixForDraw: CubismMatrix44; // 遮罩计算用矩阵
  protected _tmpBoundsOnModel: csmRect; // 遮罩布局计算用矩形

  protected _clippingContexttConstructor: ClippingContextConstructor<T_ClippingContext>;
}
