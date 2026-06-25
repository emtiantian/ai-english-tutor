interface AudioEncoderWorkerCtx {
  onmessage: ((this: AudioEncoderWorkerCtx, ev: MessageEvent) => any) | null
  postMessage(message: any, transfer?: Transferable[]): void
}

declare const self: AudioEncoderWorkerCtx & typeof globalThis
