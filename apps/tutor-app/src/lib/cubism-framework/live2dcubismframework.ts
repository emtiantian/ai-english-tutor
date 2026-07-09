// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import { CubismIdManager } from './id/cubismidmanager';
import { CubismRenderer } from './rendering/cubismrenderer';
import {
  CSM_ASSERT,
  CubismLogInfo,
  CubismLogWarning
} from './utils/cubismdebug';
import { Value } from './utils/cubismjson';

export function strtod(s: string, endPtr: string[]): number {
  let index = 0;
  for (let i = 1; ; i++) {
    const testC: string = s.slice(i - 1, i);

    // 可能是指数或负号，跳过
    if (testC == 'e' || testC == '-' || testC == 'E') {
      continue;
    } // 逐步扩大字符串范围

    const test: string = s.substring(0, i);
    const number = Number(test);
    if (isNaN(number)) {
      // 无法识别为数值，结束
      break;
    } // 最后记录能作为数值的 index

    index = i;
  }
  let d = parseFloat(s); // 解析得到的数值

  if (isNaN(d)) {
    // 无法识别为数值，结束
    d = NaN;
  }

  endPtr[0] = s.slice(index); // 后续字符串
  return d;
}

// 初始化文件作用域变量

let s_isStarted = false;
let s_isInitialized = false;
let s_option: Option = null;
let s_cubismIdManager: CubismIdManager = null;

/**
 * 声明 Framework 内使用的常量
 */
export const Constant = Object.freeze<Record<string, number>>({
  vertexOffset: 0, // 网格顶点的偏移值
  vertexStep: 2 // 网格顶点的步长值
});

export function csmDelete<T>(address: T): void {
  if (!address) {
    return;
  }

  address = void 0;
}

/**
 * Live2D Cubism SDK Original Workflow SDK 的入口
 * 开始使用时调用 CubismFramework.initialize()，结束使用 CubismFramework.dispose()。
 */
export class CubismFramework {
  /**
   * 使 Cubism Framework 的 API 可用。
   *  执行 API 前必须先调用此函数。
   *  一旦准备完成，再次执行也会跳过内部处理。
   *
   * @param    option      Option 类的实例
   *
   * @return   准备处理完成返回 true。
   */
  public static startUp(option: Option = null): boolean {
    if (s_isStarted) {
      CubismLogInfo('CubismFramework.startUp() is already done.');
      return s_isStarted;
    }

    s_option = option;

    if (s_option != null) {
      Live2DCubismCore.Logging.csmSetLogFunction(s_option.logFunction);
    }

    s_isStarted = true;

    // 显示 Live2D Cubism Core 版本信息
    if (s_isStarted) {
      const version: number = Live2DCubismCore.Version.csmGetVersion();
      const major: number = (version & 0xff000000) >> 24;
      const minor: number = (version & 0x00ff0000) >> 16;
      const patch: number = version & 0x0000ffff;
      const versionNumber: number = version;

      CubismLogInfo(
        `Live2D Cubism Core version: {0}.{1}.{2} ({3})`,
        ('00' + major).slice(-2),
        ('00' + minor).slice(-2),
        ('0000' + patch).slice(-4),
        versionNumber
      );
    }

    CubismLogInfo('CubismFramework.startUp() is complete.');

    return s_isStarted;
  }

  /**
   * 清除通过 StartUp() 初始化的 CubismFramework 的各项参数。
   * 在复用已 Dispose() 的 CubismFramework 时使用。
   */
  public static cleanUp(): void {
    s_isStarted = false;
    s_isInitialized = false;
    s_option = null;
    s_cubismIdManager = null;
  }

