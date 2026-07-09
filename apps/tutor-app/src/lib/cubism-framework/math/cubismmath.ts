// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismVector2 } from './cubismvector2';

/**
 * 用于数值计算等场景的工具类
 */
export class CubismMath {
  static readonly Epsilon: number = 0.00001;

  /**
   * 将第一个参数限制在最小值与最大值之间并返回
   *
   * @param value 待限制的值
   * @param min   范围最小值
   * @param max   范围最大值
   * @return 限制在最小值与最大值之间的值
   */
  static range(value: number, min: number, max: number): number {
    if (value < min) {
      value = min;
    } else if (value > max) {
      value = max;
    }

    return value;
  }

  /**
   * 求正弦值
   *
   * @param x 角度（弧度）
   * @return 正弦值 sin(x)
   */
  static sin(x: number): number {
    return Math.sin(x);
  }

  /**
   * 求余弦值
   *
   * @param x 角度（弧度）
   * @return 余弦值 cos(x)
   */
  static cos(x: number): number {
    return Math.cos(x);
  }

  /**
   * 求绝对值
   *
   * @param x 待求绝对值的值
   * @return 绝对值
   */
  static abs(x: number): number {
    return Math.abs(x);
  }

  /**
   * 求平方根
   * @param x -> 待求平方根的值
   * @return 平方根
   */
  static sqrt(x: number): number {
    return Math.sqrt(x);
  }

  /**
   * 求立方根
   * @param x -> 待求立方根的值
   * @return 立方根
   */
  static cbrt(x: number): number {
    if (x === 0) {
      return x;
    }

    let cx: number = x;
    const isNegativeNumber: boolean = cx < 0;

    if (isNegativeNumber) {
      cx = -cx;
    }

    let ret: number;
    if (cx === Infinity) {
      ret = Infinity;
    } else {
      ret = Math.exp(Math.log(cx) / 3);
      ret = (cx / (ret * ret) + 2 * ret) / 3;
    }
    return isNegativeNumber ? -ret : ret;
  }

  /**
   * 求经过缓弦（easing sine）处理后的值
   * 可用于淡入淡出时的缓动
   *
   * @param value 待缓动的值
   * @return 缓弦处理后的值
   */
  static getEasingSine(value: number): number {
    if (value < 0.0) {
      return 0.0;
    } else if (value > 1.0) {
      return 1.0;
    }

    return 0.5 - 0.5 * this.cos(value * Math.PI);
  }

  /**
   * 返回较大值
   *
   * @param left 左侧值
   * @param right 右侧值
   * @return 较大值
   */
  static max(left: number, right: number): number {
    return left > right ? left : right;
  }

  /**
   * 返回较小值
   *
   * @param left  左侧值
   * @param right 右侧值
   * @return 较小值
   */
  static min(left: number, right: number): number {
    return left > right ? right : left;
  }

  public static clamp(val: number, min: number, max: number): number {
    if (val < min) {
      return min;
    } else if (max < val) {
      return max;
    }
    return val;
  }

  /**
   * 将角度转换为弧度
   *
   * @param degrees   角度值
   * @return 由角度转换得到的弧度值
   */
  static degreesToRadian(degrees: number): number {
    return (degrees / 180.0) * Math.PI;
  }

  /**
   * 将弧度转换为角度
   *
   * @param radian    弧度值
   * @return 由弧度转换得到的角度值
   */
  static radianToDegrees(radian: number): number {
    return (radian * 180.0) / Math.PI;
  }

  /**
   * 由两个向量求弧度方向
   *
   * @param from  起点向量
   * @param to    终点向量
   * @return 由弧度得到的方向向量
   */
  static directionToRadian(from: CubismVector2, to: CubismVector2): number {
    const q1: number = Math.atan2(to.y, to.x);
    const q2: number = Math.atan2(from.y, from.x);

    let ret: number = q1 - q2;

    while (ret < -Math.PI) {
      ret += Math.PI * 2.0;
    }

    while (ret > Math.PI) {
      ret -= Math.PI * 2.0;
    }

    return ret;
  }

  /**
   * 由两个向量求角度方向
   *
   * @param from  起点向量
   * @param to    终点向量
   * @return 由角度得到的方向向量
   */
  static directionToDegrees(from: CubismVector2, to: CubismVector2): number {
    const radian: number = this.directionToRadian(from, to);
    let degree: number = this.radianToDegrees(radian);

    if (to.x - from.x > 0.0) {
      degree = -degree;
    }

    return degree;
  }

  /**
   * 将弧度值转换为方向向量。
   *
   * @param totalAngle    弧度值
   * @return 由弧度转换得到的方向向量
   */

  static radianToDirection(totalAngle: number): CubismVector2 {
    const ret: CubismVector2 = new CubismVector2();

    ret.x = this.sin(totalAngle);
    ret.y = this.cos(totalAngle);

    return ret;
  }

