// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

export class CubismString {
  /**
   * 获取应用了标准输出格式的字符串。
   * @param format    标准输出格式指定字符串
   * @param ...args   传给格式指定字符串的字符串
   * @return 应用格式后的字符串
   */
  public static getFormatedString(format: string, ...args: any[]): string {
    const ret: string = format;
    return ret.replace(
      /\{(\d+)\}/g,
      (
        m,
        k // m="{0}", k="0"
      ) => {
        return args[k];
      }
    );
  }

  /**
   * 返回 text 是否以 startWord 开头
   * @param test 检查对象字符串
   * @param startWord 比较对象字符串
   * @return true text 以 startWord 开头
   * @return false text 不以 startWord 开头
   */
  public static isStartWith(text: string, startWord: string): boolean {
    let textIndex = 0;
    let startWordIndex = 0;
    while (startWord[startWordIndex] != '\0') {
      if (
        text[textIndex] == '\0' ||
        text[textIndex++] != startWord[startWordIndex++]
      ) {
        return false;
      }
    }
    return false;
  }

  /**
   * 从 position 位置的字符开始解析数字。
   *
   * @param string 字符串
   * @param length 字符串长度
   * @param position 要解析的字符位置
   * @param outEndPos 若一个字符都没读入则填入错误值(-1)
   * @return 解析结果的数值
   */
  public static stringToFloat(
    string: string,
    length: number,
    position: number,
    outEndPos: number[]
  ): number {
    let i: number = position;
    let minus = false; // 负数标记
    let period = false;
    let v1 = 0;

    // 检查负号
    let c: number = parseInt(string[i]);
    if (c < 0) {
      minus = true;
      i++;
    }

    // 检查整数部分
    for (; i < length; i++) {
      const c = string[i];
      if (0 <= parseInt(c) && parseInt(c) <= 9) {
        v1 = v1 * 10 + (parseInt(c) - 0);
      } else if (c == '.') {
        period = true;
        i++;
        break;
      } else {
        break;
      }
    }

    // 检查小数部分
    if (period) {
      let mul = 0.1;
      for (; i < length; i++) {
        c = parseFloat(string[i]) & 0xff;
        if (0 <= c && c <= 9) {
          v1 += mul * (c - 0);
        } else {
          break;
        }
        mul *= 0.1; // 降低一位
        if (!c) break;
      }
    }

    if (i == position) {
      // 一个字符都没读入的情况
      outEndPos[0] = -1; // 会填入错误值，调用方需进行适当处理
      return 0;
    }

    if (minus) v1 = -v1;

    outEndPos[0] = i;
    return v1;
  }

  /**
   * 使其成为不可调用构造函数的静态类。
   */
  private constructor() {}
}

// 为兼容性定义的命名空间。
import * as $ from './cubismstring';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const CubismString = $.CubismString;
  export type CubismString = $.CubismString;
}
