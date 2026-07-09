// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismMatrix44 } from './cubismmatrix44';

/**
 * 用于设置模型坐标的 4x4 矩阵
 *
 * 用于设置模型坐标的 4x4 矩阵类
 */
export class CubismModelMatrix extends CubismMatrix44 {
  /**
   * 构造函数
   *
   * @param w 宽度
   * @param h 高度
   */
  constructor(w?: number, h?: number) {
    super();

    this._width = w !== undefined ? w : 0.0;
    this._height = h !== undefined ? h : 0.0;

    this.setHeight(2.0);
  }

  /**
   * 设置宽度
   *
   * @param w 宽度
   */
  public setWidth(w: number): void {
    const scaleX: number = w / this._width;
    const scaleY: number = scaleX;
    this.scale(scaleX, scaleY);
  }

  /**
   * 设置高度
   * @param h 高度
   */
  public setHeight(h: number): void {
    const scaleX: number = h / this._height;
    const scaleY: number = scaleX;
    this.scale(scaleX, scaleY);
  }

  /**
   * 设置位置
   *
   * @param x X 轴位置
   * @param y Y 轴位置
   */
  public setPosition(x: number, y: number): void {
    this.translate(x, y);
  }

  /**
   * 设置中心位置
   *
   * @param x X 轴中心位置
   * @param y Y 轴中心位置
   *
   * @note 若未先设置 width 或 height，将无法正确获取缩放率，会导致位置偏移。
   */
  public setCenterPosition(x: number, y: number) {
    this.centerX(x);
    this.centerY(y);
  }

  /**
   * 设置上边缘位置
   *
   * @param y 上边缘的 Y 轴位置
   */
  public top(y: number): void {
    this.setY(y);
  }

  /**
   * 设置下边缘位置
   *
   * @param y 下边缘的 Y 轴位置
   */
  public bottom(y: number) {
    const h: number = this._height * this.getScaleY();

    this.translateY(y - h);
  }

  /**
   * 设置左边缘位置
   *
   * @param x 左边缘的 X 轴位置
   */
  public left(x: number): void {
    this.setX(x);
  }

  /**
   * 设置右边缘位置
   *
   * @param x 右边缘的 X 轴位置
   */
  public right(x: number): void {
    const w = this._width * this.getScaleX();

    this.translateX(x - w);
  }

  /**
   * 设置 X 轴中心位置
   *
   * @param x X 轴中心位置
   */
  public centerX(x: number): void {
    const w = this._width * this.getScaleX();

    this.translateX(x - w / 2.0);
  }

  /**
   * 设置 X 轴位置
   *
   * @param x X 轴位置
   */
  public setX(x: number): void {
    this.translateX(x);
  }

  /**
   * 设置 Y 轴中心位置
   *
   * @param y Y 轴中心位置
   */
  public centerY(y: number): void {
    const h: number = this._height * this.getScaleY();

    this.translateY(y - h / 2.0);
  }

  /**
   * 设置 Y 轴位置
   *
   * @param y Y 轴位置
   */
  public setY(y: number): void {
    this.translateY(y);
  }

  /**
   * 根据布局信息设置位置
   *
   * @param layout 布局信息
   */
  public setupFromLayout(layout: Map<string, number>): void {
    const keyWidth = 'width';
    const keyHeight = 'height';
    const keyX = 'x';
    const keyY = 'y';
    const keyCenterX = 'center_x';
    const keyCenterY = 'center_y';
    const keyTop = 'top';
    const keyBottom = 'bottom';
    const keyLeft = 'left';
    const keyRight = 'right';

    for (const item of layout) {
      const key: string = item[0];
      const value: number = item[1];

      if (key == keyWidth) {
        this.setWidth(value);
      } else if (key == keyHeight) {
        this.setHeight(value);
      }
    }

    for (const item of layout) {
      const key: string = item[0];
      const value: number = item[1];

      if (key == keyX) {
        this.setX(value);
      } else if (key == keyY) {
        this.setY(value);
      } else if (key == keyCenterX) {
        this.centerX(value);
      } else if (key == keyCenterY) {
        this.centerY(value);
      } else if (key == keyTop) {
        this.top(value);
      } else if (key == keyBottom) {
        this.bottom(value);
      } else if (key == keyLeft) {
        this.left(value);
      } else if (key == keyRight) {
        this.right(value);
      }
    }
  }

  private _width: number; // 宽度
  private _height: number; // 高度
}

// 兼容性命名空间定义。
import * as $ from './cubismmodelmatrix';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismModelMatrix = $.CubismModelMatrix;
  export type CubismModelMatrix = $.CubismModelMatrix;
}
