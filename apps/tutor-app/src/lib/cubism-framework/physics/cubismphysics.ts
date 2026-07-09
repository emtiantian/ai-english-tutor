// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismMath } from '../math/cubismmath';
import { CubismVector2 } from '../math/cubismvector2';
import { CubismModel } from '../model/cubismmodel';
import { updateSize } from '../utils/cubismarrayutils';
import {
  CubismPhysicsInput,
  CubismPhysicsNormalization,
  CubismPhysicsOutput,
  CubismPhysicsParticle,
  CubismPhysicsRig,
  CubismPhysicsSource,
  CubismPhysicsSubRig,
  CubismPhysicsTargetType
} from './cubismphysicsinternal';
import { CubismPhysicsJson } from './cubismphysicsjson';

// 物理类型标签。
const PhysicsTypeTagX = 'X';
const PhysicsTypeTagY = 'Y';
const PhysicsTypeTagAngle = 'Angle';

// 空气阻力常数。
const AirResistance = 5.0;

// 输入与输出权重最大值常数。
const MaximumWeight = 100.0;

// 移动阈值常数。
const MovementThreshold = 0.001;

// 允许的最大 delta time 常数
const MaxDeltaTime = 5.0;

/**
 * 物理演算类
 */
export class CubismPhysics {
  /**
   * 创建实例
   * @param buffer    已加载 physics3.json 的缓冲区
   * @param size      缓冲区大小
   * @return 创建的实例
   */
  public static create(buffer: ArrayBuffer, size: number): CubismPhysics {
    const ret: CubismPhysics = new CubismPhysics();

    ret.parse(buffer, size);
    ret._physicsRig.gravity.y = 0;

    return ret;
  }

  /**
   * 销毁实例
   * @param physics 要销毁的实例
   */
  public static delete(physics: CubismPhysics): void {
    if (physics != null) {
      physics.release();
      physics = null;
    }
  }

