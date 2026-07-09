// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismIdHandle } from '../id/cubismid';
import { CubismFramework } from '../live2dcubismframework';
import { CubismVector2 } from '../math/cubismvector2';
import { CubismJson } from '../utils/cubismjson';

// JSON 键名
const Position = 'Position';
const X = 'X';
const Y = 'Y';
const Angle = 'Angle';
const Type = 'Type';
const Id = 'Id';

// 元数据
const Meta = 'Meta';
const EffectiveForces = 'EffectiveForces';
const TotalInputCount = 'TotalInputCount';
const TotalOutputCount = 'TotalOutputCount';
const PhysicsSettingCount = 'PhysicsSettingCount';
const Gravity = 'Gravity';
const Wind = 'Wind';
const VertexCount = 'VertexCount';
const Fps = 'Fps';

// 物理设置
const PhysicsSettings = 'PhysicsSettings';
const Normalization = 'Normalization';
const Minimum = 'Minimum';
const Maximum = 'Maximum';
const Default = 'Default';
const Reflect = 'Reflect';
const Weight = 'Weight';

// 输入
const Input = 'Input';
const Source = 'Source';

// 输出
const Output = 'Output';
const Scale = 'Scale';
const VertexIndex = 'VertexIndex';
const Destination = 'Destination';

// 物理点
const Vertices = 'Vertices';
const Mobility = 'Mobility';
const Delay = 'Delay';
const Radius = 'Radius';
const Acceleration = 'Acceleration';

/**
 * physics3.json 的容器。
 */
export class CubismPhysicsJson {
  /**
   * 构造函数
   * @param buffer 已加载 physics3.json 的缓冲区
   * @param size 缓冲区大小
   */
  public constructor(buffer: ArrayBuffer, size: number) {
    this._json = CubismJson.create(buffer, size);
  }

  /**
   * 相当于析构函数的处理
   */
  public release(): void {
    CubismJson.delete(this._json);
  }

  /**
   * 获取重力
   * @return 重力
   */
  public getGravity(): CubismVector2 {
    const ret: CubismVector2 = new CubismVector2(0, 0);
    ret.x = this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(EffectiveForces)
      .getValueByString(Gravity)
      .getValueByString(X)
      .toFloat();
    ret.y = this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(EffectiveForces)
      .getValueByString(Gravity)
      .getValueByString(Y)
      .toFloat();
    return ret;
  }

  /**
   * 获取风力
   * @return 风力
   */
  public getWind(): CubismVector2 {
    const ret: CubismVector2 = new CubismVector2(0, 0);
    ret.x = this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(EffectiveForces)
      .getValueByString(Wind)
      .getValueByString(X)
      .toFloat();
    ret.y = this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(EffectiveForces)
      .getValueByString(Wind)
      .getValueByString(Y)
      .toFloat();
    return ret;
  }

  /**
   * 获取物理运算设定 FPS
   * @return 物理运算设定 FPS
   */
  public getFps(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(Fps)
      .toFloat(0.0);
  }

  /**
   * 获取物理点管理数量
   * @return 物理点管理数量
   */
  public getSubRigCount(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(PhysicsSettingCount)
      .toInt();
  }

  /**
   * 获取输入总数
   * @return 输入总数
   */
  public getTotalInputCount(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(TotalInputCount)
      .toInt();
  }

  /**
   * 获取输出总数
   * @return 输出总数
   */
  public getTotalOutputCount(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(TotalOutputCount)
      .toInt();
  }

  /**
   * 获取物理点数量
   * @return 物理点数量
   */
  public getVertexCount(): number {
    return this._json
      .getRoot()
      .getValueByString(Meta)
      .getValueByString(VertexCount)
      .toInt();
  }

