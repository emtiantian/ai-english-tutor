import lamejs from 'lamejs'

const TARGET_SAMPLE_RATE = 16000
const MP3_KBPS = 64
const LAME_BLOCK_SIZE = 1152

interface EncodeRequest {
  id: string
  samples: Float32Array
  sampleRate: number
}

interface EncodeSuccess {
  id: string
  mp3Chunks: Uint8Array[]
}

interface EncodeFailure {
  id: string
  error: string
}

function resampleLinear(src: Float32Array, srcRate: number, dstRate: number): Float32Array {
  if (srcRate === dstRate) return src

  const ratio = srcRate / dstRate
  const dstLength = Math.floor(src.length / ratio)
  if (dstLength === 0) return new Float32Array(0)

  const dst = new Float32Array(dstLength)
  for (let i = 0; i < dstLength; i++) {
    const srcPos = i * ratio
    const idx = Math.floor(srcPos)
    const frac = srcPos - idx
    const a = src[idx] ?? 0
    const b = src[idx + 1] ?? a
    dst[i] = a + (b - a) * frac
  }
  return dst
}

function floatToInt16(samples: Float32Array): Int16Array {
  const int16 = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    int16[i] = Math.max(-32768, Math.min(32767, samples[i] * 32768))
  }
  return int16
}

function encodeMp3(samples: Float32Array, sampleRate: number): Uint8Array[] {
  const resampled = resampleLinear(samples, sampleRate, TARGET_SAMPLE_RATE)
  const int16 = floatToInt16(resampled)
  const encoder = new lamejs.Mp3Encoder(1, TARGET_SAMPLE_RATE, MP3_KBPS)
  const chunks: Uint8Array[] = []

  for (let i = 0; i < int16.length; i += LAME_BLOCK_SIZE) {
    const block = int16.subarray(i, i + LAME_BLOCK_SIZE)
    const encoded = encoder.encodeBuffer(block)
    if (encoded.length > 0) {
      chunks.push(new Uint8Array(encoded))
    }
  }

  const final = encoder.flush()
  if (final.length > 0) {
    chunks.push(new Uint8Array(final))
  }

  return chunks
}

self.onmessage = (event: MessageEvent<EncodeRequest>) => {
  const { id, samples, sampleRate } = event.data

  try {
    const mp3Chunks = encodeMp3(samples, sampleRate)
    const transferables = mp3Chunks.map((chunk) => chunk.buffer)
    ;(self as any).postMessage({ id, mp3Chunks } satisfies EncodeSuccess, transferables)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    ;(self as any).postMessage({ id, error: message } satisfies EncodeFailure)
  }
}

export {}
