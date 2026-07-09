// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismIdHandle } from '../id/cubismid';
import { CubismModel } from '../model/cubismmodel';

/**
 * 目标参数跟随功能
 *
 * 提供针对拖拽输入的参数跟随功能。
 */
export class CubismLook {
  /**
   * 创建实例
   */
  public static create(): CubismLook {
    return new CubismLook();
  }

  /**
   * 销毁实例
   * @param instance 目标 CubismDrag
   */
  public static delete(instance: CubismLook): void {
    if (instance != null) {
      instance = null;
    }
  }

  /**
   * 绑定目标跟随参数
   * @param lookParameters 想要绑定目标跟随的参数列表
   */
  public setParameters(lookParameters: Array<LookParameterData>): void {
    this._lookParameters = lookParameters;
  }

  /**
   * 获取已绑定目标跟随的参数
   * @return 已绑定目标跟随的参数列表
   */
  public getParameters(): Array<LookParameterData> {
    return this._lookParameters;
  }

  /**
   * 更新模型参数
   * @param model 目标模型
   * @param dragX 目标的 X 坐标
   * @param dragY 目标的 Y 坐标
   */
  public updateParameters(
    model: CubismModel,
    dragX: number,
    dragY: number
  ): void {
    for (let i = 0; i < this._lookParameters.length; ++i) {
      const data: LookParameterData = this._lookParameters[i];

      model.addParameterValueById(
        data.parameterId,
        data.factorX * dragX +
          data.factorY * dragY +
          data.factorXY * dragX * dragY
      );
    }
  }

  /**
   * 构造函数
   */
  public constructor() {
    this._lookParameters = new Array<LookParameterData>();
  }

  _lookParameters: Array<LookParameterData>; // 已绑定目标跟随的参数列表
}

/**
 * 目标跟随参数信息
 */
export class LookParameterData {
  /**
   * 构造函数
   * @param parameterId   要绑定目标跟随的参数 ID
   * @param factorX       X 方向拖拽输入系数
   * @param factorY       Y 方向拖拽输入系数
   * @param factorXY      XY 乘积拖拽输入系数
   */
  constructor(
    parameterId?: CubismIdHandle,
    factorX?: number,
    factorY?: number,
    factorXY?: number
  ) {
    this.parameterId = parameterId == undefined ? null : parameterId;
    this.factorX = factorX == undefined ? 0.0 : factorX;
    this.factorY = factorY == undefined ? 0.0 : factorY;
    this.factorXY = factorXY == undefined ? 0.0 : factorXY;
  }

  parameterId: CubismIdHandle; // 要绑定目标跟随的参数 ID
  factorX: number; // X 方向拖拽输入系数
  factorY: number; // Y 方向拖拽输入系数
  factorXY: number; // XY 乘积拖拽输入系数
}

// 为兼容性定义的命名空间。
import * as $ from './cubismlook';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const LookParameterData = $.LookParameterData;
  export type LookParameterData = $.LookParameterData;
  export const CubismLook = $.CubismLook;
  export type CubismLook = $.CubismLook;
}
