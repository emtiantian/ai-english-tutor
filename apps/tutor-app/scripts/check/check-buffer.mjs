import { chromium } from 'playwright-core'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(10000)

const result = await page.evaluate(() => {
  return new Promise(resolve => {
    const canvas = document.querySelector('.character-canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')

    let drawCount = 0
    const info = []

    const origDraw = gl.drawElements
    gl.drawElements = function (mode, count, type, offset) {
      drawCount++

      if (drawCount <= 3) {
        const prog = gl.getParameter(gl.CURRENT_PROGRAM)
        const posLoc = gl.getAttribLocation(prog, 'a_position')

        if (posLoc >= 0) {
          const vbo = gl.getParameter(gl.ARRAY_BUFFER_BINDING)
          const size = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)
          const data = new Float32Array(size / 4)
          gl.getBufferSubData(gl.ARRAY_BUFFER, 0, data)

          // Check stride by looking at values
          info.push({
            drawCount,
            count,
            bufferSize: size,
            dataLength: data.length,
            first6: Array.from(data.slice(0, 6)),
            posLoc
          })
        }
      }

      return origDraw.apply(this, arguments)
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve({ drawCount, info })
      })
    })
  })
})

console.log('=== Buffer Info ===')
console.log(JSON.stringify(result, null, 2))

await browser.close()
