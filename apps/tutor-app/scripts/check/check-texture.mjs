import { chromium } from 'playwright-core'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'load', timeout: 30000 })
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

      if (drawCount <= 5) {
        const prog = gl.getParameter(gl.CURRENT_PROGRAM)

        // 获取所有 active uniforms
        const numUniforms = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS)
        const uniforms = []
        for (let i = 0; i < numUniforms; i++) {
          const u = gl.getActiveUniform(prog, i)
          uniforms.push(u.name)
        }

        // 检查当前绑定的 texture
        const activeTex = gl.getParameter(gl.ACTIVE_TEXTURE)
        gl.activeTexture(gl.TEXTURE0)
        const tex0 = gl.getParameter(gl.TEXTURE_BINDING_2D)
        gl.activeTexture(gl.TEXTURE1)
        const tex1 = gl.getParameter(gl.TEXTURE_BINDING_2D)
        gl.activeTexture(activeTex)

        // 检查 framebuffer
        const fbo = gl.getParameter(gl.FRAMEBUFFER_BINDING)

        // 检查 viewport
        const vp = gl.getParameter(gl.VIEWPORT)

        info.push({
          drawCount,
          count,
          uniforms,
          tex0: !!tex0,
          tex1: !!tex1,
          fbo: fbo ? 'offscreen' : 'default',
          viewport: Array.from(vp)
        })
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

console.log('=== Draw State Info ===')
console.log(JSON.stringify(result, null, 2))

await browser.close()