  /**
   * 解析 physics3.json。
   * @param physicsJson 已加载 physics3.json 的缓冲区
   * @param size 缓冲区大小
   */
  public parse(physicsJson: ArrayBuffer, size: number): void {
    this._physicsRig = new CubismPhysicsRig();

    let json: CubismPhysicsJson = new CubismPhysicsJson(physicsJson, size);

    this._physicsRig.gravity = json.getGravity();
    this._physicsRig.wind = json.getWind();
    this._physicsRig.subRigCount = json.getSubRigCount();

    this._physicsRig.fps = json.getFps();

    updateSize(
      this._physicsRig.settings,
      this._physicsRig.subRigCount,
      CubismPhysicsSubRig,
      true
    );
    updateSize(
      this._physicsRig.inputs,
      json.getTotalInputCount(),
      CubismPhysicsInput,
      true
    );
    updateSize(
      this._physicsRig.outputs,
      json.getTotalOutputCount(),
      CubismPhysicsOutput,
      true
    );
    updateSize(
      this._physicsRig.particles,
      json.getVertexCount(),
      CubismPhysicsParticle,
      true
    );

    this._currentRigOutputs.length = 0;
    this._previousRigOutputs.length = 0;

    let inputIndex = 0,
      outputIndex = 0,
      particleIndex = 0;

    let dstIndexCurrentRigOutputs: number = this._currentRigOutputs.length;
    let dstIndexPreviousRigOutputs: number = this._previousRigOutputs.length;
    this._currentRigOutputs.length += this._physicsRig.settings.length;
    this._previousRigOutputs.length += this._physicsRig.settings.length;
    for (let i = 0; i < this._physicsRig.settings.length; ++i) {
      this._physicsRig.settings[i].normalizationPosition.minimum =
        json.getNormalizationPositionMinimumValue(i);
      this._physicsRig.settings[i].normalizationPosition.maximum =
        json.getNormalizationPositionMaximumValue(i);
      this._physicsRig.settings[i].normalizationPosition.defalut =
        json.getNormalizationPositionDefaultValue(i);

      this._physicsRig.settings[i].normalizationAngle.minimum =
        json.getNormalizationAngleMinimumValue(i);
      this._physicsRig.settings[i].normalizationAngle.maximum =
        json.getNormalizationAngleMaximumValue(i);
      this._physicsRig.settings[i].normalizationAngle.defalut =
        json.getNormalizationAngleDefaultValue(i);

      // 输入
      this._physicsRig.settings[i].inputCount = json.getInputCount(i);
      this._physicsRig.settings[i].baseInputIndex = inputIndex;

      for (let j = 0; j < this._physicsRig.settings[i].inputCount; ++j) {
        this._physicsRig.inputs[inputIndex + j].sourceParameterIndex = -1;
        this._physicsRig.inputs[inputIndex + j].weight = json.getInputWeight(
          i,
          j
        );
        this._physicsRig.inputs[inputIndex + j].reflect = json.getInputReflect(
          i,
          j
        );

        if (json.getInputType(i, j) == PhysicsTypeTagX) {
          this._physicsRig.inputs[inputIndex + j].type =
            CubismPhysicsSource.CubismPhysicsSource_X;
          this._physicsRig.inputs[inputIndex + j].getNormalizedParameterValue =
            getInputTranslationXFromNormalizedParameterValue;
        } else if (json.getInputType(i, j) == PhysicsTypeTagY) {
          this._physicsRig.inputs[inputIndex + j].type =
            CubismPhysicsSource.CubismPhysicsSource_Y;
          this._physicsRig.inputs[inputIndex + j].getNormalizedParameterValue =
            getInputTranslationYFromNormalizedParamterValue;
        } else if (json.getInputType(i, j) == PhysicsTypeTagAngle) {
          this._physicsRig.inputs[inputIndex + j].type =
            CubismPhysicsSource.CubismPhysicsSource_Angle;
          this._physicsRig.inputs[inputIndex + j].getNormalizedParameterValue =
            getInputAngleFromNormalizedParameterValue;
        }

        this._physicsRig.inputs[inputIndex + j].source.targetType =
          CubismPhysicsTargetType.CubismPhysicsTargetType_Parameter;
        this._physicsRig.inputs[inputIndex + j].source.id =
          json.getInputSourceId(i, j);
      }
      inputIndex += this._physicsRig.settings[i].inputCount;

      // 输出
      this._physicsRig.settings[i].outputCount = json.getOutputCount(i);
      this._physicsRig.settings[i].baseOutputIndex = outputIndex;

      const currentRigOutput = new PhysicsOutput();
      updateSize(
        currentRigOutput.outputs,
        this._physicsRig.settings[i].outputCount,
        null,
        true
      );

      const previousRigOutput = new PhysicsOutput();
      updateSize(
        previousRigOutput.outputs,
        this._physicsRig.settings[i].outputCount,
        null,
        true
      );

      for (let j = 0; j < this._physicsRig.settings[i].outputCount; ++j) {
        // 初始化
        currentRigOutput.outputs[j] = 0.0;
        previousRigOutput.outputs[j] = 0.0;

        this._physicsRig.outputs[outputIndex + j].destinationParameterIndex =
          -1;
        this._physicsRig.outputs[outputIndex + j].vertexIndex =
          json.getOutputVertexIndex(i, j);
        this._physicsRig.outputs[outputIndex + j].angleScale =
          json.getOutputAngleScale(i, j);
        this._physicsRig.outputs[outputIndex + j].weight = json.getOutputWeight(
          i,
          j
        );
        this._physicsRig.outputs[outputIndex + j].destination.targetType =
          CubismPhysicsTargetType.CubismPhysicsTargetType_Parameter;

        this._physicsRig.outputs[outputIndex + j].destination.id =
          json.getOutputDestinationId(i, j);

        if (json.getOutputType(i, j) == PhysicsTypeTagX) {
          this._physicsRig.outputs[outputIndex + j].type =
            CubismPhysicsSource.CubismPhysicsSource_X;
          this._physicsRig.outputs[outputIndex + j].getValue =
            getOutputTranslationX;
          this._physicsRig.outputs[outputIndex + j].getScale =
            getOutputScaleTranslationX;
        } else if (json.getOutputType(i, j) == PhysicsTypeTagY) {
          this._physicsRig.outputs[outputIndex + j].type =
            CubismPhysicsSource.CubismPhysicsSource_Y;
          this._physicsRig.outputs[outputIndex + j].getValue =
            getOutputTranslationY;
          this._physicsRig.outputs[outputIndex + j].getScale =
            getOutputScaleTranslationY;
        } else if (json.getOutputType(i, j) == PhysicsTypeTagAngle) {
          this._physicsRig.outputs[outputIndex + j].type =
            CubismPhysicsSource.CubismPhysicsSource_Angle;
          this._physicsRig.outputs[outputIndex + j].getValue = getOutputAngle;
          this._physicsRig.outputs[outputIndex + j].getScale =
            getOutputScaleAngle;
        }

        this._physicsRig.outputs[outputIndex + j].reflect =
          json.getOutputReflect(i, j);
      }

      this._currentRigOutputs[dstIndexCurrentRigOutputs++] = currentRigOutput;
      this._previousRigOutputs[dstIndexPreviousRigOutputs++] =
        previousRigOutput;

      outputIndex += this._physicsRig.settings[i].outputCount;

      // 粒子
      this._physicsRig.settings[i].particleCount = json.getParticleCount(i);
      this._physicsRig.settings[i].baseParticleIndex = particleIndex;

      for (let j = 0; j < this._physicsRig.settings[i].particleCount; ++j) {
        this._physicsRig.particles[particleIndex + j].mobility =
          json.getParticleMobility(i, j);
        this._physicsRig.particles[particleIndex + j].delay =
          json.getParticleDelay(i, j);
        this._physicsRig.particles[particleIndex + j].acceleration =
          json.getParticleAcceleration(i, j);
        this._physicsRig.particles[particleIndex + j].radius =
          json.getParticleRadius(i, j);
        this._physicsRig.particles[particleIndex + j].position =
          json.getParticlePosition(i, j);
      }

      particleIndex += this._physicsRig.settings[i].particleCount;
    }

    this.initialize();

    json.release();
    json = void 0;
    json = null;
  }

