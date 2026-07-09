// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

/**
 * 用于提供参数值的接口类。<br>
 * 定义了向模型提供参数值的类的基本接口。
 */
export abstract class IParameterProvider {
  /**
   * 构造函数
   */
  constructor() {}

  /**
   * 更新处理。
   *
   * @param deltaTimeSeconds 增量时间（秒），可选。
   *
   * @return 更新成功则返回 true。
   */
  abstract update(deltaTimeSeconds?: number): boolean;

  /**
   * 获取参数的当前值。
   *
   * @return 参数值，浮点数。
   */
  abstract getParameter(): number;
}

// 兼容性命名空间定义。
import * as $ from './iparameterprovider';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const IParameterProvider = $.IParameterProvider;
  export type IParameterProvider = $.IParameterProvider;
}
