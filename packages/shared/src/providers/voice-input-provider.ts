/**
 * 语音输入 Provider 接口
 *
 * 处理用户的语音输入（麦克风录音等）
 */
export interface VoiceInputProvider {
  /** 开始从麦克风录音 */
  startRecording(): Promise<void>

  /** 停止录音并返回音频数据 */
  stopRecording(): Promise<{ data: string; format: string }>

  /** 是否正在录音 */
  isRecording(): boolean

  /** 清理资源 */
  dispose(): void
}