  /**
   * 计算当前参数值下物理演算稳定的状态。
   * @param model 要应用物理演算结果的模型
   */
  public stabilization(model: CubismModel): void {
    let totalAngle: { angle: number };
    let weight: number;
    let radAngle: number;
    let outputValue: number;
    const totalTranslation: CubismVector2 = new CubismVector2();
    let currentSetting: CubismPhysicsSubRig;
    let currentInputs: CubismPhysicsInput[];
    let currentOutputs: CubismPhysicsOutput[];
    let currentParticles: CubismPhysicsParticle[];

    const parameterValues: Float32Array = model.getModel().parameters.values;
    const parameterMaximumValues: Float32Array =
      model.getModel().parameters.maximumValues;
    const parameterMinimumValues: Float32Array =
      model.getModel().parameters.minimumValues;
    const parameterDefaultValues: Float32Array =
      model.getModel().parameters.defaultValues;

    if ((this._parameterCaches?.length ?? 0) < model.getParameterCount()) {
      this._parameterCaches = new Float32Array(model.getParameterCount());
    }

    if ((this._parameterInputCaches?.length ?? 0) < model.getParameterCount()) {
      this._parameterInputCaches = new Float32Array(model.getParameterCount());
    }

    for (let j = 0; j < model.getParameterCount(); ++j) {
      this._parameterCaches[j] = parameterValues[j];
      this._parameterInputCaches[j] = parameterValues[j];
    }

    for (
      let settingIndex = 0;
      settingIndex < this._physicsRig.subRigCount;
      ++settingIndex
    ) {
      totalAngle = { angle: 0.0 };
      totalTranslation.x = 0.0;
      totalTranslation.y = 0.0;
      currentSetting = this._physicsRig.settings[settingIndex];
      currentInputs = this._physicsRig.inputs.slice(
        currentSetting.baseInputIndex
      );
      currentOutputs = this._physicsRig.outputs.slice(
        currentSetting.baseOutputIndex
      );
      currentParticles = this._physicsRig.particles.slice(
        currentSetting.baseParticleIndex
      );

      // 加载输入参数
      for (let i = 0; i < currentSetting.inputCount; ++i) {
        weight = currentInputs[i].weight / MaximumWeight;

        if (currentInputs[i].sourceParameterIndex == -1) {
          currentInputs[i].sourceParameterIndex = model.getParameterIndex(
            currentInputs[i].source.id
          );
        }

        currentInputs[i].getNormalizedParameterValue(
          totalTranslation,
          totalAngle,
          parameterValues[currentInputs[i].sourceParameterIndex],
          parameterMinimumValues[currentInputs[i].sourceParameterIndex],
          parameterMaximumValues[currentInputs[i].sourceParameterIndex],
          parameterDefaultValues[currentInputs[i].sourceParameterIndex],
          currentSetting.normalizationPosition,
          currentSetting.normalizationAngle,
          currentInputs[i].reflect,
          weight
        );

        this._parameterCaches[currentInputs[i].sourceParameterIndex] =
          parameterValues[currentInputs[i].sourceParameterIndex];
      }

      radAngle = CubismMath.degreesToRadian(-totalAngle.angle);

      totalTranslation.x =
        totalTranslation.x * CubismMath.cos(radAngle) -
        totalTranslation.y * CubismMath.sin(radAngle);
      totalTranslation.y =
        totalTranslation.x * CubismMath.sin(radAngle) +
        totalTranslation.y * CubismMath.cos(radAngle);

      // 计算粒子位置。
      updateParticlesForStabilization(
        currentParticles,
        currentSetting.particleCount,
        totalTranslation,
        totalAngle.angle,
        this._options.wind,
        MovementThreshold * currentSetting.normalizationPosition.maximum
      );

      // 更新输出参数。
      for (let i = 0; i < currentSetting.outputCount; ++i) {
        const particleIndex = currentOutputs[i].vertexIndex;

        if (currentOutputs[i].destinationParameterIndex == -1) {
          currentOutputs[i].destinationParameterIndex = model.getParameterIndex(
            currentOutputs[i].destination.id
          );
        }

        if (
          particleIndex < 1 ||
          particleIndex >= currentSetting.particleCount
        ) {
          continue;
        }

        let translation: CubismVector2 = new CubismVector2();
        translation = currentParticles[particleIndex].position.substract(
          currentParticles[particleIndex - 1].position
        );

        outputValue = currentOutputs[i].getValue(
          translation,
          currentParticles,
          particleIndex,
          currentOutputs[i].reflect,
          this._options.gravity
        );

        this._currentRigOutputs[settingIndex].outputs[i] = outputValue;
        this._previousRigOutputs[settingIndex].outputs[i] = outputValue;

        const destinationParameterIndex: number =
          currentOutputs[i].destinationParameterIndex;

        const outParameterCaches: Float32Array =
          !Float32Array.prototype.slice && 'subarray' in Float32Array.prototype
            ? JSON.parse(
                JSON.stringify(
                  parameterValues.subarray(destinationParameterIndex)
                )
              ) // 用于按值传递，使用 JSON.parse / JSON.stringify
            : parameterValues.slice(destinationParameterIndex);

        updateOutputParameterValue(
          outParameterCaches,
          parameterMinimumValues[destinationParameterIndex],
          parameterMaximumValues[destinationParameterIndex],
          outputValue,
          currentOutputs[i]
        );

        // 反映数值
        for (
          let offset: number = destinationParameterIndex, outParamIndex = 0;
          offset < this._parameterCaches.length;
          offset++, outParamIndex++
        ) {
          parameterValues[offset] = this._parameterCaches[offset] =
            outParameterCaches[outParamIndex];
        }
      }
    }
  }

