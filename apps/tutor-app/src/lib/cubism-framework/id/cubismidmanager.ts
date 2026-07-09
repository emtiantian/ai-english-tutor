// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismId } from './cubismid';

/**
 * ID 名称管理
 *
 * 管理 ID 名称。
 */
export class CubismIdManager {
  /**
   * 构造函数
   */
  public constructor() {
    this._ids = new Array<CubismId>();
  }

  /**
   * 相当于析构函数的处理
   */
  public release(): void {
    for (let i = 0; i < this._ids.length; ++i) {
      this._ids[i] = void 0;
    }
    this._ids = null;
  }

  /**
   * 从列表中注册 ID 名称
   *
   * @param ids ID 名称列表
   * @param count ID 个数
   */
  public registerIds(ids: string[]): void {
    for (let i = 0; i < ids.length; i++) {
      this.registerId(ids[i]);
    }
  }

  /**
   * 注册 ID 名称
   *
   * @param id ID 名称
   */
  public registerId(id: string): CubismId {
    let result: CubismId = null;

    if ('string' == typeof id) {
      if ((result = this.findId(id)) != null) {
        return result;
      }

      result = CubismId.createIdInternal(id);
      this._ids.push(result);
    } else {
      return this.registerId(id);
    }

    return result;
  }

  /**
   * 根据 ID 名称获取 ID
   *
   * @param id ID 名称
   */
  public getId(id: string): CubismId {
    return this.registerId(id);
  }

  /**
   * 根据 ID 名称确认 ID 是否存在
   *
   * @return true 存在
   * @return false 不存在
   */
  public isExist(id: string): boolean {
    if ('string' == typeof id) {
      return this.findId(id) != null;
    }
    return this.isExist(id);
  }

  /**
   * 根据 ID 名称搜索 ID。
   *
   * @param id ID 名称
   * @return 已注册的 ID。没有则返回 NULL。
   */
  private findId(id: string): CubismId {
    for (let i = 0; i < this._ids.length; ++i) {
      if (this._ids[i].getString() == id) {
        return this._ids[i];
      }
    }

    return null;
  }

  private _ids: Array<CubismId>; // 已注册的 ID 列表
}

// 用于兼容性的命名空间定义。
import * as $ from './cubismidmanager';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismIdManager = $.CubismIdManager;
  export type CubismIdManager = $.CubismIdManager;
}
