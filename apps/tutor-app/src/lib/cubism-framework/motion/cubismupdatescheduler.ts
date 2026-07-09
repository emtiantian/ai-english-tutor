// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { ICubismUpdater, ICubismUpdaterChangeListener } from './icubismupdater';
import { CubismModel } from '../model/cubismmodel';

/**
 * 用于管理并更新 ICubismUpdater 实例的调度器。
 * 通过有序列表管理更新顺序与执行。
 */
export class CubismUpdateScheduler implements ICubismUpdaterChangeListener {
  private _cubismUpdatableList: ICubismUpdater[];
  private _needsSort: boolean;

  /**
   * 构造函数
   */
  constructor() {
    this._cubismUpdatableList = [];
    this._needsSort = false;
  }

  /**
   * 析构等效处理 - 释放所有更新器并移除监听器
   */
  public release(): void {
    // 清空前先移除所有监听器
    for (const updater of this._cubismUpdatableList) {
      if (updater) {
        updater.removeChangeListener(this);
      }
    }
    // 清空列表 - 在 TypeScript 中无需手动删除对象，
    // 当不再被引用时它们会被垃圾回收
    this._cubismUpdatableList.length = 0;
  }

  /**
   * 将 ICubismUpdater 添加到更新列表。
   * 列表会在下次更新前按执行顺序自动排序。
   *
   * @param updatable 要添加的 ICubismUpdater 实例。
   */
  public addUpdatableList(updatable: ICubismUpdater): void {
    if (!updatable) {
      return;
    }

    // 检查是否重复注册
    if (this.hasUpdatable(updatable)) {
      return; // 已存在，跳过添加
    }

    this._cubismUpdatableList.push(updatable);
    updatable.addChangeListener(this);
    this._needsSort = true;
  }

  /**
   * 从更新列表中移除 ICubismUpdater。
   *
   * @param updatable 要移除的 ICubismUpdater 实例。
   * @return 如果找到并移除则返回 true，否则返回 false。
   */
  public removeUpdatableList(updatable: ICubismUpdater): boolean {
    if (!updatable) {
      return false;
    }

    const index = this._cubismUpdatableList.indexOf(updatable);
    if (index >= 0) {
      this._cubismUpdatableList.splice(index, 1);
      updatable.removeChangeListener(this);
      // 注意：移除后不需要重新排序
      return true;
    }
    return false;
  }

  /**
   * 使用 ICubismUpdater 排序函数对更新列表排序。
   */
  public sortUpdatableList(): void {
    this._cubismUpdatableList.sort(ICubismUpdater.sortFunction);
    this._needsSort = false;
  }

  /**
   * 更新列表中的每个元素。
   * 执行前会按执行顺序自动排序。
   *
   * @param model 要更新的模型
   * @param deltaTimeSeconds 增量时间（秒）。
   */
  public onLateUpdate(model: CubismModel, deltaTimeSeconds: number): void {
    if (!model) {
      return;
    }

    // 如果需要，自动排序以保证执行顺序
    if (this._needsSort) {
      this.sortUpdatableList();
    }

    for (let i = 0; i < this._cubismUpdatableList.length; ++i) {
      const updater = this._cubismUpdatableList[i];
      if (updater) {
        updater.onLateUpdate(model, deltaTimeSeconds);
      }
    }
  }

  /**
   * 获取列表中更新器的数量。
   *
   * @return 更新器数量
   */
  public getUpdatableCount(): number {
    return this._cubismUpdatableList.length;
  }

  /**
   * 获取指定索引处的更新器。
   *
   * @param index 要获取的更新器索引
   * @return 指定索引处的更新器，如果越界则返回 null
   */
  public getUpdatable(index: number): ICubismUpdater | null {
    if (index < 0 || index >= this._cubismUpdatableList.length) {
      return null;
    }
    return this._cubismUpdatableList[index];
  }

  /**
   * 检查指定更新器是否存在于列表中。
   *
   * @param updatable 要检查的更新器
   * @return 如果存在返回 true，否则返回 false
   */
  public hasUpdatable(updatable: ICubismUpdater): boolean {
    return this._cubismUpdatableList.indexOf(updatable) >= 0;
  }

  /**
   * 清空列表中的所有更新器。
   */
  public clearUpdatableList(): void {
    // 清空前先移除监听器
    for (const updater of this._cubismUpdatableList) {
      if (updater) {
        updater.removeChangeListener(this);
      }
    }
    this._cubismUpdatableList.length = 0;
    this._needsSort = false;
  }

  /**
   * 当更新器的执行顺序发生变化时调用。
   * 将列表标记为需要重新排序。
   *
   * @param updater 发生变化的更新器
   */
  public onUpdaterChanged(updater: ICubismUpdater): void {
    this._needsSort = true;
  }
}

// 兼容性命名空间定义。
import * as $ from './cubismupdatescheduler';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismUpdateScheduler = $.CubismUpdateScheduler;
  export type CubismUpdateScheduler = $.CubismUpdateScheduler;
}