  /**
   * 物理演算评估
   *
   * 摆锤插值权重
   *
   * 摆锤计算结果会被保存，对参数的输出会与保存的前一次摆锤结果进行插值。
   * 摆锤计算结果会被保存，
   * 对参数的输出会与保存的前一次摆锤结果进行插值。
   *
   * 如图所示，在 [1] 与 [2] 之间进行插值。
   * 图中展示了 [1] 与 [2] 之间的插值。
   *
   * 插值权重由当前时间相对于最新一次摆锤计算时刻与下一次时刻之间的位置决定。
   * 插值权重由当前时间在最新一次摆锤计算时刻与下一次时刻之间所处的位置决定。
   *
   * 如图所示，(3) 的位置权重取决于在 [2] 与 [4] 之间所见的位置。
   * 图中展示了 (3) 在 [2] 与 [4] 之间所处位置的权重。
   *
   * 可以理解为摆锤计算的时刻与权重计算的时刻存在偏差。
   * 可以理解为摆锤计算与权重计算的时刻不一致。
   *
   * 当 physics3.json 中不存在 FPS 信息时，始终会设置为前一次摆锤状态。
   * 当 physics3.json 中没有 FPS 信息时，始终设置为前一次摆锤状态。
   *
   * 该规范旨在避免超出插值范围所导致的颤抖外观。
   * 该规范的目的是避免因偏离插值范围而产生的抖动外观。
   *
   * ------------ time -------------->
   *
   *                 |+++++|------| <- 权重
   * ==[1]====#=====[2]---(3)----(4)
   *          ^ 输出内容
   *
   * 1:_previousRigOutputs
   * 2:_currentRigOutputs
   * 3:_currentRemainTime（当前渲染）
   * 4:下一次粒子计算时刻
   * @param model 要应用物理演算结果的模型
   * @param deltaTimeSeconds 增量时间[秒]
   */
  public evaluate(model: CubismModel, deltaTimeSeconds: number): void {
    let totalAngle: { angle: number };
    let weight: number;
    let radAngle: number;
    let outputValue: number;
    const totalTranslation: CubismVector2 = new CubismVector2();
    let currentSetting: CubismPhysicsSubRig;
    let currentInputs: CubismPhysicsInput[];
    let currentOutputs: CubismPhysicsOutput[];
    let currentParticles: CubismPhysicsParticle[];

    if (0.0 >= deltaTimeSeconds) {
      return;
    }

    const parameterValues: Float32Array = model.getModel().parameters.values;
    const parameterMaximumValues: Float32Array =
      model.getModel().parameters.maximumValues;
    const parameterMinimumValues: Float32Array =
      model.getModel().parameters.minimumValues;
    const parameterDefaultValues: Float32Array =
      model.getModel().parameters.defaultValues;

    let physicsDeltaTime: number;
    this._currentRemainTime += deltaTimeSeconds;
    if (this._currentRemainTime > MaxDeltaTime) {
      this._currentRemainTime = 0.0;
    }

    if ((this._parameterCaches?.length ?? 0) < model.getParameterCount()) {
      this._parameterCaches = new Float32Array(model.getParameterCount());
    }

    if ((this._parameterInputCaches?.length ?? 0) < model.getParameterCount()) {
      this._parameterInputCaches = new Float32Array(model.getParameterCount());
      for (let j = 0; j < model.getParameterCount(); ++j) {
        this._parameterInputCaches[j] = parameterValues[j];
      }
    }

    if (this._physicsRig.fps > 0.0) {
      physicsDeltaTime = 1.0 / this._physicsRig.fps;
    } else {
      physicsDeltaTime = deltaTimeSeconds;
    }

    while (this._currentRemainTime >= physicsDeltaTime) {
      // 将 _currentRigOutputs 复制到 _previousRigOutputs
      for (
        let settingIndex = 0;
        settingIndex < this._physicsRig.subRigCount;
        ++settingIndex
      ) {
        currentSetting = this._physicsRig.settings[settingIndex];
        currentOutputs = this._physicsRig.outputs.slice(
          currentSetting.baseOutputIndex
        );
        for (let i = 0; i < currentSetting.outputCount; ++i) {
          this._previousRigOutputs[settingIndex].outputs[i] =
            this._currentRigOutputs[settingIndex].outputs[i];
        }
      }

      // 对输入缓存与参数进行线性插值，计算 UpdateParticles 执行时刻的输入。
      // 对 _parameterInputCache 与 parameterValue 进行线性插值，计算 UpdateParticles 执行时刻的输入。
      // _parameterCache 负责在组间传播数值，因此需要与 _parameterInputCache 分离。
      // _parameterCache 需要在组间传播数值，因此要与 _parameterInputCache 分离。
      const inputWeight = physicsDeltaTime / this._currentRemainTime;
      for (let j = 0; j < model.getParameterCount(); ++j) {
        this._parameterCaches[j] =
          this._parameterInputCaches[j] * (1.0 - inputWeight) +
          parameterValues[j] * inputWeight;
        this._parameterInputCaches[j] = this._parameterCaches[j];
      }

      for (
        let settingIndex = 0;
        settingIndex < this._physicsRig.subRigCount;
        ++settingIndex
      ) {
        totalAngle = { angle: 0.0 };
        totalTranslation.x = 0.0;
        totalTranslation.y = 0.0;
        currentSetting = this._physicsRig.settings[settingIndex];
        currentInputs = this._physicsRig.inputs.slice(
          currentSetting.baseInputIndex
        );
        currentOutputs = this._physicsRig.outputs.slice(
          currentSetting.baseOutputIndex
        );
        currentParticles = this._physicsRig.particles.slice(
          currentSetting.baseParticleIndex
        );

        // 加载输入参数
        for (let i = 0; i < currentSetting.inputCount; ++i) {
          weight = currentInputs[i].weight / MaximumWeight;

          if (currentInputs[i].sourceParameterIndex == -1) {
            currentInputs[i].sourceParameterIndex = model.getParameterIndex(
              currentInputs[i].source.id
            );
          }

          currentInputs[i].getNormalizedParameterValue(
            totalTranslation,
            totalAngle,
            this._parameterCaches[currentInputs[i].sourceParameterIndex],
            parameterMinimumValues[currentInputs[i].sourceParameterIndex],
            parameterMaximumValues[currentInputs[i].sourceParameterIndex],
            parameterDefaultValues[currentInputs[i].sourceParameterIndex],
            currentSetting.normalizationPosition,
            currentSetting.normalizationAngle,
            currentInputs[i].reflect,
            weight
          );
        }

        radAngle = CubismMath.degreesToRadian(-totalAngle.angle);

        totalTranslation.x =
          totalTranslation.x * CubismMath.cos(radAngle) -
          totalTranslation.y * CubismMath.sin(radAngle);
        totalTranslation.y =
          totalTranslation.x * CubismMath.sin(radAngle) +
          totalTranslation.y * CubismMath.cos(radAngle);

        // 计算粒子位置。
        updateParticles(
          currentParticles,
          currentSetting.particleCount,
          totalTranslation,
          totalAngle.angle,
          this._options.wind,
          MovementThreshold * currentSetting.normalizationPosition.maximum,
          physicsDeltaTime,
          AirResistance
        );

        // 更新输出参数。
        for (let i = 0; i < currentSetting.outputCount; ++i) {
          const particleIndex = currentOutputs[i].vertexIndex;

          if (currentOutputs[i].destinationParameterIndex == -1) {
            currentOutputs[i].destinationParameterIndex =
              model.getParameterIndex(currentOutputs[i].destination.id);
          }

          if (
            particleIndex < 1 ||
            particleIndex >= currentSetting.particleCount
          ) {
            continue;
          }

          const translation: CubismVector2 = new CubismVector2();
          translation.x =
            currentParticles[particleIndex].position.x -
            currentParticles[particleIndex - 1].position.x;
          translation.y =
            currentParticles[particleIndex].position.y -
            currentParticles[particleIndex - 1].position.y;

          outputValue = currentOutputs[i].getValue(
            translation,
            currentParticles,
            particleIndex,
            currentOutputs[i].reflect,
            this._options.gravity
          );

          this._currentRigOutputs[settingIndex].outputs[i] = outputValue;

          const destinationParameterIndex: number =
            currentOutputs[i].destinationParameterIndex;
          const outParameterCaches: Float32Array =
            !Float32Array.prototype.slice &&
            'subarray' in Float32Array.prototype
              ? JSON.parse(
                  JSON.stringify(
                    this._parameterCaches.subarray(destinationParameterIndex)
                  )
                ) // 用于按值传递，使用 JSON.parse / JSON.stringify
              : this._parameterCaches.slice(destinationParameterIndex);

          updateOutputParameterValue(
            outParameterCaches,
            parameterMinimumValues[destinationParameterIndex],
            parameterMaximumValues[destinationParameterIndex],
            outputValue,
            currentOutputs[i]
          );

          // 反映数值
          for (
            let offset: number = destinationParameterIndex, outParamIndex = 0;
            offset < this._parameterCaches.length;
            offset++, outParamIndex++
          ) {
            this._parameterCaches[offset] = outParameterCaches[outParamIndex];
          }
        }
      }
      this._currentRemainTime -= physicsDeltaTime;
    }

    const alpha: number = this._currentRemainTime / physicsDeltaTime;
    this.interpolate(model, alpha);
  }

