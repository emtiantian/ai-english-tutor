// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismMath } from './cubismmath';

/**
 * 4x4 矩阵
 *
 * 4x4 矩阵的便捷封装类。
 */
export class CubismMatrix44 {
  /**
   * 构造函数
   */
  public constructor() {
    this._tr = new Float32Array(16); // 4 * 4 大小
    this.loadIdentity();
  }

  /**
   * 对两个矩阵进行乘法运算。
   *
   * @param a 矩阵 a
   * @param b 矩阵 b
   *
   * @return 乘法结果的矩阵
   */
  public static multiply(
    a: Float32Array,
    b: Float32Array,
    dst: Float32Array
  ): void {
    const c: Float32Array = new Float32Array([
      0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0,
      0.0
    ]);

    const n = 4;

    for (let i = 0; i < n; ++i) {
      for (let j = 0; j < n; ++j) {
        for (let k = 0; k < n; ++k) {
          c[j + i * 4] += a[k + i * 4] * b[j + k * 4];
        }
      }
    }

    for (let i = 0; i < 16; ++i) {
      dst[i] = c[i];
    }
  }

  /**
   * 初始化为单位矩阵
   */
  public loadIdentity(): void {
    const c: Float32Array = new Float32Array([
      1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0,
      1.0
    ]);

    this.setMatrix(c);
  }

  /**
   * 设置矩阵
   *
   * @param tr 由 16 个浮点数表示的 4x4 矩阵
   */
  public setMatrix(tr: Float32Array): void {
    for (let i = 0; i < 16; ++i) {
      this._tr[i] = tr[i];
    }
  }

  /**
   * 以浮点数数组形式获取矩阵
   *
   * @return 由 16 个浮点数表示的 4x4 矩阵
   */
  public getArray(): Float32Array {
    return this._tr;
  }

  /**
   * 获取 X 轴缩放率
   *
   * @return X 轴缩放率
   */
  public getScaleX(): number {
    return this._tr[0];
  }

  /**
   * 获取 Y 轴缩放率
   *
   * @return Y 轴缩放率
   */
  public getScaleY(): number {
    return this._tr[5];
  }

  /**
   * 获取 X 轴平移量
   *
   * @return X 轴平移量
   */
  public getTranslateX(): number {
    return this._tr[12];
  }

  /**
   * 获取 Y 轴平移量
   *
   * @return Y 轴平移量
   */
  public getTranslateY(): number {
    return this._tr[13];
  }

  /**
   * 用当前矩阵计算 X 轴值
   *
   * @param src X 轴值
   *
   * @return 经当前矩阵计算后的 X 轴值
   */
  public transformX(src: number): number {
    return this._tr[0] * src + this._tr[12];
  }

  /**
   * 用当前矩阵计算 Y 轴值
   *
   * @param src Y 轴值
   *
   * @return 经当前矩阵计算后的 Y 轴值
   */
  public transformY(src: number): number {
    return this._tr[5] * src + this._tr[13];
  }

  /**
   * 用当前矩阵对 X 轴值做逆运算
   */
  public invertTransformX(src: number): number {
    return (src - this._tr[12]) / this._tr[0];
  }

  /**
   * 用当前矩阵对 Y 轴值做逆运算
   */
  public invertTransformY(src: number): number {
    return (src - this._tr[13]) / this._tr[5];
  }

  /**
   * 以当前矩阵位置为起点进行相对平移
   *
   * 以当前矩阵位置为起点做相对移动。
   *
   * @param x X 轴平移量
   * @param y Y 轴平移量
   */
  public translateRelative(x: number, y: number): void {
    const tr1: Float32Array = new Float32Array([
      1.0,
      0.0,
      0.0,
      0.0,
      0.0,
      1.0,
      0.0,
      0.0,
      0.0,
      0.0,
      1.0,
      0.0,
      x,
      y,
      0.0,
      1.0
    ]);

    CubismMatrix44.multiply(tr1, this._tr, this._tr);
  }

  /**
   * 将当前矩阵位置移动到指定位置
   *
   * 将当前矩阵位置移动到指定位置
   *
   * @param x X 轴平移量
   * @param y y 轴平移量
   */
  public translate(x: number, y: number): void {
    this._tr[12] = x;
    this._tr[13] = y;
  }

  /**
   * 将当前矩阵 X 轴位置移动到指定位置
   *
   * @param x X 轴平移量
   */
  public translateX(x: number): void {
    this._tr[12] = x;
  }

