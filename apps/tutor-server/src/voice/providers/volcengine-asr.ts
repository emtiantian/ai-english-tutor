import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { gzipSync, gunzipSync } from 'node:zlib'
import { config } from '../../config.js'
import { logger } from '../../logger.js'
import type { ASRProvider, ASRResult } from '../asr.js'
import { parseWavData } from '../wav-utils.js'
import WebSocket from 'ws'

/**
 * Volcengine Ark Agent Plan 语音识别 ASR Provider
 *
 * 使用 WebSocket 单流接口：
 *   wss://openspeech.bytedance.com/api/v3/plan/sauc/bigmodel_nostream
 *
 * 鉴权：
 *   X-Api-Key: {专属 API Key}
 *   X-Api-Resource-Id: volc.seedasr.sauc.duration
 *
 * 传输协议：自定义二进制帧（header + sequence + payload_size + gzip payload）。
 * 音频要求：WAV 格式、codec=raw、16kHz、16bit、单声道。
 * 如果传入音频不是该格式，会尝试用系统 ffmpeg 转码；无 ffmpeg 时抛错。
 */
export class VolcengineASRProvider implements ASRProvider {
  readonly name = 'volcengine'
  private baseUrl: string
  private apiKey: string
  private resourceId: string
  private segmentMs: number

  constructor() {
    if (!config.VOLCENGINE_ASR_API_KEY) {
      throw new Error('使用火山方舟 ASR 必须配置 VOLCENGINE_ASR_API_KEY')
    }
    this.baseUrl = config.VOLCENGINE_ASR_BASE_URL
    this.apiKey = config.VOLCENGINE_ASR_API_KEY
    this.resourceId = config.VOLCENGINE_ASR_RESOURCE_ID
    this.segmentMs = config.VOLCENGINE_ASR_SEGMENT_MS
    logger.info(
      { baseUrl: this.baseUrl, resourceId: this.resourceId, segmentMs: this.segmentMs },
      '火山方舟 ASR 提供商初始化完成',
    )
  }

  async transcribe(audioBuffer: Buffer, mimeType?: string): Promise<ASRResult> {
    const startTime = Date.now()
    logger.info(
      { provider: this.name, size: audioBuffer.length, mimeType },
      '[火山 ASR] 转写请求',
    )

    // 确保音频为 WAV 16kHz 16bit mono raw
    const wavBuffer = await ensureWav16kMono(audioBuffer, mimeType)
    const rawAudio = parseWavData(wavBuffer)

    const connectId = randomUUID()
    const requestId = randomUUID()

    const ws = new WebSocket(this.baseUrl, {
      headers: {
        'X-Api-Key': this.apiKey,
        'X-Api-Resource-Id': this.resourceId,
        'X-Api-Request-Id': requestId,
        'X-Api-Connect-Id': connectId,
        'X-Api-Sequence': '-1',
      },
    })

    return new Promise((resolve, reject) => {
      let fullText = ''
      let errorMessage = ''
      let connected = false
      let fullRequestAck = false
      // settle 守卫：保证 resolve/reject 只触发一次，避免超时/异常路径与正常 close 事件重复 settle
      let settled = false

      const settleResolve = (result: ASRResult): void => {
        if (settled) return
        settled = true
        resolve(result)
      }

      const settleReject = (err: Error): void => {
        if (settled) return
        settled = true
        reject(err)
      }

      ws.on('open', () => {
        connected = true
        logger.debug({ url: this.baseUrl }, '[火山 ASR] WebSocket 已连接')

        // 发送全量客户端请求（配置帧）
        const fullRequest = buildFullClientRequest({
          user: { uid: 'ai-english-tutor' },
          audio: { format: 'wav', codec: 'raw', rate: 16000, bits: 16, channel: 1 },
          request: {
            model_name: 'bigmodel',
            enable_itn: true,
            enable_punc: true,
            enable_ddc: true,
            show_utterances: true,
            enable_nonstream: false,
          },
        })
        ws.send(fullRequest)

        // 异步发送音频分段，避免阻塞接收
        sendAudioSegments(ws, rawAudio, this.segmentMs).catch((err) => {
          logger.error({ err }, '[火山 ASR] 发送音频分段失败')
          // reject 前先关闭连接，避免 close 事件再次触发 settle
          if (ws.readyState === WebSocket.OPEN) {
            ws.close()
          }
          settleReject(err)
        })
      })

      ws.on('message', (data: Buffer) => {
        // 已结束（超时/异常）则忽略后续消息
        if (settled) return
        try {
          const response = parseResponse(data)
          logger.debug({ response: response.toLog() }, '[火山 ASR] 收到消息')

          if (response.code !== 0) {
            errorMessage = `ASR 服务器错误：code=${response.code}`
            if (response.payloadMsg) {
              errorMessage += ` message=${JSON.stringify(response.payloadMsg)}`
            }
            ws.close()
            return
          }

          if (!fullRequestAck) {
            fullRequestAck = true
            return
          }

          if (response.isLastPackage) {
            ws.close()
            return
          }

          const msg = response.payloadMsg
          const text = extractText(msg)
          if (text) {
            fullText = text
            logger.debug({ text: text.slice(0, 100) }, '[火山 ASR] 中间结果')
          }
        } catch (err) {
          logger.error({ err }, '[火山 ASR] 解析响应失败')
        }
      })

      ws.on('error', (err) => {
        logger.error({ err: err.message }, '[火山 ASR] WebSocket 错误')
        settleReject(new Error(`火山 ASR WebSocket 错误：${err.message}`))
      })

      ws.on('close', () => {
        // 超时/发送失败/异常已先行 settle，这里直接返回不再处理
        if (settled) return
        const duration = Date.now() - startTime
        if (errorMessage) {
          settleReject(new Error(errorMessage))
          return
        }
        logger.info(
          { provider: this.name, duration, text: fullText.slice(0, 100), textLength: fullText.length },
          '[火山 ASR] 转写完成',
        )
        settleResolve({
          text: fullText,
          language: config.ASR_LANGUAGE === 'auto' ? undefined : config.ASR_LANGUAGE,
        })
      })

      // 兜底超时：超时后 reject 明确错误，不再静默返回截断文本
      setTimeout(() => {
        if (settled) return
        logger.warn('[火山 ASR] 转写超时，关闭连接')
        settleReject(new Error('火山 ASR 转写超时（60s）'))
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close()
        }
      }, 60000)
    })
  }
}

