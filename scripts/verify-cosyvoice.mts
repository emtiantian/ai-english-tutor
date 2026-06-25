// Verifies the CosyVoiceProvider against a live server reachable at COSYVOICE_BASE_URL.
// Run: COSYVOICE_BASE_URL=http://localhost:50000 npx tsx <thisfile>
import assert from 'node:assert'

const { CosyVoiceProvider } = await import('../apps/tutor-server/src/voice/providers/cosyvoice.ts')

async function main() {
  const provider = new CosyVoiceProvider()
  const text = 'Good morning! Welcome to your English lesson.'
  const t0 = Date.now()
  const buf: Buffer = await provider.synthesize(text, { voice: '英文女' })
  const ms = Date.now() - t0

  // 1) form-data path succeeded and returned bytes
  assert.ok(buf.length > 1000, `expected non-trivial audio, got ${buf.length} bytes`)

  // 2) result is a valid WAV container
  assert.strictEqual(buf.toString('ascii', 0, 4), 'RIFF', 'missing RIFF magic')
  assert.strictEqual(buf.toString('ascii', 8, 12), 'WAVE', 'missing WAVE magic')
  assert.strictEqual(buf.toString('ascii', 12, 16), 'fmt ', 'missing fmt chunk')

  const audioFormat = buf.readUInt16LE(20) // 1 = PCM
  const channels = buf.readUInt16LE(22)
  const sampleRate = buf.readUInt32LE(24)
  const bitsPerSample = buf.readUInt16LE(34)
  const dataSize = buf.readUInt32LE(40)
  const audioSec = dataSize / (sampleRate * channels * (bitsPerSample / 8))

  assert.strictEqual(audioFormat, 1, 'not PCM')
  assert.strictEqual(channels, 1, 'expected mono')
  assert.strictEqual(bitsPerSample, 16, 'expected 16-bit')
  assert.strictEqual(44 + dataSize, buf.length, 'header dataSize != payload')

  console.log(
    `OK  wav=${buf.length}B  fmt=PCM/${channels}ch/${sampleRate}Hz/${bitsPerSample}bit  ` +
      `audio=${audioSec.toFixed(2)}s  gen=${(ms / 1000).toFixed(2)}s  rtf=${(ms / 1000 / audioSec).toFixed(2)}`,
  )
}

main().catch((err) => {
  console.error('FAIL:', err)
  process.exit(1)
})
