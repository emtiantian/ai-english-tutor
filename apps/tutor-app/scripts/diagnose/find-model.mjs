import { chromium } from 'playwright-core'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await page.goto('http://127.0.0.1:6173/', { waitUntil: 'load', timeout: 60000 })
await page.waitForTimeout(12000)

await page.screenshot({ path: 'live2d-current.png', fullPage: false })

const result = await page.evaluate(() => {
  const canvas = document.querySelector('.character-canvas')
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')

  // 采样多个点
  const nonZero = []
  const step = 40
  for (let y = 0; y < canvas.height; y += step) {
    for (let x = 0; x < canvas.width; x += step) {
      const p = new Uint8Array(4)
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p)
      if (p[0] + p[1] + p[2] + p[3] > 0) {
        nonZero.push({ x, y, p: Array.from(p) })
      }
    }
  }

  return {
    canvasW: canvas.width,
    canvasH: canvas.height,
    nonZeroCount: nonZero.length,
    bounds:
      nonZero.length > 0
        ? {
            minX: Math.min(...nonZero.map(p => p.x)),
            maxX: Math.max(...nonZero.map(p => p.x)),
            minY: Math.min(...nonZero.map(p => p.y)),
            maxY: Math.max(...nonZero.map(p => p.y))
          }
        : null,
    samples: nonZero.slice(0, 10)
  }
})

console.log('=== Model Position ===')
console.log(JSON.stringify(result, null, 2))

await browser.close()