  /**
   * 应用物理演算结果
   * 根据指定权重，将最新一次摆锤演算结果与前一次结果进行应用。
   * @param model 要应用物理演算结果的模型
   * @param weight 最新结果的权重
   */
  public interpolate(model: CubismModel, weight: number): void {
    let currentOutputs: CubismPhysicsOutput[];
    let currentSetting: CubismPhysicsSubRig;
    const parameterValues: Float32Array = model.getModel().parameters.values;
    const parameterMaximumValues: Float32Array =
      model.getModel().parameters.maximumValues;
    const parameterMinimumValues: Float32Array =
      model.getModel().parameters.minimumValues;

    for (
      let settingIndex = 0;
      settingIndex < this._physicsRig.subRigCount;
      ++settingIndex
    ) {
      currentSetting = this._physicsRig.settings[settingIndex];
      currentOutputs = this._physicsRig.outputs.slice(
        currentSetting.baseOutputIndex
      );

      // 加载输入参数。
      for (let i = 0; i < currentSetting.outputCount; ++i) {
        if (currentOutputs[i].destinationParameterIndex == -1) {
          continue;
        }

        const destinationParameterIndex: number =
          currentOutputs[i].destinationParameterIndex;
        const outParameterValues: Float32Array =
          !Float32Array.prototype.slice && 'subarray' in Float32Array.prototype
            ? JSON.parse(
                JSON.stringify(
                  parameterValues.subarray(destinationParameterIndex)
                )
              ) // 用于按值传递，使用 JSON.parse / JSON.stringify
            : parameterValues.slice(destinationParameterIndex);

        updateOutputParameterValue(
          outParameterValues,
          parameterMinimumValues[destinationParameterIndex],
          parameterMaximumValues[destinationParameterIndex],
          this._previousRigOutputs[settingIndex].outputs[i] * (1 - weight) +
            this._currentRigOutputs[settingIndex].outputs[i] * weight,
          currentOutputs[i]
        );

        // 反映数值
        for (
          let offset: number = destinationParameterIndex, outParamIndex = 0;
          offset < parameterValues.length;
          offset++, outParamIndex++
        ) {
          parameterValues[offset] = outParameterValues[outParamIndex];
        }
      }
    }
  }

