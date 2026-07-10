import assert from 'node:assert'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'

// 在导入 tts-cache（间接导入 config）之前设置临时缓存目录，
// 避免污染真实缓存目录。config.ts 读取 process.env.TTS_CACHE_DIR，
// dotenv 默认不覆盖已存在的 env 变量，所以这里先设即可生效。
process.env.TTS_CACHE_DIR = join(tmpdir(), `tts-cache-test-${randomUUID()}`)

async function main(): Promise<void> {
  const { buildCacheKey } = await import('./tts-cache.js')

  const text = 'Hello, how are you today?'

  // ── 基线 key ────────────────────────────────────────────────

  const baseKey = buildCacheKey(text, {})
  assert.ok(typeof baseKey === 'string', '返回字符串')
  assert.strictEqual(baseKey.length, 64, 'SHA256 hex 长度为 64 字符')

  // ── 同 text 不同 voice -> 不同 key ───────────────────────────

  const keyVoiceA = buildCacheKey(text, { voice: 'alloy' })
  const keyVoiceB = buildCacheKey(text, { voice: 'nova' })
  assert.notStrictEqual(keyVoiceA, keyVoiceB, '不同 voice 产出不同 key')
  assert.notStrictEqual(keyVoiceA, baseKey, '有 voice 与无 voice 产出不同 key')

  // ── 同 text 不同 format -> 不同 key ──────────────────────────

  const keyFormatA = buildCacheKey(text, { format: 'mp3' })
  const keyFormatB = buildCacheKey(text, { format: 'wav' })
  assert.notStrictEqual(keyFormatA, keyFormatB, '不同 format 产出不同 key')
  assert.notStrictEqual(keyFormatA, baseKey, '有 format 与无 format 产出不同 key')

  // ── 同 text 不同 speed -> 不同 key ───────────────────────────

  const keySpeedA = buildCacheKey(text, { speed: 1.0 })
  const keySpeedB = buildCacheKey(text, { speed: 0.9 })
  assert.notStrictEqual(keySpeedA, keySpeedB, '不同 speed 产出不同 key')
  assert.notStrictEqual(keySpeedA, baseKey, '有 speed 与无 speed 产出不同 key')

  // ── 同 text 不同 voiceDesign -> 不同 key ─────────────────────

  const keyDesignA = buildCacheKey(text, { voiceDesign: '温柔女声' })
  const keyDesignB = buildCacheKey(text, { voiceDesign: '磁性男声' })
  assert.notStrictEqual(keyDesignA, keyDesignB, '不同 voiceDesign 产出不同 key')
  assert.notStrictEqual(keyDesignA, baseKey, '有 voiceDesign 与无 voiceDesign 产出不同 key')

  // ── 同 text 不同 mode -> 不同 key ────────────────────────────

  const keyModeA = buildCacheKey(text, { mode: 'preset' })
  const keyModeB = buildCacheKey(text, { mode: 'voicedesign' })
  assert.notStrictEqual(keyModeA, keyModeB, '不同 mode 产出不同 key')
  assert.notStrictEqual(keyModeA, baseKey, '有 mode 与无 mode 产出不同 key')

  // ── 同维度相同 -> 相同 key ───────────────────────────────────

  const fullOpts = {
    voice: 'Chloe',
    format: 'wav',
    speed: 0.9,
    voiceDesign: '成熟御姐',
    mode: 'preset',
  }
  const key1 = buildCacheKey(text, fullOpts)
  const key2 = buildCacheKey(text, { ...fullOpts })
  assert.strictEqual(key1, key2, '同维度相同产出相同 key')

  // 不同 text -> 不同 key
  const keyTextB = buildCacheKey('Good morning!', fullOpts)
  assert.notStrictEqual(key1, keyTextB, '不同 text 产出不同 key')

  // ── 空字符串与 undefined 在同一维度上等价 ────────────────────

  // voice 为 '' 时走 `'' ?? ''` = ''，与不传（undefined -> ''）结果一致
  const keyEmptyVoice = buildCacheKey(text, { voice: '' })
  assert.strictEqual(keyEmptyVoice, baseKey, '空字符串 voice 与不传 voice 等价')

  // format 为 '' 同理
  const keyEmptyFormat = buildCacheKey(text, { format: '' })
  assert.strictEqual(keyEmptyFormat, baseKey, '空字符串 format 与不传 format 等价')

  // ── speed 边界：0 是有效值，与不传不同 ───────────────────────

  const keySpeedZero = buildCacheKey(text, { speed: 0 })
  assert.notStrictEqual(keySpeedZero, baseKey, 'speed=0 与不传 speed 不同（0 是有效值）')

  console.log('tts-cache.test.ts 全部通过')
}

main().catch((err) => {
  console.error('tts-cache.test.ts 失败:', err)
  process.exitCode = 1
})
