// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismModel } from '../model/cubismmodel';

/**
 * 用于监听 ICubismUpdater 变化的接口。
 */
export interface ICubismUpdaterChangeListener {
  /**
   * 当更新器的执行顺序发生变化时调用。
   *
   * @param updater 发生变化的更新器
   */
  onUpdaterChanged(updater: ICubismUpdater): void;
}

export enum CubismUpdateOrder {
  CubismUpdateOrder_EyeBlink = 200,
  CubismUpdateOrder_Expression = 300,
  CubismUpdateOrder_Drag = 400,
  CubismUpdateOrder_Breath = 500,
  CubismUpdateOrder_Physics = 600,
  CubismUpdateOrder_LipSync = 700,
  CubismUpdateOrder_Pose = 800,
  CubismUpdateOrder_Max = Number.MAX_SAFE_INTEGER
}

/**
 * 动作的抽象基类。<br>
 * 通过 CubismUpdateScheduler 管理动作播放。
 */
export abstract class ICubismUpdater {
  /**
   * 对 ICubismUpdater 对象排序时使用的比较函数。
   *
   * @param left 第一个待比较的 ICubismUpdater 对象。
   * @param right 第二个待比较的 ICubismUpdater 对象。
   *
   * @return 如果 left 应排在 right 前面则为负数，
   *         如果 right 应排在 left 前面则为正数，
   *         如果相等则为零。
   */
  static sortFunction(left: ICubismUpdater, right: ICubismUpdater): number {
    if (!left || !right) {
      if (!left && !right) return 0;
      if (!left) return 1; // null/undefined 元素放到末尾
      if (!right) return -1;
    }
    return left.getExecutionOrder() - right.getExecutionOrder();
  }

  private _executionOrder: number;
  private _changeListeners: ICubismUpdaterChangeListener[] = [];

  /**
   * 构造函数
   */
  constructor(executionOrder: number = 0) {
    this._executionOrder = executionOrder;
  }

  /**
   * 更新处理。
   *
   * @param model 要更新的模型
   * @param deltaTimeSeconds 增量时间（秒）。
   */
  abstract onLateUpdate(model: CubismModel, deltaTimeSeconds: number): void;

  getExecutionOrder(): number {
    return this._executionOrder;
  }

  setExecutionOrder(executionOrder: number): void {
    if (this._executionOrder !== executionOrder) {
      this._executionOrder = executionOrder;
      this.notifyChangeListeners();
    }
  }

  /**
   * 添加监听器，当该更新器的属性发生变化时收到通知。
   *
   * @param listener 要添加的监听器
   */
  addChangeListener(listener: ICubismUpdaterChangeListener): void {
    if (listener && this._changeListeners.indexOf(listener) === -1) {
      this._changeListeners.push(listener);
    }
  }

  /**
   * 从通知列表中移除监听器。
   *
   * @param listener 要移除的监听器
   */
  removeChangeListener(listener: ICubismUpdaterChangeListener): void {
    const index = this._changeListeners.indexOf(listener);
    if (index >= 0) {
      this._changeListeners.splice(index, 1);
    }
  }

  /**
   * 通知所有已注册的监听器该更新器已发生变化。
   */
  private notifyChangeListeners(): void {
    for (const listener of this._changeListeners) {
      listener.onUpdaterChanged(this);
    }
  }
}

// 兼容性命名空间定义。
import * as $ from './icubismupdater';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const ICubismUpdater = $.ICubismUpdater;
  export type ICubismUpdater = $.ICubismUpdater;
  export type ICubismUpdaterChangeListener = $.ICubismUpdaterChangeListener;
}