  /**
   * 获取归一化位置最小值
   * @param physicsSettingIndex 物理运算设置的索引
   * @return 归一化位置最小值
   */
  public getNormalizationPositionMinimumValue(
    physicsSettingIndex: number
  ): number {
    return this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Normalization)
      .getValueByString(Position)
      .getValueByString(Minimum)
      .toFloat();
  }

  /**
   * 获取归一化位置最大值
   * @param physicsSettingIndex 物理运算设置的索引
   * @return 归一化位置最大值
   */
  public getNormalizationPositionMaximumValue(
    physicsSettingIndex: number
  ): number {
    return this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Normalization)
      .getValueByString(Position)
      .getValueByString(Maximum)
      .toFloat();
  }

  /**
   * 获取归一化位置默认值
   * @param physicsSettingIndex 物理运算设置的索引
   * @return 归一化位置默认值
   */
  public getNormalizationPositionDefaultValue(
    physicsSettingIndex: number
  ): number {
    return this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Normalization)
      .getValueByString(Position)
      .getValueByString(Default)
      .toFloat();
  }

  /**
   * 获取归一化角度最小值
   * @param physicsSettingIndex 物理运算设置的索引
   * @return 归一化角度最小值
   */
  public getNormalizationAngleMinimumValue(
    physicsSettingIndex: number
  ): number {
    return this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Normalization)
      .getValueByString(Angle)
      .getValueByString(Minimum)
      .toFloat();
  }

  /**
   * 获取归一化角度最大值
   * @param physicsSettingIndex
   * @return 归一化角度最大值
   */
  public getNormalizationAngleMaximumValue(
    physicsSettingIndex: number
  ): number {
    return this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Normalization)
      .getValueByString(Angle)
      .getValueByString(Maximum)
      .toFloat();
  }

  /**
   * 获取归一化角度默认值
   * @param physicsSettingIndex 物理运算设置的索引
   * @return 归一化角度默认值
   */
  public getNormalizationAngleDefaultValue(
    physicsSettingIndex: number
  ): number {
    return this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Normalization)
      .getValueByString(Angle)
      .getValueByString(Default)
      .toFloat();
  }

  /**
   * 获取输入数量
   * @param physicsSettingIndex 物理运算设置的索引
   * @return 输入数量
   */
  public getInputCount(physicsSettingIndex: number): number {
    return this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Input)
      .getVector().length;
  }

  /**
   * 获取输入权重
   * @param physicsSettingIndex 物理运算设置的索引
   * @param inputIndex 输入的索引
   * @return 输入权重
   */
  public getInputWeight(
    physicsSettingIndex: number,
    inputIndex: number
  ): number {
    return this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Input)
      .getValueByIndex(inputIndex)
      .getValueByString(Weight)
      .toFloat();
  }

  /**
   * 获取输入反转
   * @param physicsSettingIndex 物理运算设置的索引
   * @param inputIndex 输入的索引
   * @return 输入反转
   */
  public getInputReflect(
    physicsSettingIndex: number,
    inputIndex: number
  ): boolean {
    return this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Input)
      .getValueByIndex(inputIndex)
      .getValueByString(Reflect)
      .toBoolean();
  }

  /**
   * 获取输入类型
   * @param physicsSettingIndex 物理运算设置的索引
   * @param inputIndex 输入的索引
   * @return 输入类型
   */
  public getInputType(physicsSettingIndex: number, inputIndex: number): string {
    return this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Input)
      .getValueByIndex(inputIndex)
      .getValueByString(Type)
      .getRawString();
  }

  /**
   * 获取输入源 ID
   * @param physicsSettingIndex 物理运算设置的索引
   * @param inputIndex 输入的索引
   * @return 输入源 ID
   */
  public getInputSourceId(
    physicsSettingIndex: number,
    inputIndex: number
  ): CubismIdHandle {
    return CubismFramework.getIdManager().getId(
      this._json
        .getRoot()
        .getValueByString(PhysicsSettings)
        .getValueByIndex(physicsSettingIndex)
        .getValueByString(Input)
        .getValueByIndex(inputIndex)
        .getValueByString(Source)
        .getValueByString(Id)
        .getRawString()
    );
  }

  /**
   * 获取输出数量
   * @param physicsSettingIndex 物理运算设置的索引
   * @return 输出数量
   */
  public getOutputCount(physicsSettingIndex: number): number {
    return this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Output)
      .getVector().length;
  }

  /**
   * 获取输出物理点索引
   * @param physicsSettingIndex 物理运算设置的索引
   * @param outputIndex 输出的索引
   * @return 输出物理点索引
   */
  public getOutputVertexIndex(
    physicsSettingIndex: number,
    outputIndex: number
  ): number {
    return this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Output)
      .getValueByIndex(outputIndex)
      .getValueByString(VertexIndex)
      .toInt();
  }

  /**
   * 获取输出角度缩放
   * @param physicsSettingIndex 物理运算设置的索引
   * @param outputIndex 输出的索引
   * @return 输出角度缩放
   */
  public getOutputAngleScale(
    physicsSettingIndex: number,
    outputIndex: number
  ): number {
    return this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Output)
      .getValueByIndex(outputIndex)
      .getValueByString(Scale)
      .toFloat();
  }

  /**
   * 获取输出权重
   * @param physicsSettingIndex 物理运算设置的索引
   * @param outputIndex 输出的索引
   * @return 输出权重
   */
  public getOutputWeight(
    physicsSettingIndex: number,
    outputIndex: number
  ): number {
    return this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Output)
      .getValueByIndex(outputIndex)
      .getValueByString(Weight)
      .toFloat();
  }

  /**
   * 获取输出目标 ID
   * @param physicsSettingIndex 物理运算设置的索引
   * @param outputIndex 输出的索引
   * @return 输出目标 ID
   */
  public getOutputDestinationId(
    physicsSettingIndex: number,
    outputIndex: number
  ): CubismIdHandle {
    return CubismFramework.getIdManager().getId(
      this._json
        .getRoot()
        .getValueByString(PhysicsSettings)
        .getValueByIndex(physicsSettingIndex)
        .getValueByString(Output)
        .getValueByIndex(outputIndex)
        .getValueByString(Destination)
        .getValueByString(Id)
        .getRawString()
    );
  }

  /**
   * 获取输出类型
   * @param physicsSettingIndex 物理运算设置的索引
   * @param outputIndex 输出的索引
   * @return 输出类型
   */
  public getOutputType(
    physicsSettingIndex: number,
    outputIndex: number
  ): string {
    return this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Output)
      .getValueByIndex(outputIndex)
      .getValueByString(Type)
      .getRawString();
  }

  /**
   * 获取输出反转
   * @param physicsSettingIndex 物理运算的索引
   * @param outputIndex 输出的索引
   * @return 输出反转
   */
  public getOutputReflect(
    physicsSettingIndex: number,
    outputIndex: number
  ): boolean {
    return this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Output)
      .getValueByIndex(outputIndex)
      .getValueByString(Reflect)
      .toBoolean();
  }

  /**
   * 获取物理点数量
   * @param physicsSettingIndex 物理运算设置的索引
   * @return 物理点数量
   */
  public getParticleCount(physicsSettingIndex: number): number {
    return this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Vertices)
      .getVector().length;
  }

  /**
   * 获取物理点易动性
   * @param physicsSettingIndex 物理运算设置的索引
   * @param vertexIndex 物理点的索引
   * @return 物理点易动性
   */
  public getParticleMobility(
    physicsSettingIndex: number,
    vertexIndex: number
  ): number {
    return this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Vertices)
      .getValueByIndex(vertexIndex)
      .getValueByString(Mobility)
      .toFloat();
  }

  /**
   * 获取物理点延迟
   * @param physicsSettingIndex 物理运算设置的索引
   * @param vertexIndex 物理点的索引
   * @return 物理点延迟
   */
  public getParticleDelay(
    physicsSettingIndex: number,
    vertexIndex: number
  ): number {
    return this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Vertices)
      .getValueByIndex(vertexIndex)
      .getValueByString(Delay)
      .toFloat();
  }

  /**
   * 获取物理点加速度
   * @param physicsSettingIndex 物理运算设置
   * @param vertexIndex 物理点的索引
   * @return 物理点加速度
   */
  public getParticleAcceleration(
    physicsSettingIndex: number,
    vertexIndex: number
  ): number {
    return this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Vertices)
      .getValueByIndex(vertexIndex)
      .getValueByString(Acceleration)
      .toFloat();
  }

  /**
   * 获取物理点距离
   * @param physicsSettingIndex 物理运算设置的索引
   * @param vertexIndex 物理点的索引
   * @return 物理点距离
   */
  public getParticleRadius(
    physicsSettingIndex: number,
    vertexIndex: number
  ): number {
    return this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Vertices)
      .getValueByIndex(vertexIndex)
      .getValueByString(Radius)
      .toFloat();
  }

  /**
   * 获取物理点位置
   * @param physicsSettingIndex 物理运算设置的索引
   * @param vertexInde 物理点的索引
   * @return 物理点位置
   */
  public getParticlePosition(
    physicsSettingIndex: number,
    vertexIndex: number
  ): CubismVector2 {
    const ret: CubismVector2 = new CubismVector2(0, 0);
    ret.x = this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Vertices)
      .getValueByIndex(vertexIndex)
      .getValueByString(Position)
      .getValueByString(X)
      .toFloat();
    ret.y = this._json
      .getRoot()
      .getValueByString(PhysicsSettings)
      .getValueByIndex(physicsSettingIndex)
      .getValueByString(Vertices)
      .getValueByIndex(vertexIndex)
      .getValueByString(Position)
      .getValueByString(Y)
      .toFloat();
    return ret;
  }

  _json: CubismJson; // physics3.json 数据
}

// 用于兼容性的命名空间定义。
import * as $ from './cubismphysicsjson';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismPhysicsJson = $.CubismPhysicsJson;
  export type CubismPhysicsJson = $.CubismPhysicsJson;
}
