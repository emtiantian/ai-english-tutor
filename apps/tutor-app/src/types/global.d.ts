/**
 * Live2D Cubism Core 全局类型声明
 * 通过 CDN 加载，运行时注入全局变量
 */
declare namespace Live2DCubismCore {
  function getVersion(): number
  function getLatestSupportedMocVersion(): number
  function getCoreExportFunctionNames(): string[]
  function setAllocator(allocationFunction: any, deallocationFunction: any): void
  function hasMocConsistency(moc: Moc): boolean

  class Moc {
    private constructor()
    static fromArrayBuffer(buffer: ArrayBuffer): Moc
    _ptr: number
    _version: number
  }

  class Model {
    private constructor()
    static fromMoc(moc: Moc): Model
    update(): void
    release(): void
    getCanvasinfo(): CanvasInfo
    getParameterCount(): number
    getPartCount(): number
    getDrawableCount(): number
    getParameterIds(): Int32Array
    getPartIds(): Int32Array
    getDrawableIds(): Int32Array
    getParameterValues(): Float32Array
    getPartOpacities(): Float32Array
    getDrawableRenderOrders(): Int8Array
    getDrawableTextureIndices(): Int8Array
    getDrawableVertexCounts(): Int32Array
    getDrawableVertices(): Float32Array[]
    getDrawableIndices(): Uint16Array[]
    getDrawableCounts(): Int32Array
    getDrawableFlags(): Uint8Array
    getDrawableMasks(): Int32Array[]
    getDrawableMaskCounts(): Int32Array
    getDrawableParentPartIndices(): Int32Array
    getParameterTypes(): Int32Array
    getDrawableMultiplyColors(): Float32Array
    getDrawableScreenColors(): Float32Array
    getDrawableBlendModes(): Int32Array
    getDrawableIsInvertedMaskFlags(): Uint8Array
    _ptr: number
  }

  interface CanvasInfo {
    CanvasWidth: number
    CanvasHeight: number
    CanvasOriginX: number
    CanvasOriginY: number
    PixelsPerUnit: number
  }

  namespace Memory {
    function initializeAmountOfMemory(size?: number): void
  }
}

declare const Live2DCubismCore: typeof Live2DCubismCore

/**
 * 测试文件全局变量
 */
declare var global: typeof globalThis
