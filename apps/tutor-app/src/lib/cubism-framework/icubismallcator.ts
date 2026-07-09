// @ts-nocheck
/**
 * Copyright(c) Live2D Inc. All rights reserved.
 *
 * Use of this source code is governed by the Live2D Open Software license
 * that can be found at https://www.live2d.com/eula/live2d-open-software-license-agreement_en.html.
 */

/**
 * 抽象内存分配类
 *
 * 由平台侧实现内存分配与释放处理，
 * 供框架调用的接口。
 */
export abstract class ICubismAllocator {
  /**
   * 分配无对齐约束的堆内存
   *
   * @param size 要分配的字节数
   * @return 成功时返回分配的内存地址，否则返回 '0'
   */
  public abstract allocate(size: number): any;

  /**
   * 释放无对齐约束的堆内存。
   *
   * @param memory 要释放的内存地址
   */
  public abstract deallocate(memory: any): void;

  /**
   * 分配有对齐约束的堆内存。
   * @param size 要分配的字节数
   * @param alignment 内存块的对齐宽度
   * @return 成功时返回分配的内存地址，否则返回 '0'
   */
  public abstract allocateAligned(size: number, alignment: number): any;

  /**
   * 释放有对齐约束的堆内存。
   * @param alignedMemory 要释放的内存地址
   */
  public abstract deallocateAligned(alignedMemory: any): void;
}

// 为兼容性定义的命名空间。
import * as $ from './icubismallcator';
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Live2DCubismFramework {
  export const ICubismAllocator = $.ICubismAllocator;
  export type ICubismAllocator = $.ICubismAllocator;
}