  /**
   * 设置选项
   * @param options 选项
   */
  public setOptions(options: Options): void {
    this._options = options;
  }

  /**
   * 获取选项
   * @return 选项
   */
  public getOption(): Options {
    return this._options;
  }

  /**
   * 构造函数
   */
  public constructor() {
    this._physicsRig = null;

    // 设置默认选项
    this._options = new Options();
    this._options.gravity.y = -1.0;
    this._options.gravity.x = 0.0;
    this._options.wind.x = 0.0;
    this._options.wind.y = 0.0;
    this._currentRigOutputs = new Array<PhysicsOutput>();
    this._previousRigOutputs = new Array<PhysicsOutput>();
    this._currentRemainTime = 0.0;
    this._parameterCaches = null;
    this._parameterInputCaches = null;
  }

  /**
   * 相当于析构函数的处理
   */
  public release(): void {
    this._physicsRig = void 0;
    this._physicsRig = null;
  }

  /**
   * 初始化
   */
  public initialize(): void {
    let strand: CubismPhysicsParticle[];
    let currentSetting: CubismPhysicsSubRig;
    let radius: CubismVector2;

    for (
      let settingIndex = 0;
      settingIndex < this._physicsRig.subRigCount;
      ++settingIndex
    ) {
      currentSetting = this._physicsRig.settings[settingIndex];
      strand = this._physicsRig.particles.slice(
        currentSetting.baseParticleIndex
      );

      // 初始化首个粒子。
      strand[0].initialPosition = new CubismVector2(0.0, 0.0);
      strand[0].lastPosition = new CubismVector2(
        strand[0].initialPosition.x,
        strand[0].initialPosition.y
      );
      strand[0].lastGravity = new CubismVector2(0.0, -1.0);
      strand[0].lastGravity.y *= -1.0;
      strand[0].velocity = new CubismVector2(0.0, 0.0);
      strand[0].force = new CubismVector2(0.0, 0.0);

      // 初始化粒子。
      for (let i = 1; i < currentSetting.particleCount; ++i) {
        radius = new CubismVector2(0.0, 0.0);
        radius.y = strand[i].radius;
        strand[i].initialPosition = new CubismVector2(
          strand[i - 1].initialPosition.x + radius.x,
          strand[i - 1].initialPosition.y + radius.y
        );
        strand[i].position = new CubismVector2(
          strand[i].initialPosition.x,
          strand[i].initialPosition.y
        );
        strand[i].lastPosition = new CubismVector2(
          strand[i].initialPosition.x,
          strand[i].initialPosition.y
        );
        strand[i].lastGravity = new CubismVector2(0.0, -1.0);
        strand[i].lastGravity.y *= -1.0;
        strand[i].velocity = new CubismVector2(0.0, 0.0);
        strand[i].force = new CubismVector2(0.0, 0.0);
      }
    }
  }

  _physicsRig: CubismPhysicsRig; // 物理演算数据
  _options: Options; // 选项

  _currentRigOutputs: Array<PhysicsOutput>; ///< 最新一次摆锤计算的结果
  _previousRigOutputs: Array<PhysicsOutput>; ///< 前一次摆锤计算的结果

  _currentRemainTime: number; ///< 物理演算尚未处理的时间

  _parameterCaches: Float32Array; ///< Evaluate 使用的参数缓存
  _parameterInputCaches: Float32Array; ///< UpdateParticles 运行时的输入缓存
}

/**
 * 物理演算选项
 */
export class Options {
  constructor() {
    this.gravity = new CubismVector2(0, 0);
    this.wind = new CubismVector2(0, 0);
  }

  gravity: CubismVector2; // 重力方向
  wind: CubismVector2; // 风向
}

/**
 * 应用到参数之前的物理演算输出结果
 */
export class PhysicsOutput {
  constructor() {
    this.outputs = new Array<number>(0);
  }

  outputs: Array<number>; // 物理演算输出结果
}

/**
 * 获取符号。
 *
 * @param value 要评估的数值。
 *
 * @return 数值的符号。
 */
function sign(value: number): number {
  let ret = 0;

  if (value > 0.0) {
    ret = 1;
  } else if (value < 0.0) {
    ret = -1;
  }

  return ret;
}

function getInputTranslationXFromNormalizedParameterValue(
  targetTranslation: CubismVector2,
  targetAngle: { angle: number },
  value: number,
  parameterMinimumValue: number,
  parameterMaximumValue: number,
  parameterDefaultValue: number,
  normalizationPosition: CubismPhysicsNormalization,
  normalizationAngle: CubismPhysicsNormalization,
  isInverted: boolean,
  weight: number
): void {
  targetTranslation.x +=
    normalizeParameterValue(
      value,
      parameterMinimumValue,
      parameterMaximumValue,
      parameterDefaultValue,
      normalizationPosition.minimum,
      normalizationPosition.maximum,
      normalizationPosition.defalut,
      isInverted
    ) * weight;
}

function getInputTranslationYFromNormalizedParamterValue(
  targetTranslation: CubismVector2,
  targetAngle: { angle: number },
  value: number,
  parameterMinimumValue: number,
  parameterMaximumValue: number,
  parameterDefaultValue: number,
  normalizationPosition: CubismPhysicsNormalization,
  normalizationAngle: CubismPhysicsNormalization,
  isInverted: boolean,
  weight: number
): void {
  targetTranslation.y +=
    normalizeParameterValue(
      value,
      parameterMinimumValue,
      parameterMaximumValue,
      parameterDefaultValue,
      normalizationPosition.minimum,
      normalizationPosition.maximum,
      normalizationPosition.defalut,
      isInverted
    ) * weight;
}