// ── 二进制帧构造 ──

const ProtocolVersion = {
  V1: 0b0001,
}

const MessageType = {
  CLIENT_FULL_REQUEST: 0b0001,
  CLIENT_AUDIO_ONLY_REQUEST: 0b0010,
  SERVER_FULL_RESPONSE: 0b1001,
  SERVER_ERROR_RESPONSE: 0b1111,
}

const MessageTypeSpecificFlags = {
  NO_SEQUENCE: 0b0000,
  POS_SEQUENCE: 0b0001,
  NEG_SEQUENCE: 0b0010,
  NEG_WITH_SEQUENCE: 0b0011,
}

const SerializationType = {
  NO_SERIALIZATION: 0b0000,
  JSON: 0b0001,
}

const CompressionType = {
  NO_COMPRESSION: 0b0000,
  GZIP: 0b0001,
}

function buildHeader(
  messageType: number,
  specificFlags: number,
  serialization = SerializationType.JSON,
  compression = CompressionType.GZIP,
): Buffer {
  const header = Buffer.alloc(4)
  header[0] = (ProtocolVersion.V1 << 4) | 1 // header 大小 = 1
  header[1] = (messageType << 4) | specificFlags
  header[2] = (serialization << 4) | compression
  header[3] = 0x00 // 保留
  return header
}

function buildFullClientRequest(payload: unknown): Buffer {
  const payloadBytes = Buffer.from(JSON.stringify(payload), 'utf-8')
  const compressed = gzipCompress(payloadBytes)
  const header = buildHeader(
    MessageType.CLIENT_FULL_REQUEST,
    MessageTypeSpecificFlags.POS_SEQUENCE,
  )
  const seq = Buffer.alloc(4)
  seq.writeInt32BE(1)
  const size = Buffer.alloc(4)
  size.writeUInt32BE(compressed.length)
  return Buffer.concat([header, seq, size, compressed])
}

function buildAudioOnlyRequest(seq: number, audio: Buffer, isLast: boolean): Buffer {
  const specificFlags = isLast
    ? MessageTypeSpecificFlags.NEG_WITH_SEQUENCE
    : MessageTypeSpecificFlags.POS_SEQUENCE
  const header = buildHeader(MessageType.CLIENT_AUDIO_ONLY_REQUEST, specificFlags)

  const compressed = gzipCompress(audio)
  const seqBuf = Buffer.alloc(4)
  seqBuf.writeInt32BE(isLast ? -seq : seq)
  const size = Buffer.alloc(4)
  size.writeUInt32BE(compressed.length)
  return Buffer.concat([header, seqBuf, size, compressed])
}

async function sendAudioSegments(
  ws: WebSocket,
  rawAudio: Buffer,
  segmentMs: number,
): Promise<void> {
  const bytesPerSecond = 16000 * 1 * 2 // 16kHz、单声道、16bit
  const segmentSize = Math.floor((bytesPerSecond * segmentMs) / 1000)
  let seq = 2 // 1 已被 full client request 占用
  const total = rawAudio.length
  let offset = 0

  while (offset < total) {
    const end = Math.min(offset + segmentSize, total)
    const chunk = rawAudio.subarray(offset, end)
    const isLast = end === total
    const frame = buildAudioOnlyRequest(seq, chunk, isLast)
    ws.send(frame)
    seq++
    offset = end
    if (!isLast) {
      await sleep(segmentMs)
    }
  }
}

