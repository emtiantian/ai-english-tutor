// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismIdHandle } from '../id/cubismid';
import { CubismFramework } from '../live2dcubismframework';
import { CubismModel } from '../model/cubismmodel';
import { CubismJson, Value } from '../utils/cubismjson';

const Epsilon = 0.001;
const DefaultFadeInSeconds = 0.5;

// Pose.json 的标签
const FadeIn = 'FadeInTime';
const Link = 'Link';
const Groups = 'Groups';
const Id = 'Id';

/**
 * 设置部件不透明度
 *
 * 管理和设置部件不透明度。
 */
export class CubismPose {
  /**
   * 创建实例
   * @param pose3json pose3.json 数据
   * @param size pose3.json 数据大小[byte]
   * @return 创建的实例
   */
  public static create(pose3json: ArrayBuffer, size: number): CubismPose {
    const json: CubismJson = CubismJson.create(pose3json, size);
    if (!json) {
      return null;
    }

    const ret: CubismPose = new CubismPose();
    const root: Value = json.getRoot();

    // 指定淡入时间
    if (!root.getValueByString(FadeIn).isNull()) {
      ret._fadeTimeSeconds = root
        .getValueByString(FadeIn)
        .toFloat(DefaultFadeInSeconds);

      if (ret._fadeTimeSeconds < 0.0) {
        ret._fadeTimeSeconds = DefaultFadeInSeconds;
      }
    }

    // 部件分组
    const poseListInfo: Value = root.getValueByString(Groups);
    const poseCount: number = poseListInfo.getSize();

    ret._partGroupCounts.length = poseCount;
    for (let poseIndex = 0; poseIndex < poseCount; ++poseIndex) {
      const idListInfo: Value = poseListInfo.getValueByIndex(poseIndex);
      const idCount: number = idListInfo.getSize();
      let groupCount = 0;

      for (let groupIndex = 0; groupIndex < idCount; ++groupIndex) {
        const partInfo: Value = idListInfo.getValueByIndex(groupIndex);
        const partData: PartData = new PartData();
        const parameterId: CubismIdHandle =
          CubismFramework.getIdManager().getId(
            partInfo.getValueByString(Id).getRawString()
          );

        partData.partId = parameterId;

        // 设置联动部件
        if (!partInfo.getValueByString(Link).isNull()) {
          const linkListInfo: Value = partInfo.getValueByString(Link);
          const linkCount: number = linkListInfo.getSize();

          for (let linkIndex = 0; linkIndex < linkCount; ++linkIndex) {
            const linkPart: PartData = new PartData();
            const linkId: CubismIdHandle = CubismFramework.getIdManager().getId(
              linkListInfo.getValueByIndex(linkIndex).getString()
            );

            linkPart.partId = linkId;

            partData.link.push(linkPart);
          }
        }

        ret._partGroups.push(partData.clone());

        ++groupCount;
      }

      ret._partGroupCounts[poseIndex] = groupCount;
    }

    CubismJson.delete(json);

    return ret;
  }

  /**
   * 销毁实例
   * @param pose 目标 CubismPose
   */
  public static delete(pose: CubismPose): void {
    if (pose != null) {
      pose = null;
    }
  }

  /**
   * 更新模型参数
   * @param model 目标模型
   * @param deltaTimeSeconds 增量时间[秒]
   */
  public updateParameters(model: CubismModel, deltaTimeSeconds: number): void {
    // 如果与上次模型不同，则需要初始化
    if (model != this._lastModel) {
      // 初始化参数索引
      this.reset(model);
    }

    this._lastModel = model;

    // 如果从设置更改时间，经过时间可能为负，因此按经过时间 0 处理
    if (deltaTimeSeconds < 0.0) {
      deltaTimeSeconds = 0.0;
    }

    let beginIndex = 0;

    for (let i = 0; i < this._partGroupCounts.length; i++) {
      const partGroupCount: number = this._partGroupCounts[i];

      this.doFade(model, deltaTimeSeconds, beginIndex, partGroupCount);

      beginIndex += partGroupCount;
    }

    this.copyPartOpacities(model);
  }

  /**
   * 初始化显示
   * @param model 目标模型
   * @note 不透明度初始值不为 0 的参数，会将不透明度设为 1
   */
  public reset(model: CubismModel): void {
    let beginIndex = 0;

    for (let i = 0; i < this._partGroupCounts.length; ++i) {
      const groupCount: number = this._partGroupCounts[i];

      for (let j: number = beginIndex; j < beginIndex + groupCount; ++j) {
        this._partGroups[j].initialize(model);

        const partsIndex: number = this._partGroups[j].partIndex;
        const paramIndex: number = this._partGroups[j].parameterIndex;

        if (partsIndex < 0) {
          continue;
        }

        model.setPartOpacityByIndex(partsIndex, j == beginIndex ? 1.0 : 0.0);
        model.setParameterValueByIndex(paramIndex, j == beginIndex ? 1.0 : 0.0);

        for (let k = 0; k < this._partGroups[j].link.length; ++k) {
          this._partGroups[j].link[k].initialize(model);
        }
      }

      beginIndex += groupCount;
    }
  }

  /**
   * 复制部件不透明度
   *
   * @param model 目标模型
   */
  public copyPartOpacities(model: CubismModel): void {
    for (
      let groupIndex = 0;
      groupIndex < this._partGroups.length;
      ++groupIndex
    ) {
      const partData: PartData = this._partGroups[groupIndex];

      if (partData.link.length == 0) {
        continue; // 没有联动参数
      }

      const partIndex: number = this._partGroups[groupIndex].partIndex;
      const opacity: number = model.getPartOpacityByIndex(partIndex);

      for (let linkIndex = 0; linkIndex < partData.link.length; ++linkIndex) {
        const linkPart: PartData = partData.link[linkIndex];
        const linkPartIndex: number = linkPart.partIndex;

        if (linkPartIndex < 0) {
          continue;
        }

        model.setPartOpacityByIndex(linkPartIndex, opacity);
      }
    }
  }