function getInputAngleFromNormalizedParameterValue(
  targetTranslation: CubismVector2,
  targetAngle: { angle: number },
  value: number,
  parameterMinimumValue: number,
  parameterMaximumValue: number,
  parameterDefaultValue: number,
  normalizaitionPosition: CubismPhysicsNormalization,
  normalizationAngle: CubismPhysicsNormalization,
  isInverted: boolean,
  weight: number
): void {
  targetAngle.angle +=
    normalizeParameterValue(
      value,
      parameterMinimumValue,
      parameterMaximumValue,
      parameterDefaultValue,
      normalizationAngle.minimum,
      normalizationAngle.maximum,
      normalizationAngle.defalut,
      isInverted
    ) * weight;
}

function getOutputTranslationX(
  translation: CubismVector2,
  particles: CubismPhysicsParticle[],
  particleIndex: number,
  isInverted: boolean,
  parentGravity: CubismVector2
): number {
  let outputValue: number = translation.x;

  if (isInverted) {
    outputValue *= -1.0;
  }

  return outputValue;
}

function getOutputTranslationY(
  translation: CubismVector2,
  particles: CubismPhysicsParticle[],
  particleIndex: number,
  isInverted: boolean,
  parentGravity: CubismVector2
): number {
  let outputValue: number = translation.y;

  if (isInverted) {
    outputValue *= -1.0;
  }
  return outputValue;
}

function getOutputAngle(
  translation: CubismVector2,
  particles: CubismPhysicsParticle[],
  particleIndex: number,
  isInverted: boolean,
  parentGravity: CubismVector2
): number {
  let outputValue: number;

  if (particleIndex >= 2) {
    parentGravity = particles[particleIndex - 1].position.substract(
      particles[particleIndex - 2].position
    );
  } else {
    parentGravity = parentGravity.multiplyByScaler(-1.0);
  }

  outputValue = CubismMath.directionToRadian(parentGravity, translation);

  if (isInverted) {
    outputValue *= -1.0;
  }

  return outputValue;
}

function getRangeValue(min: number, max: number): number {
  const maxValue: number = CubismMath.max(min, max);
  const minValue: number = CubismMath.min(min, max);

  return CubismMath.abs(maxValue - minValue);
}

function getDefaultValue(min: number, max: number): number {
  const minValue: number = CubismMath.min(min, max);
  return minValue + getRangeValue(min, max) / 2.0;
}

function getOutputScaleTranslationX(
  translationScale: CubismVector2,
  angleScale: number
): number {
  return JSON.parse(JSON.stringify(translationScale.x));
}

function getOutputScaleTranslationY(
  translationScale: CubismVector2,
  angleScale: number
): number {
  return JSON.parse(JSON.stringify(translationScale.y));
}

function getOutputScaleAngle(
  translationScale: CubismVector2,
  angleScale: number
): number {
  return JSON.parse(JSON.stringify(angleScale));
}

/**
 * 更新粒子。
 *
 * @param strand                粒子目标数组。
 * @param strandCount           粒子数量。
 * @param totalTranslation      总平移值。
 * @param totalAngle            总角度。
 * @param windDirection         风向。
 * @param thresholdValue        移动阈值。
 * @param deltaTimeSeconds      增量时间。
 * @param airResistance         空气阻力。
 */
function updateParticles(
  strand: CubismPhysicsParticle[],
  strandCount: number,
  totalTranslation: CubismVector2,
  totalAngle: number,
  windDirection: CubismVector2,
  thresholdValue: number,
  deltaTimeSeconds: number,
  airResistance: number
) {
  let delay: number;
  let radian: number;
  let direction: CubismVector2 = new CubismVector2(0.0, 0.0);
  let velocity: CubismVector2 = new CubismVector2(0.0, 0.0);
  let force: CubismVector2 = new CubismVector2(0.0, 0.0);
  let newDirection: CubismVector2 = new CubismVector2(0.0, 0.0);

  strand[0].position = new CubismVector2(
    totalTranslation.x,
    totalTranslation.y
  );

  const totalRadian: number = CubismMath.degreesToRadian(totalAngle);
  const currentGravity: CubismVector2 =
    CubismMath.radianToDirection(totalRadian);
  currentGravity.normalize();

  for (let i = 1; i < strandCount; ++i) {
    strand[i].force = currentGravity
      .multiplyByScaler(strand[i].acceleration)
      .add(windDirection);

    strand[i].lastPosition = new CubismVector2(
      strand[i].position.x,
      strand[i].position.y
    );

    delay = strand[i].delay * deltaTimeSeconds * 30.0;

    direction = strand[i].position.substract(strand[i - 1].position);

    radian =
      CubismMath.directionToRadian(strand[i].lastGravity, currentGravity) /
      airResistance;

    direction.x =
      CubismMath.cos(radian) * direction.x -
      direction.y * CubismMath.sin(radian);
    direction.y =
      CubismMath.sin(radian) * direction.x +
      direction.y * CubismMath.cos(radian);

    strand[i].position = strand[i - 1].position.add(direction);

    velocity = strand[i].velocity.multiplyByScaler(delay);
    force = strand[i].force.multiplyByScaler(delay).multiplyByScaler(delay);

    strand[i].position = strand[i].position.add(velocity).add(force);

    newDirection = strand[i].position.substract(strand[i - 1].position);
    newDirection.normalize();

    strand[i].position = strand[i - 1].position.add(
      newDirection.multiplyByScaler(strand[i].radius)
    );

    if (CubismMath.abs(strand[i].position.x) < thresholdValue) {
      strand[i].position.x = 0.0;
    }

    if (delay != 0.0) {
      strand[i].velocity = strand[i].position.substract(strand[i].lastPosition);
      strand[i].velocity = strand[i].velocity.divisionByScalar(delay);
      strand[i].velocity = strand[i].velocity.multiplyByScaler(
        strand[i].mobility
      );
    }

    strand[i].force = new CubismVector2(0.0, 0.0);
    strand[i].lastGravity = new CubismVector2(
      currentGravity.x,
      currentGravity.y
    );
  }
}

