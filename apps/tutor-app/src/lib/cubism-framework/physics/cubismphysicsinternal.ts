// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismIdHandle } from '../id/cubismid';
import { CubismVector2 } from '../math/cubismvector2';

/**
 * 物理运算的应用目标类型
 */
export enum CubismPhysicsTargetType {
  CubismPhysicsTargetType_Parameter // 应用于参数
}

/**
 * 物理运算的输入类型
 */
export enum CubismPhysicsSource {
  CubismPhysicsSource_X, // 来自 X 轴位置
  CubismPhysicsSource_Y, // 来自 Y 轴位置
  CubismPhysicsSource_Angle // 来自角度
}

/**
 * @brief 物理运算中使用的外力
 *
 * 物理运算中使用的外力。
 */
export class PhysicsJsonEffectiveForces {
  constructor() {
    this.gravity = new CubismVector2(0, 0);
    this.wind = new CubismVector2(0, 0);
  }
  gravity: CubismVector2; // 重力
  wind: CubismVector2; // 风力
}

/**
 * 物理运算的参数信息
 */
export class CubismPhysicsParameter {
  id: CubismIdHandle; // 参数
  targetType: CubismPhysicsTargetType; // 应用目标类型
}

/**
 * 物理运算的归一化信息
 */
export class CubismPhysicsNormalization {
  minimum: number; // 最大值
  maximum: number; // 最小值
  defalut: number; // 默认值
}

/**
 * 物理运算中使用的物理点信息
 */
export class CubismPhysicsParticle {
  constructor() {
    this.initialPosition = new CubismVector2(0, 0);
    this.position = new CubismVector2(0, 0);
    this.lastPosition = new CubismVector2(0, 0);
    this.lastGravity = new CubismVector2(0, 0);
    this.force = new CubismVector2(0, 0);
    this.velocity = new CubismVector2(0, 0);
  }

  initialPosition: CubismVector2; // 初始位置
  mobility: number; // 易动性
  delay: number; // 延迟
  acceleration: number; // 加速度
  radius: number; // 距离
  position: CubismVector2; // 当前位置
  lastPosition: CubismVector2; // 上一次位置
  lastGravity: CubismVector2; // 上一次重力
  force: CubismVector2; // 当前作用力
  velocity: CubismVector2; // 当前速度
}

/**
 * 物理运算的物理点管理
 */
export class CubismPhysicsSubRig {
  constructor() {
    this.normalizationPosition = new CubismPhysicsNormalization();
    this.normalizationAngle = new CubismPhysicsNormalization();
  }
  inputCount: number; // 输入数量
  outputCount: number; // 输出数量
  particleCount: number; // 物理点数量
  baseInputIndex: number; // 输入起始索引
  baseOutputIndex: number; // 输出起始索引
  baseParticleIndex: number; // 物理点起始索引
  normalizationPosition: CubismPhysicsNormalization; // 归一化位置
  normalizationAngle: CubismPhysicsNormalization; // 归一化角度
}

/**
 * 归一化参数获取函数声明
 * @param targetTranslation     // 运算结果的移动值
 * @param targetAngle           // 运算结果的角度
 * @param value                 // 参数值
 * @param parameterMinimunValue // 参数最小值
 * @param parameterMaximumValue // 参数最大值
 * @param parameterDefaultValue // 参数默认值
 * @param normalizationPosition // 归一化位置
 * @param normalizationAngle    // 归一化角度
 * @param isInverted            // 数值是否反转
 * @param weight                // 权重
 */
export interface normalizedPhysicsParameterValueGetter {
  (
    targetTranslation: CubismVector2,
    targetAngle: { angle: number },
    value: number,
    parameterMinimunValue: number,
    parameterMaximumValue: number,
    parameterDefaultValue: number,
    normalizationPosition: CubismPhysicsNormalization,
    normalizationAngle: CubismPhysicsNormalization,
    isInverted: boolean,
    weight: number
  ): void;
}

/**
 * 物理运算数值获取函数声明
 * @param translation 移动值
 * @param particles 物理点列表
 * @param isInverted 数值是否反转
 * @param parentGravity 重力
 * @return 数值
 */
export interface physicsValueGetter {
  (
    translation: CubismVector2,
    particles: CubismPhysicsParticle[],
    particleIndex: number,
    isInverted: boolean,
    parentGravity: CubismVector2
  ): number;
}

/**
 * 物理运算缩放值获取函数声明
 * @param translationScale 移动值缩放
 * @param angleScale    角度缩放
 * @return 缩放值
 */