  /**
   * 执行部件淡入操作
   * @param model 目标模型
   * @param deltaTimeSeconds 增量时间[秒]
   * @param beginIndex 要执行淡入操作的部件组起始索引
   * @param partGroupCount 要执行淡入操作的部件组数量
   */
  public doFade(
    model: CubismModel,
    deltaTimeSeconds: number,
    beginIndex: number,
    partGroupCount: number
  ): void {
    let visiblePartIndex = -1;
    let newOpacity = 1.0;

    const phi = 0.5;
    const backOpacityThreshold = 0.15;

    // 获取当前处于显示状态的部件
    for (let i: number = beginIndex; i < beginIndex + partGroupCount; ++i) {
      const partIndex: number = this._partGroups[i].partIndex;
      const paramIndex: number = this._partGroups[i].parameterIndex;

      if (model.getParameterValueByIndex(paramIndex) > Epsilon) {
        if (visiblePartIndex >= 0) {
          break;
        }

        visiblePartIndex = i;
        // 避免除以零
        if (this._fadeTimeSeconds == 0) {
          newOpacity = 1.0;
          continue;
        }

        newOpacity = model.getPartOpacityByIndex(partIndex);

        // 计算新的不透明度
        newOpacity += deltaTimeSeconds / this._fadeTimeSeconds;

        if (newOpacity > 1.0) {
          newOpacity = 1.0;
        }
      }
    }

    if (visiblePartIndex < 0) {
      visiblePartIndex = 0;
      newOpacity = 1.0;
    }

    // 设置显示部件、非显示部件的不透明度
    for (let i: number = beginIndex; i < beginIndex + partGroupCount; ++i) {
      const partsIndex: number = this._partGroups[i].partIndex;

      // 显示部件设置
      if (visiblePartIndex == i) {
        model.setPartOpacityByIndex(partsIndex, newOpacity); // 先设置
      }
      // 非显示部件设置
      else {
        let opacity: number = model.getPartOpacityByIndex(partsIndex);
        let a1: number; // 通过计算求得的不透明度

        if (newOpacity < phi) {
          a1 = (newOpacity * (phi - 1)) / phi + 1.0; // 经过 (0,1),(phi,phi) 的直线公式
        } else {
          a1 = ((1 - newOpacity) * phi) / (1.0 - phi); // 经过 (1,0),(phi,phi) 的直线公式
        }

        // 限制背景可见比例时
        const backOpacity: number = (1.0 - a1) * (1.0 - newOpacity);

        if (backOpacity > backOpacityThreshold) {
          a1 = 1.0 - backOpacityThreshold / (1.0 - newOpacity);
        }

        if (opacity > a1) {
          opacity = a1; // 如果比计算的不透明度更大（更浓），则提高不透明度
        }

        model.setPartOpacityByIndex(partsIndex, opacity);
      }
    }
  }

  /**
   * 构造函数
   */
  public constructor() {
    this._fadeTimeSeconds = DefaultFadeInSeconds;
    this._lastModel = null;
    this._partGroups = new Array<PartData>();
    this._partGroupCounts = new Array<number>();
  }

  _partGroups: Array<PartData>; // 部件组
  _partGroupCounts: Array<number>; // 各部件组的数量
  _fadeTimeSeconds: number; // 淡入时间[秒]
  _lastModel: CubismModel; // 上次操作的模型
}

/**
 * 管理与部件相关的数据
 */
export class PartData {
  /**
   * 构造函数
   */
  constructor(v?: PartData) {
    this.parameterIndex = 0;
    this.partIndex = 0;
    this.link = new Array<PartData>();

    if (v != undefined) {
      this.partId = v.partId;

      this.link.length = v.link.length;
      for (let i = 0; i < v.link.length; i++) {
        this.link[i] = v.link[i].clone();
      }
    }
  }

  /**
   * = 运算符重载
   */
  public assignment(v: PartData): PartData {
    this.partId = v.partId;

    let dstIndex: number = this.link.length;
    this.link.length += v.link.length;
    for (const partData of v.link) {
      this.link[dstIndex++] = partData.clone();
    }

    return this;
  }

  /**
   * 初始化
   * @param model 用于初始化的模型
   */
  public initialize(model: CubismModel): void {
    this.parameterIndex = model.getParameterIndex(this.partId);
    this.partIndex = model.getPartIndex(this.partId);

    model.setParameterValueByIndex(this.parameterIndex, 1);
  }

  /**
   * 生成对象副本
   */
  public clone(): PartData {
    const clonePartData: PartData = new PartData();

    clonePartData.partId = this.partId;
    clonePartData.parameterIndex = this.parameterIndex;
    clonePartData.partIndex = this.partIndex;
    clonePartData.link = new Array<PartData>();

    clonePartData.link.length = this.link.length;
    for (let i = 0; i < this.link.length; i++) {
      clonePartData.link[i] = this.link[i].clone();
    }

    return clonePartData;
  }

  partId: CubismIdHandle; // 部件 ID
  parameterIndex: number; // 参数索引
  partIndex: number; // 部件索引
  link: Array<PartData>; // 联动参数
}

// 为兼容性定义的命名空间。
import * as $ from './cubismpose';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismPose = $.CubismPose;
  export type CubismPose = $.CubismPose;
  export const PartData = $.PartData;
  export type PartData = $.PartData;
}