  /**
   * 初始化 Cubism Framework 内的资源，使模型可以显示。<br>
   *     要再次 Initialize()，必须先执行 Dispose()。
   *
   * @param memorySize 初始化时内存量 [byte(s)]
   *    在显示多个模型等模型不更新时使用。
   *    指定时请务必使用 1024*1024*16 byte(16MB) 以上的值。
   *    除此之外全部四舍五入为 1024*1024*16 byte。
   */
  public static initialize(memorySize = 0): void {
    CSM_ASSERT(s_isStarted);
    if (!s_isStarted) {
      CubismLogWarning('CubismFramework is not started.');
      return;
    }

    // --- s_isInitialized 防止连续初始化守卫 ---
    // 防止连续进行资源分配。
    // 要再次 Initialize()，必须先执行 Dispose()。
    if (s_isInitialized) {
      CubismLogWarning(
        'CubismFramework.initialize() skipped, already initialized.'
      );
      return;
    }

    //---- static 初始化 ----
    Value.staticInitializeNotForClientCall();

    s_cubismIdManager = new CubismIdManager();

    // --- HACK: 扩展初始化时内存量（单位 byte） ---
    // 在显示多个模型等模型不更新时使用。
    // 指定时请务必使用 1024*1024*16 byte(16MB) 以上的值。
    // 除此之外全部四舍五入为 1024*1024*16 byte。
    Live2DCubismCore.Memory.initializeAmountOfMemory(memorySize);

    s_isInitialized = true;

    CubismLogInfo('CubismFramework.initialize() is complete.');
  }

  /**
   * 释放 Cubism Framework 内的所有资源。
   *      但是，不会释放外部分配的资源。
   *      需要在外部适当销毁。
   */
  public static dispose(): void {
    CSM_ASSERT(s_isStarted);
    if (!s_isStarted) {
      CubismLogWarning('CubismFramework is not started.');
      return;
    }

    // --- s_isInitialized 防止未初始化释放守卫 ---
    // 要执行 dispose()，必须先执行 initialize()。
    if (!s_isInitialized) {
      // false... 资源未分配的情况
      CubismLogWarning('CubismFramework.dispose() skipped, not initialized.');
      return;
    }

    Value.staticReleaseNotForClientCall();

    s_cubismIdManager.release();
    s_cubismIdManager = null;

    // 释放渲染器的静态资源（着色器程序等）
    CubismRenderer.staticRelease();

    s_isInitialized = false;

    CubismLogInfo('CubismFramework.dispose() is complete.');
  }

  /**
   * Cubism Framework 的 API 是否已准备就绪
   * @return API 准备完成则返回 true。
   */
  public static isStarted(): boolean {
    return s_isStarted;
  }

  /**
   * Cubism Framework 的资源初始化是否已完成
   * @return 资源分配完成则返回 true
   */
  public static isInitialized(): boolean {
    return s_isInitialized;
  }

  /**
   * 执行绑定到 Core API 的日志函数
   *
   * @praram message 日志消息
   */
  public static coreLogFunction(message: string): void {
    // 如果无法输出日志则直接返回。
    if (!Live2DCubismCore.Logging.csmGetLogFunction()) {
      return;
    }

    Live2DCubismCore.Logging.csmGetLogFunction()(message);
  }

  /**
   * 返回当前日志输出级别设置的值。
   *
   * @return  当前日志输出级别设置的值
   */
  public static getLoggingLevel(): LogLevel {
    if (s_option != null) {
      return s_option.loggingLevel;
    }
    return LogLevel.LogLevel_Off;
  }

  /**
   * 获取 ID 管理器的实例
   * @return CubismManager 类的实例
   */
  public static getIdManager(): CubismIdManager {
    return s_cubismIdManager;
  }

  /**
   * 作为静态类使用
   * 不允许实例化
   */
  private constructor() {}
}

export class Option {
  logFunction: Live2DCubismCore.csmLogFunction; // 日志输出函数对象
  loggingLevel: LogLevel; // 日志输出级别设置
}

/**
 * 日志输出级别
 */
export enum LogLevel {
  LogLevel_Verbose = 0, // 详细日志
  LogLevel_Debug, // 调试日志
  LogLevel_Info, // Info 日志
  LogLevel_Warning, // 警告日志
  LogLevel_Error, // 错误日志
  LogLevel_Off // 关闭日志输出
}

// 用于兼容性的命名空间定义。
import * as $ from './live2dcubismframework';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const Constant = $.Constant;
  export const csmDelete = $.csmDelete;
  export const CubismFramework = $.CubismFramework;
  export type CubismFramework = $.CubismFramework;
}
