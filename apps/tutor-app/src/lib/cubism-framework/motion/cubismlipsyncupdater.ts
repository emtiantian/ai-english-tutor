// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { ICubismUpdater, CubismUpdateOrder } from './icubismupdater';
import { CubismModel } from '../model/cubismmodel';
import { CubismIdHandle } from '../id/cubismid';
import { IParameterProvider } from './iparameterprovider';

/**
 * 唇形同步效果的更新器。
 * 通过参数提供器管理唇形同步动画。
 */
export class CubismLipSyncUpdater extends ICubismUpdater {
  private _lipSyncIds: Array<CubismIdHandle>;
  private _audioProvider: IParameterProvider | null;

  /**
   * 构造函数
   *
   * @param lipSyncIds 唇形同步参数 ID 数组
   * @param audioProvider 音频参数提供器
   */
  constructor(
    lipSyncIds: Array<CubismIdHandle>,
    audioProvider: IParameterProvider | null
  );

  /**
   * 构造函数
   *
   * @param lipSyncIds 唇形同步参数 ID 数组
   * @param audioProvider 音频参数提供器
   * @param executionOrder 执行顺序
   */
  constructor(
    lipSyncIds: Array<CubismIdHandle>,
    audioProvider: IParameterProvider | null,
    executionOrder: number
  );

  constructor(
    lipSyncIds: Array<CubismIdHandle>,
    audioProvider: IParameterProvider | null,
    executionOrder?: number
  ) {
    super(executionOrder ?? CubismUpdateOrder.CubismUpdateOrder_LipSync);
    this._lipSyncIds = [...lipSyncIds]; // 复制数组
    this._audioProvider = audioProvider;
  }

  /**
   * 更新处理。
   *
   * @param model 要更新的模型
   * @param deltaTimeSeconds 增量时间（秒）。
   */
  onLateUpdate(model: CubismModel, deltaTimeSeconds: number): void {
    if (!model) {
      return;
    }

    if (this._audioProvider) {
      const updateSuccessful = this._audioProvider.update(deltaTimeSeconds);
      if (updateSuccessful) {
        const lipSyncValue = this._audioProvider.getParameter();

        // 将唇形同步值应用到所有已注册的参数
        for (let i = 0; i < this._lipSyncIds.length; i++) {
          model.addParameterValueById(this._lipSyncIds[i], lipSyncValue);
        }
      }
    }
  }

  /**
   * 设置音频参数提供器。
   *
   * @param audioProvider 要设置的音频参数提供器
   */
  setAudioProvider(audioProvider: IParameterProvider | null): void {
    this._audioProvider = audioProvider;
  }

  /**
   * 获取音频参数提供器。
   *
   * @return 当前的音频参数提供器
   */
  getAudioProvider(): IParameterProvider | null {
    return this._audioProvider;
  }
}

// 兼容性命名空间定义。
import * as $ from './cubismlipsyncupdater';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismLipSyncUpdater = $.CubismLipSyncUpdater;
  export type CubismLipSyncUpdater = $.CubismLipSyncUpdater;
}