// ── 二进制帧解析 ──

class AsrResponse {
  code = 0
  event = 0
  isLastPackage = false
  payloadSequence = 0
  payloadSize = 0
  payloadMsg: unknown = null

  toLog() {
    return {
      code: this.code,
      event: this.event,
      isLastPackage: this.isLastPackage,
      payloadSequence: this.payloadSequence,
      payloadSize: this.payloadSize,
      payloadMsg: this.payloadMsg,
    }
  }
}

function parseResponse(msg: Buffer): AsrResponse {
  const response = new AsrResponse()

  const headerSize = msg[0] & 0x0f
  const messageType = msg[1] >> 4
  const specificFlags = msg[1] & 0x0f
  const serializationMethod = msg[2] >> 4
  const compression = msg[2] & 0x0f

  let payload = msg.subarray(headerSize * 4)

  if (specificFlags & 0x01) {
    response.payloadSequence = payload.readInt32BE(0)
    payload = payload.subarray(4)
  }
  if (specificFlags & 0x02) {
    response.isLastPackage = true
  }
  if (specificFlags & 0x04) {
    response.event = payload.readInt32BE(0)
    payload = payload.subarray(4)
  }

  if (messageType === MessageType.SERVER_FULL_RESPONSE) {
    response.payloadSize = payload.readUInt32BE(0)
    payload = payload.subarray(4)
  } else if (messageType === MessageType.SERVER_ERROR_RESPONSE) {
    response.code = payload.readInt32BE(0)
    response.payloadSize = payload.readUInt32BE(4)
    payload = payload.subarray(8)
  }

  if (payload.length === 0) {
    return response
  }

  if (compression === CompressionType.GZIP) {
    payload = gzipDecompress(payload)
  }

  if (serializationMethod === SerializationType.JSON) {
    try {
      response.payloadMsg = JSON.parse(payload.toString('utf-8'))
    } catch {
      response.payloadMsg = null
    }
  }

  return response
}

function extractText(msg: unknown): string | undefined {
  if (!msg || typeof msg !== 'object') return undefined
  const m = msg as Record<string, unknown>
  const result = m.result
  if (result && typeof result === 'object') {
    const r = result as Record<string, unknown>
    if (typeof r.text === 'string') return r.text
    if (Array.isArray(r.utterances)) {
      return r.utterances
        .map((u) => (typeof u === 'object' && u ? (u as Record<string, unknown>).text : ''))
        .filter(Boolean)
        .join(' ')
    }
  }
  if (typeof m.text === 'string') return m.text
  return undefined
}

// ── 音频格式处理 ──

async function ensureWav16kMono(audioBuffer: Buffer, mimeType?: string): Promise<Buffer> {
  const isWav = isValidWav(audioBuffer)
  if (isWav) {
    // 简单校验格式；即使已经是 WAV，也统一用 ffmpeg 重采样为 16kHz mono，
    // 避免采样率/声道/位深不一致导致识别失败。
    return convertWithFfmpeg(audioBuffer, 'wav')
  }

  logger.info(
    { mimeType: mimeType ?? 'unknown' },
    '[火山 ASR] 输入不是 WAV，使用 ffmpeg 转换',
  )
  return convertWithFfmpeg(audioBuffer, mimeType?.split('/').pop() ?? 'mp3')
}

function isValidWav(data: Buffer): boolean {
  return data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WAVE'
}

function convertWithFfmpeg(inputBuffer: Buffer, inputFormat: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-f', inputFormat,
      '-i', 'pipe:0',
      '-acodec', 'pcm_s16le',
      '-ac', '1',
      '-ar', '16000',
      '-f', 'wav',
      'pipe:1',
    ])

    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []

    ffmpeg.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    ffmpeg.stderr.on('data', (chunk: Buffer) => errChunks.push(chunk))

    ffmpeg.on('error', (err) => {
      reject(new Error(`ffmpeg 不可用：${err.message}。使用火山 ASR 请先安装 ffmpeg。`))
    })

    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        const err = Buffer.concat(errChunks).toString('utf-8')
        reject(new Error(`ffmpeg 转换失败（code=${code}）：${err || '未知错误'}`))
        return
      }
      resolve(Buffer.concat(chunks))
    })

    ffmpeg.stdin.write(inputBuffer)
    ffmpeg.stdin.end()
  })
}

// ── 工具函数 ──

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function gzipCompress(data: Buffer): Buffer {
  return gzipSync(data)
}

function gzipDecompress(data: Buffer): Buffer {
  return gunzipSync(data)
}
