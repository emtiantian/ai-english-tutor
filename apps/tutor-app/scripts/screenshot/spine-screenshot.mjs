import { chromium } from 'playwright-core'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const errors = []
const logs = []
page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`))
page.on('console', msg => {
  const t = msg.type()
  const text = msg.text()
  logs.push(`[${t}] ${text}`)
  if (t === 'error' || t === 'warn') errors.push(`CONSOLE ${t.toUpperCase()}: ${text}`)
})
await page.goto('http://127.0.0.1:6173/', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(5000)
await page.screenshot({
  path: '/Users/haohe/Documents/code/codex/ai-english-tutor/apps/tutor-app/spine-screenshot-1.png',
  fullPage: false
})
const canvasData = await page.evaluate(() => {
  const canvas = document.querySelector('.character-canvas')
  if (!canvas) return { exists: false }
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
  if (!gl) return { exists: true, hasContext: false }
  const pixels = new Uint8Array(4)
  gl.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  return {
    exists: true,
    hasContext: true,
    width: canvas.width,
    height: canvas.height,
    visible: getComputedStyle(canvas).opacity,
    pixelCenter: Array.from(pixels),
    isBlack: pixels[0] === 0 && pixels[1] === 0 && pixels[2] === 0 && pixels[3] === 0
  }
})
console.log('=== Canvas Info ===')
console.log(JSON.stringify(canvasData, null, 2))
console.log('=== Spine/Live2D Logs ===')
logs
  .filter(l => l.includes('Spine') || l.includes('Live2D') || l.includes('Character'))
  .forEach(l => console.log(l))
console.log('=== Errors/Warnings ===')
if (errors.length === 0) console.log('(none)')
else errors.forEach(e => console.log(e))
await browser.close()
