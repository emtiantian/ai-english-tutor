// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

import {
  CSM_LOG_LEVEL,
  CSM_LOG_LEVEL_DEBUG,
  CSM_LOG_LEVEL_ERROR,
  CSM_LOG_LEVEL_INFO,
  CSM_LOG_LEVEL_VERBOSE,
  CSM_LOG_LEVEL_WARNING
} from '../cubismframeworkconfig';
import { CubismFramework, LogLevel } from '../live2dcubismframework';

export const CubismLogPrint = (level: LogLevel, fmt: string, args: any[]) => {
  CubismDebug.print(level, '[CSM]' + fmt, args);
};

export const CubismLogPrintIn = (level: LogLevel, fmt: string, args: any[]) => {
  CubismLogPrint(level, fmt + '\n', args);
};

export const CSM_ASSERT = (expr: any) => {
  console.assert(expr);
};

export let CubismLogVerbose: (fmt: string, ...args: any[]) => void;
export let CubismLogDebug: (fmt: string, ...args: any[]) => void;
export let CubismLogInfo: (fmt: string, ...args: any[]) => void;
export let CubismLogWarning: (fmt: string, ...args: any[]) => void;
export let CubismLogError: (fmt: string, ...args: any[]) => void;

if (CSM_LOG_LEVEL <= CSM_LOG_LEVEL_VERBOSE) {
  CubismLogVerbose = (fmt: string, ...args: any[]) => {
    CubismLogPrintIn(LogLevel.LogLevel_Verbose, '[V]' + fmt, args);
  };

  CubismLogDebug = (fmt: string, ...args: any[]) => {
    CubismLogPrintIn(LogLevel.LogLevel_Debug, '[D]' + fmt, args);
  };

  CubismLogInfo = (fmt: string, ...args: any[]) => {
    CubismLogPrintIn(LogLevel.LogLevel_Info, '[I]' + fmt, args);
  };

  CubismLogWarning = (fmt: string, ...args: any[]) => {
    CubismLogPrintIn(LogLevel.LogLevel_Warning, '[W]' + fmt, args);
  };

  CubismLogError = (fmt: string, ...args: any[]) => {
    CubismLogPrintIn(LogLevel.LogLevel_Error, '[E]' + fmt, args);
  };
} else if (CSM_LOG_LEVEL == CSM_LOG_LEVEL_DEBUG) {
  CubismLogDebug = (fmt: string, ...args: any[]) => {
    CubismLogPrintIn(LogLevel.LogLevel_Debug, '[D]' + fmt, args);
  };

  CubismLogInfo = (fmt: string, ...args: any[]) => {
    CubismLogPrintIn(LogLevel.LogLevel_Info, '[I]' + fmt, args);
  };

  CubismLogWarning = (fmt: string, ...args: any[]) => {
    CubismLogPrintIn(LogLevel.LogLevel_Warning, '[W]' + fmt, args);
  };

  CubismLogError = (fmt: string, ...args: any[]) => {
    CubismLogPrintIn(LogLevel.LogLevel_Error, '[E]' + fmt, args);
  };
} else if (CSM_LOG_LEVEL == CSM_LOG_LEVEL_INFO) {
  CubismLogInfo = (fmt: string, ...args: any[]) => {
    CubismLogPrintIn(LogLevel.LogLevel_Info, '[I]' + fmt, args);
  };

  CubismLogWarning = (fmt: string, ...args: any[]) => {
    CubismLogPrintIn(LogLevel.LogLevel_Warning, '[W]' + fmt, args);
  };

  CubismLogError = (fmt: string, ...args: any[]) => {
    CubismLogPrintIn(LogLevel.LogLevel_Error, '[E]' + fmt, args);
  };
} else if (CSM_LOG_LEVEL == CSM_LOG_LEVEL_WARNING) {
  CubismLogWarning = (fmt: string, ...args: any[]) => {
    CubismLogPrintIn(LogLevel.LogLevel_Warning, '[W]' + fmt, args);
  };

  CubismLogError = (fmt: string, ...args: any[]) => {
    CubismLogPrintIn(LogLevel.LogLevel_Error, '[E]' + fmt, args);
  };
} else if (CSM_LOG_LEVEL == CSM_LOG_LEVEL_ERROR) {
  CubismLogError = (fmt: string, ...args: any[]) => {
    CubismLogPrintIn(LogLevel.LogLevel_Error, '[E]' + fmt, args);
  };
}

/**
 * 调试工具类。
 * 用于日志输出、字节转储等
 */
export class CubismDebug {
  /**
   * 输出日志。第一个参数设置日志级别。
   * 若低于 CubismFramework.initialize() 时选项设定的日志输出级别，则不输出日志。
   *
   * @param logLevel 日志级别设置
   * @param format 格式化字符串
   * @param args 可变参数
   */
  public static print(logLevel: LogLevel, format: string, args?: any[]): void {
    // 若低于选项设定的日志输出级别，则不输出日志
    if (logLevel < CubismFramework.getLoggingLevel()) {
      return;
    }

    const logPrint: Live2DCubismCore.csmLogFunction =
      CubismFramework.coreLogFunction;

    if (!logPrint) return;

    const buffer: string = format.replace(/\{(\d+)\}/g, (m, k) => {
      return args[k];
    });
    logPrint(buffer);
  }

  /**
   * 从数据中按指定长度输出转储。
   * 若低于 CubismFramework.initialize() 时选项设定的日志输出级别，则不输出日志。
   *
   * @param logLevel 日志级别设置
   * @param data 要转储的数据
   * @param length 要转储的长度
   */
  public static dumpBytes(
    logLevel: LogLevel,
    data: Uint8Array,
    length: number
  ): void {
    for (let i = 0; i < length; i++) {
      if (i % 16 == 0 && i > 0) this.print(logLevel, '\n');
      else if (i % 8 == 0 && i > 0) this.print(logLevel, '  ');
      this.print(logLevel, '{0} ', [data[i] & 0xff]);
    }

    this.print(logLevel, '\n');
  }

  /**
   * 私有构造函数
   */
  private constructor() {}
}

// 为兼容性定义的命名空间。
import * as $ from './cubismdebug';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismDebug = $.CubismDebug;
  export type CubismDebug = $.CubismDebug;
}