  /**
   * 将当前矩阵 Y 轴位置移动到指定位置
   *
   * @param y Y 轴平移量
   */
  public translateY(y: number): void {
    this._tr[13] = y;
  }

  /**
   * 相对设置当前矩阵的缩放率
   *
   * @param x X 轴缩放率
   * @param y Y 轴缩放率
   */
  public scaleRelative(x: number, y: number): void {
    const tr1: Float32Array = new Float32Array([
      x,
      0.0,
      0.0,
      0.0,
      0.0,
      y,
      0.0,
      0.0,
      0.0,
      0.0,
      1.0,
      0.0,
      0.0,
      0.0,
      0.0,
      1.0
    ]);

    CubismMatrix44.multiply(tr1, this._tr, this._tr);
  }

  /**
   * 将当前矩阵的缩放率设置为指定倍数
   *
   * @param x X 轴缩放率
   * @param y Y 轴缩放率
   */
  public scale(x: number, y: number): void {
    this._tr[0] = x;
    this._tr[5] = y;
  }

  /**
   * 将本矩阵乘到参数给出的矩阵上。
   * (参数给出的矩阵) * (本矩阵)
   *
   * @note 函数名与实际计算顺序不一致，未来可能会修正计算顺序。
   * @param m 矩阵
   */
  public multiplyByMatrix(m: CubismMatrix44): void {
    CubismMatrix44.multiply(m.getArray(), this._tr, this._tr);
  }

  /**
   * 求当前矩阵的逆矩阵。
   *
   * @return 返回经当前矩阵计算得到的逆矩阵值
   */
  public getInvert(): CubismMatrix44 {
    const r00 = this._tr[0];
    const r10 = this._tr[1];
    const r20 = this._tr[2];
    const r01 = this._tr[4];
    const r11 = this._tr[5];
    const r21 = this._tr[6];
    const r02 = this._tr[8];
    const r12 = this._tr[9];
    const r22 = this._tr[10];

    const tx = this._tr[12];
    const ty = this._tr[13];
    const tz = this._tr[14];

    const det =
      r00 * (r11 * r22 - r12 * r21) -
      r01 * (r10 * r22 - r12 * r20) +
      r02 * (r10 * r21 - r11 * r20);

    const dst = new CubismMatrix44();

    if (CubismMath.abs(det) < CubismMath.Epsilon) {
      dst.loadIdentity();
      return dst;
    }

    const invDet = 1.0 / det;

    const inv00 = (r11 * r22 - r12 * r21) * invDet;
    const inv01 = -(r01 * r22 - r02 * r21) * invDet;
    const inv02 = (r01 * r12 - r02 * r11) * invDet;
    const inv10 = -(r10 * r22 - r12 * r20) * invDet;
    const inv11 = (r00 * r22 - r02 * r20) * invDet;
    const inv12 = -(r00 * r12 - r02 * r10) * invDet;
    const inv20 = (r10 * r21 - r11 * r20) * invDet;
    const inv21 = -(r00 * r21 - r01 * r20) * invDet;
    const inv22 = (r00 * r11 - r01 * r10) * invDet;

    dst._tr[0] = inv00;
    dst._tr[1] = inv10;
    dst._tr[2] = inv20;
    dst._tr[3] = 0.0;
    dst._tr[4] = inv01;
    dst._tr[5] = inv11;
    dst._tr[6] = inv21;
    dst._tr[7] = 0.0;
    dst._tr[8] = inv02;
    dst._tr[9] = inv12;
    dst._tr[10] = inv22;
    dst._tr[11] = 0.0;

    dst._tr[12] = -(inv00 * tx + inv01 * ty + inv02 * tz);
    dst._tr[13] = -(inv10 * tx + inv11 * ty + inv12 * tz);
    dst._tr[14] = -(inv20 * tx + inv21 * ty + inv22 * tz);
    dst._tr[15] = 1.0;

    return dst;
  }

  /**
   * 生成对象副本
   */
  public clone(): CubismMatrix44 {
    const cloneMatrix: CubismMatrix44 = new CubismMatrix44();

    for (let i = 0; i < this._tr.length; i++) {
      cloneMatrix._tr[i] = this._tr[i];
    }

    return cloneMatrix;
  }

  protected _tr: Float32Array; // 4x4 矩阵数据
}

// 兼容性命名空间定义。
import * as $ from './cubismmatrix44';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismMatrix44 = $.CubismMatrix44;
  export type CubismMatrix44 = $.CubismMatrix44;
}