/**
 * 为稳定化更新粒子。
 *
 * @param strand                粒子目标数组。
 * @param strandCount           粒子数量。
 * @param totalTranslation      总平移值。
 * @param totalAngle            总角度。
 * @param windDirection         风向。
 * @param thresholdValue        移动阈值。
 */
function updateParticlesForStabilization(
  strand: CubismPhysicsParticle[],
  strandCount: number,
  totalTranslation: CubismVector2,
  totalAngle: number,
  windDirection: CubismVector2,
  thresholdValue: number
) {
  let force: CubismVector2 = new CubismVector2(0.0, 0.0);

  strand[0].position = new CubismVector2(
    totalTranslation.x,
    totalTranslation.y
  );

  const totalRadian: number = CubismMath.degreesToRadian(totalAngle);
  const currentGravity: CubismVector2 =
    CubismMath.radianToDirection(totalRadian);
  currentGravity.normalize();

  for (let i = 1; i < strandCount; ++i) {
    strand[i].force = currentGravity
      .multiplyByScaler(strand[i].acceleration)
      .add(windDirection);

    strand[i].lastPosition = new CubismVector2(
      strand[i].position.x,
      strand[i].position.y
    );

    strand[i].velocity = new CubismVector2(0.0, 0.0);
    force = strand[i].force;
    force.normalize();

    force = force.multiplyByScaler(strand[i].radius);
    strand[i].position = strand[i - 1].position.add(force);

    if (CubismMath.abs(strand[i].position.x) < thresholdValue) {
      strand[i].position.x = 0.0;
    }

    strand[i].force = new CubismVector2(0.0, 0.0);
    strand[i].lastGravity = new CubismVector2(
      currentGravity.x,
      currentGravity.y
    );
  }
}

/**
 * 更新输出参数值。
 * @param parameterValue            目标参数值。
 * @param parameterValueMinimum     参数最小值。
 * @param parameterValueMaximum     参数最大值。
 * @param translation               平移值。
 */
function updateOutputParameterValue(
  parameterValue: Float32Array,
  parameterValueMinimum: number,
  parameterValueMaximum: number,
  translation: number,
  output: CubismPhysicsOutput
): void {
  let value: number;
  const outputScale: number = output.getScale(
    output.translationScale,
    output.angleScale
  );

  value = translation * outputScale;

  if (value < parameterValueMinimum) {
    if (value < output.valueBelowMinimum) {
      output.valueBelowMinimum = value;
    }

    value = parameterValueMinimum;
  } else if (value > parameterValueMaximum) {
    if (value > output.valueExceededMaximum) {
      output.valueExceededMaximum = value;
    }

    value = parameterValueMaximum;
  }

  const weight: number = output.weight / MaximumWeight;

  if (weight >= 1.0) {
    parameterValue[0] = value;
  } else {
    value = parameterValue[0] * (1.0 - weight) + value * weight;
    parameterValue[0] = value;
  }
}

function normalizeParameterValue(
  value: number,
  parameterMinimum: number,
  parameterMaximum: number,
  parameterDefault: number,
  normalizedMinimum: number,
  normalizedMaximum: number,
  normalizedDefault: number,
  isInverted: boolean
) {
  let result = 0.0;

  const maxValue: number = CubismMath.max(parameterMaximum, parameterMinimum);

  if (maxValue < value) {
    value = maxValue;
  }

  const minValue: number = CubismMath.min(parameterMaximum, parameterMinimum);

  if (minValue > value) {
    value = minValue;
  }

  const minNormValue: number = CubismMath.min(
    normalizedMinimum,
    normalizedMaximum
  );
  const maxNormValue: number = CubismMath.max(
    normalizedMinimum,
    normalizedMaximum
  );
  const middleNormValue: number = normalizedDefault;

  const middleValue: number = getDefaultValue(minValue, maxValue);
  const paramValue: number = value - middleValue;

  switch (sign(paramValue)) {
    case 1: {
      const nLength: number = maxNormValue - middleNormValue;
      const pLength: number = maxValue - middleValue;

      if (pLength != 0.0) {
        result = paramValue * (nLength / pLength);
        result += middleNormValue;
      }

      break;
    }
    case -1: {
      const nLength: number = minNormValue - middleNormValue;
      const pLength: number = minValue - middleValue;

      if (pLength != 0.0) {
        result = paramValue * (nLength / pLength);
        result += middleNormValue;
      }

      break;
    }
    case 0: {
      result = middleNormValue;

      break;
    }
    default: {
      break;
    }
  }

  return isInverted ? result : result * -1.0;
}

// 兼容性命名空间定义。
import * as $ from './cubismphysics';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismPhysics = $.CubismPhysics;
  export type CubismPhysics = $.CubismPhysics;
  export const Options = $.Options;
  export type Options = $.Options;
}