  /**
   * 当三次方程三次项系数为 0 时，退而求其次使用二次方程求解。
   * a * x^2 + b * x + c = 0
   *
   * @param   a -> 二次项系数
   * @param   b -> 一次项系数
   * @param   c -> 常数项
   * @return  二次方程的解
   */
  static quadraticEquation(a: number, b: number, c: number): number {
    if (this.abs(a) < CubismMath.Epsilon) {
      if (this.abs(b) < CubismMath.Epsilon) {
        return -c;
      }
      return -c / b;
    }

    return -(b + this.sqrt(b * b - 4.0 * a * c)) / (2.0 * a);
  }

  /**
   * 使用卡尔达诺（Cardano）公式求解贝塞尔曲线 t 值对应的三次方程。
   * 出现重根时返回位于 0.0～1.0 范围内的解。
   *
   * a * x^3 + b * x^2 + c * x + d = 0
   *
   * @param   a -> 三次项系数
   * @param   b -> 二次项系数
   * @param   c -> 一次项系数
   * @param   d -> 常数项
   * @return  位于 0.0～1.0 之间的解
   */
  static cardanoAlgorithmForBezier(
    a: number,
    b: number,
    c: number,
    d: number
  ): number {
    if (this.abs(a) < CubismMath.Epsilon) {
      return this.range(this.quadraticEquation(b, c, d), 0.0, 1.0);
    }

    const ba: number = b / a;
    const ca: number = c / a;
    const da: number = d / a;

    const p: number = (3.0 * ca - ba * ba) / 3.0;
    const p3: number = p / 3.0;
    const q: number = (2.0 * ba * ba * ba - 9.0 * ba * ca + 27.0 * da) / 27.0;
    const q2: number = q / 2.0;
    const discriminant: number = q2 * q2 + p3 * p3 * p3;

    const center = 0.5;
    const threshold: number = center + 0.01;

    if (discriminant < 0.0) {
      const mp3: number = -p / 3.0;
      const mp33: number = mp3 * mp3 * mp3;
      const r: number = this.sqrt(mp33);
      const t: number = -q / (2.0 * r);
      const cosphi: number = this.range(t, -1.0, 1.0);
      const phi: number = Math.acos(cosphi);
      const crtr: number = this.cbrt(r);
      const t1: number = 2.0 * crtr;

      const root1: number = t1 * this.cos(phi / 3.0) - ba / 3.0;
      if (this.abs(root1 - center) < threshold) {
        return this.range(root1, 0.0, 1.0);
      }

      const root2: number =
        t1 * this.cos((phi + 2.0 * Math.PI) / 3.0) - ba / 3.0;
      if (this.abs(root2 - center) < threshold) {
        return this.range(root2, 0.0, 1.0);
      }

      const root3: number =
        t1 * this.cos((phi + 4.0 * Math.PI) / 3.0) - ba / 3.0;
      return this.range(root3, 0.0, 1.0);
    }

    if (discriminant == 0.0) {
      let u1: number;
      if (q2 < 0.0) {
        u1 = this.cbrt(-q2);
      } else {
        u1 = -this.cbrt(q2);
      }

      const root1: number = 2.0 * u1 - ba / 3.0;
      if (this.abs(root1 - center) < threshold) {
        return this.range(root1, 0.0, 1.0);
      }

      const root2: number = -u1 - ba / 3.0;
      return this.range(root2, 0.0, 1.0);
    }

    const sd: number = this.sqrt(discriminant);
    const u1: number = this.cbrt(sd - q2);
    const v1: number = this.cbrt(sd + q2);
    const root1: number = u1 - v1 - ba / 3.0;
    return this.range(root1, 0.0, 1.0);
  }

  /**
   * 求浮点数取模后的余数。
   *
   * @param dividend 被除数
   * @param divisor 除数
   * @return 余数
   */
  static mod(dividend: number, divisor: number): number {
    if (
      !isFinite(dividend) ||
      divisor === 0 ||
      isNaN(dividend) ||
      isNaN(divisor)
    ) {
      console.warn(
        `divided: ${dividend}, divisor: ${divisor} mod() returns 'NaN'.`
      );
      return NaN;
    }

    // 转换为绝对值。
    const absDividend = Math.abs(dividend);
    const absDivisor = Math.abs(divisor);

    // 用绝对值做除法。
    let result =
      absDividend - Math.floor(absDividend / absDivisor) * absDivisor;

    // 符号与被除数保持一致。
    result *= Math.sign(dividend);
    return result;
  }

  /**
   * 构造函数
   */
  private constructor() {}
}

// 兼容性命名空间定义。
import * as $ from './cubismmath';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismMath = $.CubismMath;
  export type CubismMath = $.CubismMath;
}
