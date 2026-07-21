import { chromium } from 'playwright-core'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

page.on('console', msg => {
  if (msg.type() === 'log') console.log('[LOG]', msg.text())
  if (msg.type() === 'error') console.log('[ERROR]', msg.text())
  if (msg.type() === 'warn') console.log('[WARN]', msg.text())
})

await page.goto('http://127.0.0.1:5174/', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(8000)

// 注入诊断代码，通过修改 LAppModel.prototype.update 来暴露内部状态
const result = await page.evaluate(() => {
  return new Promise(resolve => {
    // 等待 live2d 初始化完成
    setTimeout(() => {
      // 通过全局暴露的方式获取内部状态
      // 我们需要找到 Live2DCharacterProvider 实例

      // 检查 window 上是否有暴露的变量
      const keys = Object.keys(window).filter(
        k =>
          k.toLowerCase().includes('live2d') ||
          k.toLowerCase().includes('cubism') ||
          k.toLowerCase().includes('model')
      )

      resolve({
        windowKeys: keys.slice(0, 20),
        live2dCoreVersion: window.Live2DCubismCore
          ? window.Live2DCubismCore.Version
            ? 'has Version'
            : 'no Version'
          : 'no Live2DCubismCore',
        mocMethods:
          window.Live2DCubismCore && window.Live2DCubismCore.Moc
            ? Object.keys(window.Live2DCubismCore.Moc)
            : [],
        versionMethods:
          window.Live2DCubismCore && window.Live2DCubismCore.Version
            ? Object.keys(window.Live2DCubismCore.Version)
            : []
      })
    }, 500)
  })
})

console.log('=== Model Diagnosis ===')
console.log(JSON.stringify(result, null, 2))

// 现在注入代码到 drawMeshWebGL 来获取实际绘制参数
const drawInfo = await page.evaluate(() => {
  return new Promise(resolve => {
    const canvas = document.querySelector('.live2d-canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')

    let frameCount = 0
    let totalVerts = 0
    let totalIndices = 0
    let firstDrawInfo = null

    const origDraw = gl.drawElements
    gl.drawElements = function (mode, count, type, offset) {
      frameCount++
      totalIndices += count

      if (!firstDrawInfo && count > 0) {
        const prog = gl.getParameter(gl.CURRENT_PROGRAM)
        // 获取 MVP 矩阵 uniform
        const mvpLoc = gl.getUniformLocation(prog, 'u_clipMatrix')
        const texLoc = gl.getUniformLocation(prog, 's_texture0')

        // 获取当前绑定的 texture
        const tex = gl.getParameter(gl.TEXTURE_BINDING_2D)

        firstDrawInfo = {
          count,
          hasTexture: !!tex,
          hasProgram: !!prog,
          mvpLocExists: !!mvpLoc,
          texLocExists: !!texLoc
        }
      }

      return origDraw.apply(this, arguments)
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve({
          frameDrawCount: frameCount,
          totalIndices,
          firstDrawInfo
        })
      })
    })
  })
})

console.log('=== Draw Info ===')
console.log(JSON.stringify(drawInfo, null, 2))

await browser.close()
