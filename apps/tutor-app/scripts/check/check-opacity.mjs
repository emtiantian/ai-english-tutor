import { chromium } from 'playwright-core'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(10000)

const result = await page.evaluate(() => {
  // 通过 monkey-patching window 来暴露内部对象进行检查
  return new Promise(resolve => {
    setTimeout(() => {
      // 检查 Live2D Core 中的模型状态
      const core = window.Live2DCubismCore

      // 检查 canvas
      const canvas = document.querySelector('.character-canvas')
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')

      // 收集所有 draw call 的 opacity 和 baseColor
      let drawCount = 0
      const info = []

      const origDraw = gl.drawElements
      gl.drawElements = function (mode, count, type, offset) {
        drawCount++
        if (drawCount <= 5) {
          const prog = gl.getParameter(gl.CURRENT_PROGRAM)
          const baseLoc = gl.getUniformLocation(prog, 'u_baseColor')
          let baseColor = null
          if (baseLoc) {
            const b = gl.getUniform(prog, baseLoc)
            baseColor = b ? Array.from(b) : null
          }

          const texLoc = gl.getUniformLocation(prog, 's_texture0')
          let hasTexture = false
          if (texLoc) {
            const activeTex = gl.getParameter(gl.ACTIVE_TEXTURE)
            gl.activeTexture(gl.TEXTURE0)
            const tex = gl.getParameter(gl.TEXTURE_BINDING_2D)
            hasTexture = !!tex
            gl.activeTexture(activeTex)
          }

          info.push({ drawCount, count, baseColor, hasTexture })
        }
        return origDraw.apply(this, arguments)
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve({ drawCount, info })
        })
      })
    }, 100)
  })
})

console.log('=== Opacity/Color Info ===')
console.log(JSON.stringify(result, null, 2))

await browser.close()
