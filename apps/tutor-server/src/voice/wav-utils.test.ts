import assert from 'node:assert'
import { pcmToWav, generateSilentWav, parseWavData } from './wav-utils.js'

async function main(): Promise<void> {
  // ── pcmToWav：WAV 头合法性 ──────────────────────────────────

  // 构造一段非零填充的伪 PCM 数据，便于验证 data chunk 内容回填
  const sampleRate = 22050
  const channels = 1
  const bitsPerSample = 16
  const pcm = Buffer.alloc(4000, 0xab)

  const wav = pcmToWav(pcm, sampleRate, channels, bitsPerSample)

  // RIFF / WAVE 标识
  assert.strictEqual(wav.toString('ascii', 0, 4), 'RIFF', 'RIFF 标识正确')
  assert.strictEqual(wav.toString('ascii', 8, 12), 'WAVE', 'WAVE 标识正确')

  // fmt chunk 标识
  assert.strictEqual(wav.toString('ascii', 12, 16), 'fmt ', 'fmt chunk 标识正确')

  // 音频格式 = 1（PCM）
  assert.strictEqual(wav.readUInt16LE(20), 1, '音频格式为 PCM')

  // 声道数字段
  assert.strictEqual(wav.readUInt16LE(22), channels, '声道数正确')

  // 采样率字段
  assert.strictEqual(wav.readUInt32LE(24), sampleRate, '采样率正确')

  // 位深字段
  assert.strictEqual(wav.readUInt16LE(34), bitsPerSample, '位深正确')

  // data chunk 标识
  assert.strictEqual(wav.toString('ascii', 36, 40), 'data', 'data chunk 标识正确')

  // data chunk 长度等于输入 PCM 长度
  assert.strictEqual(wav.readUInt32LE(40), pcm.length, 'data chunk 长度等于输入 PCM 长度')

  // 整体长度 = 44 字节头 + PCM 长度
  assert.strictEqual(wav.length, 44 + pcm.length, 'WAV 总长度正确')

  // 头部之后的字节应与输入 PCM 完全一致
  assert.ok(wav.subarray(44).equals(pcm), 'PCM 数据被原样写入 data chunk')

  // ── pcmToWav：多声道 / 高采样率参数 ─────────────────────────

  const stereoWav = pcmToWav(pcm, 48000, 2, 16)
  assert.strictEqual(stereoWav.readUInt16LE(22), 2, '双声道声道数正确')
  assert.strictEqual(stereoWav.readUInt32LE(24), 48000, '48000 采样率正确')
  // blockAlign = channels * bitsPerSample / 8 = 2 * 16 / 8 = 4
  assert.strictEqual(stereoWav.readUInt16LE(32), 4, '双声道 blockAlign 正确')

  // ── generateSilentWav：可被 parseWavData 解析且数据全 0 ──────

  const silentWav = generateSilentWav(16000, 0.2)

  // RIFF / WAVE 标识合法
  assert.strictEqual(silentWav.toString('ascii', 0, 4), 'RIFF', '静音 WAV RIFF 标识正确')
  assert.strictEqual(silentWav.toString('ascii', 8, 12), 'WAVE', '静音 WAV WAVE 标识正确')

  // 可被 parseWavData 解析
  const silentPcm = parseWavData(silentWav)

  // 静音数据长度 > 0
  assert.ok(silentPcm.length > 0, '静音 WAV 有非零长度的 PCM 数据')

  // 数据全 0
  const allZero = silentPcm.every((byte) => byte === 0)
  assert.ok(allZero, '静音 WAV 的 PCM 数据全为 0')

  // ── parseWavData：data chunk 前有其他 chunk 也能正确定位 ─────

  // 手工构造一个含 LIST chunk 的 WAV：RIFF 头 + fmt chunk + LIST chunk + data chunk
  // 以此验证 parseWavData 能跳过非 data chunk 正确定位

  // fmt chunk（PCM，1 声道，16000Hz，16bit）
  const fmtData = Buffer.alloc(16)
  fmtData.writeUInt16LE(1, 0)   // 音频格式 = PCM
  fmtData.writeUInt16LE(1, 2)   // 单声道
  fmtData.writeUInt32LE(16000, 4) // 采样率
  fmtData.writeUInt32LE(32000, 8) // byte rate
  fmtData.writeUInt16LE(2, 12)  // block align
  fmtData.writeUInt16LE(16, 14) // 位深
  const fmtChunk = Buffer.alloc(8 + fmtData.length)
  fmtChunk.write('fmt ', 0)
  fmtChunk.writeUInt32LE(fmtData.length, 4)
  fmtData.copy(fmtChunk, 8)

  // LIST chunk（非 data chunk，解析器应跳过）
  const listPayload = Buffer.from('INFOpadding-data-to-skip')
  const listChunk = Buffer.alloc(8 + listPayload.length)
  listChunk.write('LIST', 0)
  listChunk.writeUInt32LE(listPayload.length, 4)
  listPayload.copy(listChunk, 8)

  // data chunk
  const dataPayload = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06])
  const dataChunk = Buffer.alloc(8 + dataPayload.length)
  dataChunk.write('data', 0)
  dataChunk.writeUInt32LE(dataPayload.length, 4)
  dataPayload.copy(dataChunk, 8)

  // RIFF 头（12 字节）
  const riffSize = 4 + fmtChunk.length + listChunk.length + dataChunk.length
  const riffHeader = Buffer.alloc(12)
  riffHeader.write('RIFF', 0)
  riffHeader.writeUInt32LE(riffSize, 4)
  riffHeader.write('WAVE', 8)

  const wavWithList = Buffer.concat([riffHeader, fmtChunk, listChunk, dataChunk])

  // parseWavData 应跳过 LIST chunk，正确定位到 data chunk
  const parsedData = parseWavData(wavWithList)
  assert.ok(
    parsedData.equals(dataPayload),
    'data chunk 前有 LIST chunk 时仍能正确定位并返回正确内容',
  )

  // ── parseWavData：无 data chunk 时抛错 ───────────────────────

  // 只含 RIFF 头 + fmt chunk，没有 data chunk
  const noDataWav = Buffer.concat([riffHeader, fmtChunk])
  assert.throws(
    () => parseWavData(noDataWav),
    /未找到 data chunk/,
    '无 data chunk 时应抛错',
  )

  console.log('wav-utils.test.ts 全部通过')
}

main().catch((err) => {
  console.error('wav-utils.test.ts 失败:', err)
  process.exitCode = 1
})