export interface physicsScaleGetter {
  (translationScale: CubismVector2, angleScale: number): number;
}

/**
 * 物理运算的输入信息
 */
export class CubismPhysicsInput {
  constructor() {
    this.source = new CubismPhysicsParameter();
  }
  source: CubismPhysicsParameter; // 输入源参数
  sourceParameterIndex: number; // 输入源参数索引
  weight: number; // 权重
  type: number; // 输入类型
  reflect: boolean; // 数值是否反转
  getNormalizedParameterValue: normalizedPhysicsParameterValueGetter; // 归一化参数值获取函数
}

/**
 * @brief 物理运算的输出信息
 *
 * 物理运算的输出信息。
 */
export class CubismPhysicsOutput {
  constructor() {
    this.destination = new CubismPhysicsParameter();
    this.translationScale = new CubismVector2(0, 0);
  }

  destination: CubismPhysicsParameter; // 输出目标参数
  destinationParameterIndex: number; // 输出目标参数索引
  vertexIndex: number; // 摆锤索引
  translationScale: CubismVector2; // 移动值缩放
  angleScale: number; // 角度缩放
  weight: number; // 权重
  type: CubismPhysicsSource; // 输出类型
  reflect: boolean; // 数值是否反转
  valueBelowMinimum: number; // 低于最小值时的数值
  valueExceededMaximum: number; // 超过最大值时的数值
  getValue: physicsValueGetter; // 物理运算数值获取函数
  getScale: physicsScaleGetter; // 物理运算缩放值获取函数
}

/**
 * @brief 物理运算的数据
 *
 * 物理运算的数据。
 */
export class CubismPhysicsRig {
  constructor() {
    this.settings = new Array<CubismPhysicsSubRig>();
    this.inputs = new Array<CubismPhysicsInput>();
    this.outputs = new Array<CubismPhysicsOutput>();
    this.particles = new Array<CubismPhysicsParticle>();
    this.gravity = new CubismVector2(0, 0);
    this.wind = new CubismVector2(0, 0);
    this.fps = 0.0;
  }

  subRigCount: number; // 物理运算的物理点数量
  settings: Array<CubismPhysicsSubRig>; // 物理运算的物理点管理列表
  inputs: Array<CubismPhysicsInput>; // 物理运算的输入列表
  outputs: Array<CubismPhysicsOutput>; // 物理运算的输出列表
  particles: Array<CubismPhysicsParticle>; // 物理运算的物理点列表
  gravity: CubismVector2; // 重力
  wind: CubismVector2; // 风力
  fps: number; // 物理运算运行 FPS
}

// 用于兼容性的命名空间定义。
import * as $ from './cubismphysicsinternal';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismPhysicsInput = $.CubismPhysicsInput;
  export type CubismPhysicsInput = $.CubismPhysicsInput;
  export const CubismPhysicsNormalization = $.CubismPhysicsNormalization;
  export type CubismPhysicsNormalization = $.CubismPhysicsNormalization;
  export const CubismPhysicsOutput = $.CubismPhysicsOutput;
  export type CubismPhysicsOutput = $.CubismPhysicsOutput;
  export const CubismPhysicsParameter = $.CubismPhysicsParameter;
  export type CubismPhysicsParameter = $.CubismPhysicsParameter;
  export const CubismPhysicsParticle = $.CubismPhysicsParticle;
  export type CubismPhysicsParticle = $.CubismPhysicsParticle;
  export const CubismPhysicsRig = $.CubismPhysicsRig;
  export type CubismPhysicsRig = $.CubismPhysicsRig;
  export const CubismPhysicsSource = $.CubismPhysicsSource;
  export type CubismPhysicsSource = $.CubismPhysicsSource;
  export const CubismPhysicsSubRig = $.CubismPhysicsSubRig;
  export type CubismPhysicsSubRig = $.CubismPhysicsSubRig;
  export const CubismPhysicsTargetType = $.CubismPhysicsTargetType;
  export type CubismPhysicsTargetType = $.CubismPhysicsTargetType;
  export const PhysicsJsonEffectiveForces = $.PhysicsJsonEffectiveForces;
  export type PhysicsJsonEffectiveForces = $.PhysicsJsonEffectiveForces;
  export type normalizedPhysicsParameterValueGetter =
    $.normalizedPhysicsParameterValueGetter;
  export type physicsScaleGetter = $.physicsScaleGetter;
  export type physicsValueGetter = $.physicsValueGetter;
}
