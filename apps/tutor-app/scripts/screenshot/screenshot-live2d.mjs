import { chromium } from 'playwright-core'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
const errors = []
const logs = []
page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}`))
page.on('console', msg => {
  const t = msg.type()
  logs.push(`[${t}] ${msg.text()}`)
  if (t === 'error' || t === 'warn') errors.push(`CONSOLE ${t.toUpperCase()}: ${msg.text()}`)
})

await page.goto('http://127.0.0.1:6173/', { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(12000)

await page.screenshot({ path: 'live2d-screenshot-1.png', fullPage: false })

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
console.log('=== Live2D Logs ===')
logs
  .filter(l => l.includes('Live2D') || l.includes('Cubism') || l.includes('Shader'))
  .forEach(l => console.log(l))
console.log('=== Errors/Warnings ===')
if (errors.length === 0) console.log('(none)')
else errors.slice(0, 10).forEach(e => console.log(e))

await browser.close()
