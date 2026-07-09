// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismMath } from './cubismmath';

const FrameRate = 30;
const Epsilon = 0.01;

/**
 * 脸部朝向控制功能
 *
 * 提供脸部朝向控制功能的类。
 */
export class CubismTargetPoint {
  /**
   * 构造函数
   */
  public constructor() {
    this._faceTargetX = 0.0;
    this._faceTargetY = 0.0;
    this._faceX = 0.0;
    this._faceY = 0.0;
    this._faceVX = 0.0;
    this._faceVY = 0.0;
    this._lastTimeSeconds = 0.0;
    this._userTimeSeconds = 0.0;
  }

  /**
   * 更新处理
   */
  public update(deltaTimeSeconds: number): void {
    // 累加 delta 时间
    this._userTimeSeconds += deltaTimeSeconds;

    // 头部从中间向左右摆动时的平均速度为每秒速度。考虑加速/减速，最高速度为其 2 倍
    // 头部摆动范围以中间（0.0）到左右（±1.0）表示
    const faceParamMaxV: number = 40.0 / 10.0; // 7.5 秒内移动 40 分（5.3/秒）
    const maxV: number = (faceParamMaxV * 1.0) / FrameRate; // 每帧最多可变化的速度上限

    if (this._lastTimeSeconds == 0.0) {
      this._lastTimeSeconds = this._userTimeSeconds;
      return;
    }

    const deltaTimeWeight: number =
      (this._userTimeSeconds - this._lastTimeSeconds) * FrameRate;
    this._lastTimeSeconds = this._userTimeSeconds;

    // 到达最高速度所需时间
    const timeToMaxSpeed = 0.15;
    const frameToMaxSpeed: number = timeToMaxSpeed * FrameRate; // sec * frame/sec
    const maxA: number = (deltaTimeWeight * maxV) / frameToMaxSpeed; // 每帧的加速度

    // 目标方向为（dx, dy）方向的向量
    const dx: number = this._faceTargetX - this._faceX;
    const dy: number = this._faceTargetY - this._faceY;

    if (CubismMath.abs(dx) <= Epsilon && CubismMath.abs(dy) <= Epsilon) {
      return; // 无变化
    }

    // 若超过最大速度则减速
    const d: number = CubismMath.sqrt(dx * dx + dy * dy);

    // 前进方向的最大速度向量
    const vx: number = (maxV * dx) / d;
    const vy: number = (maxV * dy) / d;

    // 由当前速度求向新速度变化的加速度
    let ax: number = vx - this._faceVX;
    let ay: number = vy - this._faceVY;

    const a: number = CubismMath.sqrt(ax * ax + ay * ay);

    // 加速时
    if (a < -maxA || a > maxA) {
      ax *= maxA / a;
      ay *= maxA / a;
    }

    // 将加速度加到原速度上作为新速度
    this._faceVX += ax;
    this._faceVY += ay;

    // 当接近目标方向时，为平滑减速所做处理
    // 根据以设定加速度能停下的距离与速度的关系
    // 计算当前可达到的最高速度，超过时则减速
    // ※本应由人类通过肌肉力量调节加速度，自由度更高，但此处做了简化处理
    {
      // 加速度、速度、距离的关系式。
      //            2  6           2               3
      //      sqrt(a  t  + 16 a h t  - 8 a h) - a t
      // v = --------------------------------------
      //                    2
      //                 4 t  - 2
      // (t=1)
      // 	时刻 t 已事先按 1/60（帧率，无单位）考虑加速度与速度，
      // 	因此可令 t＝1 消去（※未经验证）

      const maxV: number =
        0.5 *
        (CubismMath.sqrt(maxA * maxA + 16.0 * maxA * d - 8.0 * maxA * d) -
          maxA);
      const curV: number = CubismMath.sqrt(
        this._faceVX * this._faceVX + this._faceVY * this._faceVY
      );

      if (curV > maxV) {
        // 当前速度 > 最高速度时，减速至最高速度
        this._faceVX *= maxV / curV;
        this._faceVY *= maxV / curV;
      }
    }

    this._faceX += this._faceVX;
    this._faceY += this._faceVY;
  }

  /**
   * 获取脸部朝向的 X 轴值
   *
   * @return 脸部朝向的 X 轴值（-1.0 ~ 1.0）
   */
  public getX(): number {
    return this._faceX;
  }

  /**
   * 获取脸部朝向的 Y 轴值
   *
   * @return 脸部朝向的 Y 轴值（-1.0 ~ 1.0）
   */
  public getY(): number {
    return this._faceY;
  }

  /**
   * 设置脸部朝向目标值
   *
   * @param x 脸部朝向的 X 轴值（-1.0 ~ 1.0）
   * @param y 脸部朝向的 Y 轴值（-1.0 ~ 1.0）
   */
  public set(x: number, y: number): void {
    this._faceTargetX = x;
    this._faceTargetY = y;
  }

  private _faceTargetX: number; // 脸部朝向 X 目标值（会逐渐接近该值）
  private _faceTargetY: number; // 脸部朝向 Y 目标值（会逐渐接近该值）
  private _faceX: number; // 脸部朝向 X（-1.0 ~ 1.0）
  private _faceY: number; // 脸部朝向 Y（-1.0 ~ 1.0）
  private _faceVX: number; // 脸部朝向变化速度 X
  private _faceVY: number; // 脸部朝向变化速度 Y
  private _lastTimeSeconds: number; // 上次执行时间[秒]
  private _userTimeSeconds: number; // delta 时间累计值[秒]
}

// 兼容性命名空间定义。
import * as $ from './cubismtargetpoint';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismTargetPoint = $.CubismTargetPoint;
  export type CubismTargetPoint = $.CubismTargetPoint;
}
