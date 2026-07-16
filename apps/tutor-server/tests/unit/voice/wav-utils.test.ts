import { describe, it, expect } from 'vitest'
import { pcmToWav, generateSilentWav, parseWavData } from '@/voice/wav-utils.js'

describe('wav-utils', () => {
  it('builds a valid WAV header', () => {
    const sampleRate = 22050
    const channels = 1
    const bitsPerSample = 16
    const pcm = Buffer.alloc(4000, 0xab)

    const wav = pcmToWav(pcm, sampleRate, channels, bitsPerSample)

    expect(wav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE')
    expect(wav.toString('ascii', 12, 16)).toBe('fmt ')
    expect(wav.readUInt16LE(20)).toBe(1)
    expect(wav.readUInt16LE(22)).toBe(channels)
    expect(wav.readUInt32LE(24)).toBe(sampleRate)
    expect(wav.readUInt16LE(34)).toBe(bitsPerSample)
    expect(wav.toString('ascii', 36, 40)).toBe('data')
    expect(wav.readUInt32LE(40)).toBe(pcm.length)
    expect(wav.length).toBe(44 + pcm.length)
    expect(wav.subarray(44).equals(pcm)).toBe(true)
  })

  it('supports multi-channel and high sample rate', () => {
    const pcm = Buffer.alloc(4000, 0xab)
    const stereoWav = pcmToWav(pcm, 48000, 2, 16)

    expect(stereoWav.readUInt16LE(22)).toBe(2)
    expect(stereoWav.readUInt32LE(24)).toBe(48000)
    expect(stereoWav.readUInt16LE(32)).toBe(4)
  })

  it('generates a silent WAV that parses to all zeros', () => {
    const silentWav = generateSilentWav(16000, 0.2)

    expect(silentWav.toString('ascii', 0, 4)).toBe('RIFF')
    expect(silentWav.toString('ascii', 8, 12)).toBe('WAVE')

    const silentPcm = parseWavData(silentWav)

    expect(silentPcm.length).toBeGreaterThan(0)
    expect(silentPcm.every((byte) => byte === 0)).toBe(true)
  })

  it('locates data chunk after other chunks', () => {
    // fmt chunk（PCM，1 声道，16000Hz，16bit）
    const fmtData = Buffer.alloc(16)
    fmtData.writeUInt16LE(1, 0)
    fmtData.writeUInt16LE(1, 2)
    fmtData.writeUInt32LE(16000, 4)
    fmtData.writeUInt32LE(32000, 8)
    fmtData.writeUInt16LE(2, 12)
    fmtData.writeUInt16LE(16, 14)
    const fmtChunk = Buffer.alloc(8 + fmtData.length)
    fmtChunk.write('fmt ', 0)
    fmtChunk.writeUInt32LE(fmtData.length, 4)
    fmtData.copy(fmtChunk, 8)

    // LIST chunk
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

    const riffSize = 4 + fmtChunk.length + listChunk.length + dataChunk.length
    const riffHeader = Buffer.alloc(12)
    riffHeader.write('RIFF', 0)
    riffHeader.writeUInt32LE(riffSize, 4)
    riffHeader.write('WAVE', 8)

    const wavWithList = Buffer.concat([riffHeader, fmtChunk, listChunk, dataChunk])

    const parsedData = parseWavData(wavWithList)
    expect(parsedData.equals(dataPayload)).toBe(true)
  })

  it('throws when data chunk is missing', () => {
    const fmtData = Buffer.alloc(16)
    fmtData.writeUInt16LE(1, 0)
    fmtData.writeUInt16LE(1, 2)
    fmtData.writeUInt32LE(16000, 4)
    fmtData.writeUInt32LE(32000, 8)
    fmtData.writeUInt16LE(2, 12)
    fmtData.writeUInt16LE(16, 14)
    const fmtChunk = Buffer.alloc(8 + fmtData.length)
    fmtChunk.write('fmt ', 0)
    fmtChunk.writeUInt32LE(fmtData.length, 4)
    fmtData.copy(fmtChunk, 8)

    const riffHeader = Buffer.alloc(12)
    riffHeader.write('RIFF', 0)
    riffHeader.writeUInt32LE(4 + fmtChunk.length, 4)
    riffHeader.write('WAVE', 8)

    const noDataWav = Buffer.concat([riffHeader, fmtChunk])
    expect(() => parseWavData(noDataWav)).toThrow(/未找到 data chunk/)
  })
})
