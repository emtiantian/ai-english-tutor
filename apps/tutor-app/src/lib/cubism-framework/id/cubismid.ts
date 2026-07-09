// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

/**
 * 保存参数名、部件名、Drawable 名
 *
 * 保存参数名、部件名、Drawable 名的类。
 *
 * @note 要从指定 ID 字符串获取 CubismId 时，请勿调用本类的生成方法，
 *       请使用 CubismIdManager().getId(id)
 */
export class CubismId {
  /**
   * 内部使用的 CubismId 类生成方法
   *
   * @param id ID 字符串
   * @return CubismId
   * @note 要从指定 ID 字符串获取 CubismId 时，
   *       请使用 CubismIdManager().getId(id)
   */
  public static createIdInternal(id: string) {
    return new CubismId(id);
  }

  /**
   * 获取 ID 名称
   */
  public getString() {
    return this._id;
  }

  /**
   * 比较 id
   * @param c 要比较的 id
   * @return 相同返回 true，不同返回 false
   */
  public isEqual(c: string | CubismId): boolean {
    if (typeof c === 'string') {
      return this._id == c;
    } else if (c instanceof CubismId) {
      return this._id == c._id;
    }
    return false;
  }

  /**
   * 比较 id
   * @param c 要比较的 id
   * @return 相同返回 true，不同返回 false
   */
  public isNotEqual(c: string | CubismId): boolean {
    if (typeof c == 'string') {
      return !(this._id == c);
    } else if (c instanceof CubismId) {
      return !(this._id == c._id);
    }
    return false;
  }

  /**
   * 私有构造函数
   *
   * @note 不允许用户自行创建
   */
  private constructor(id: string) {
    this._id = id;
  }

  private _id: string; // ID 名称
}

export declare type CubismIdHandle = CubismId;

// 用于兼容性的命名空间定义。
import * as $ from './cubismid';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismId = $.CubismId;
  export type CubismId = $.CubismId;
  export type CubismIdHandle = $.CubismIdHandle;
}
