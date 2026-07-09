import { config } from '../../config.js'
import { logger } from '../../logger.js'
import type { TTSProvider, TTSSynthesizeOptions } from '../tts.js'
import { getOrSynthesizeCachedAudio } from '../tts-cache.js'

/** CosyVoice 可用的内置音色 */
export const COSYVOICE_VOICES = [
  '英文女', // 英文女声（教学默认）
  '英文男', // 英文男声
  '中文女', // 中文女声
  '中文男', // 中文男声
] as const

export type CosyVoiceId = (typeof COSYVOICE_VOICES)[number]

/**
 * 基于学生等级的教学音色选择策略
 */
export function selectTeachingVoice(level?: number): CosyVoiceId {
  if (!level || level <= 2) return '英文女' // 初学者使用温柔女声
  if (level <= 4) return '英文男' // 中级使用清晰男声
  return '英文女' // 高级使用专业女声
}

/**
 * 将原始单声道 16 位小端 PCM 打包成最小 WAV（RIFF）容器。
 *
 * CosyVoice fastapi 的 `server.py` 流式输出的是*无头* int16 PCM
 *（`(tts_speech.numpy() * 2**15).astype(np.int16).tobytes()`），这些字节
 * 无法直接被浏览器 / `decodeAudioData` 播放。在前面加上 44 字节的 WAV
 * 头后，输出就是自描述、通用可解码的音频 buffer。
 */
function pcmToWav(pcm: Buffer, sampleRate: number, channels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8
  const dataSize = pcm.length
  const header = Buffer.alloc(44)
  let offset = 0

  header.write('RIFF', offset); offset += 4
  header.writeUInt32LE(36 + dataSize, offset); offset += 4
  header.write('WAVE', offset); offset += 4

  header.write('fmt ', offset); offset += 4
  header.writeUInt32LE(16, offset); offset += 4 // PCM fmt chunk 大小
  header.writeUInt16LE(1, offset); offset += 2 // 音频格式 = PCM
  header.writeUInt16LE(channels, offset); offset += 2
  header.writeUInt32LE(sampleRate, offset); offset += 4
  header.writeUInt32LE(byteRate, offset); offset += 4
  header.writeUInt16LE(blockAlign, offset); offset += 2
  header.writeUInt16LE(bitsPerSample, offset); offset += 2

  header.write('data', offset); offset += 4
  header.writeUInt32LE(dataSize, offset)

  return Buffer.concat([header, pcm])
}

/**
 * CosyVoice TTS 服务商
 *
 * 连接本地或远程部署的 CosyVoice fastapi 服务
 *（`runtime/python/fastapi/server.py`）。配合 SFT 模型
 *（CosyVoice-300M-SFT）使用，其内置发音人（英文女 / 英文男 / ...）驱动
 * `/inference_sft` 接口。
 *
 * IMPORTANT — 服务端约定（`server.py`）：
 * - 接口接受 **multipart/form-data** 字段，而不是 JSON body。
 *   `/inference_sft`      → tts_text, spk_id
 *   `/inference_instruct` → tts_text, spk_id, instruct_text
 * - 响应是原始 int16 单声道 PCM 流（无容器），因此我们在本地将其包装为
 *   WAV。PCM 采样率取决于模型（config.COSYVOICE_SAMPLE_RATE；
 *   300M-SFT = 22050，CosyVoice2-0.5B = 24000）。
 * - 当前 server.py 版本没有 `speed` 参数；我们仍把它作为 form 字段发送，
 *   以便支持该参数的新版本服务端能够生效（FastAPI 会静默忽略未知 form 字段）。
 *
 * Docker 部署（SFT 模型）：
 *   docker run -d --name cosyvoice --gpus all -p 50000:50000 \
 *     -v ~/.cache/modelscope:/root/.cache/modelscope \
 *     -w /workspace/CosyVoice/runtime/python/fastapi \
 *     --entrypoint /opt/conda/envs/cosyvoice/bin/python \
 *     cosyvoice:local server.py --port 50000 --model_dir iic/CosyVoice-300M-SFT
 */
export class CosyVoiceProvider implements TTSProvider {
  readonly name = 'cosyvoice'
  private baseUrl: string

  constructor() {
    this.baseUrl = config.COSYVOICE_BASE_URL
    logger.info({ baseUrl: this.baseUrl }, 'CosyVoice 提供商初始化完成')
  }

  async synthesize(text: string, options?: TTSSynthesizeOptions): Promise<Buffer> {
    return getOrSynthesizeCachedAudio(text, options?.voiceDesign, async () => {
      const voice = options?.voice ?? config.COSYVOICE_SPK_ID
      const speed = options?.speed ?? config.COSYVOICE_SPEED

      logger.debug(
        { provider: this.name, voice, speed, textLength: text.length },
        'CosyVoice 合成请求',
      )

      const startTime = Date.now()

      const form = new FormData()
      form.append('tts_text', text)
      form.append('spk_id', voice)
      form.append('speed', String(speed))

      const response = await fetch(`${this.baseUrl}/inference_sft`, {
        method: 'POST',
        body: form,
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'unknown error')
        throw new Error(`CosyVoice TTS 错误：${response.status} - ${errorText}`)
      }

      const arrayBuffer = await response.arrayBuffer()
      const buffer = pcmToWav(Buffer.from(arrayBuffer), config.COSYVOICE_SAMPLE_RATE)
      const duration = Date.now() - startTime

      logger.info(
        { provider: this.name, duration, size: buffer.length },
        'CosyVoice 合成完成',
      )

      return buffer
    })
  }

  async *synthesizeStream(
    text: string,
    options?: TTSSynthesizeOptions,
  ): AsyncGenerator<Buffer> {
    // 服务端流式输出无头 PCM；单个分块无法独立解码，
    // 因此我们将整个响应缓存后，一次性加上 WAV 头，
    // 再产出一段可播放的 buffer。
    yield await this.synthesize(text, options)
  }

  /**
   * 使用情感指令合成（CosyVoice 特有）
   *
   * @param text - 要合成的文本
   * @param instruct - 自然语言情感指令，例如：
   *   "用温暖鼓励的语气说" (warm and encouraging)
   *   "用耐心但认真的语气说" (patient but serious)
   *   "用清晰缓慢的语气说" (clear and slow)
   */
  async synthesizeWithEmotion(
    text: string,
    instruct: string,
    options?: TTSSynthesizeOptions,
  ): Promise<Buffer> {
    const voice = options?.voice ?? config.COSYVOICE_SPK_ID
    const speed = options?.speed ?? config.COSYVOICE_SPEED

    logger.debug(
      { provider: this.name, voice, speed, instruct, textLength: text.length },
      'CosyVoice 情感合成',
    )

    const startTime = Date.now()

    const form = new FormData()
    form.append('tts_text', text)
    form.append('spk_id', voice)
    form.append('instruct_text', instruct)
    form.append('speed', String(speed))

    const response = await fetch(`${this.baseUrl}/inference_instruct`, {
      method: 'POST',
      body: form,
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error')
      throw new Error(`CosyVoice 指令合成错误：${response.status} - ${errorText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = pcmToWav(Buffer.from(arrayBuffer), config.COSYVOICE_SAMPLE_RATE)
    const duration = Date.now() - startTime

    logger.info(
      { provider: this.name, duration, size: buffer.length, instruct },
      'CosyVoice 指令合成完成',
    )

    return buffer
  }
}
