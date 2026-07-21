import { chromium } from 'playwright-core'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

await page.goto('http://127.0.0.1:5174/', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(8000)

// 注入代码，覆盖 drawMeshWebGL 来检查顶点数据
const result = await page.evaluate(() => {
  return new Promise(resolve => {
    // 我们需要找到 CubismRenderer_WebGL 的实例
    // 但由于这是模块化的，无法直接访问
    // 换一种方式：检查 WebGL 的 vertex buffer 内容

    const canvas = document.querySelector('.live2d-canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')

    let sampleVerts = []
    let sampleOpacities = []
    let drawCount = 0

    const origDraw = gl.drawElements
    gl.drawElements = function (mode, count, type, offset) {
      drawCount++

      if (drawCount <= 3) {
        // 尝试获取当前绑定的 vertex buffer
        const vbo = gl.getParameter(gl.ARRAY_BUFFER_BINDING)
        const ibo = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING)

        // 获取当前 program 的 attribute 信息
        const prog = gl.getParameter(gl.CURRENT_PROGRAM)
        const numAttribs = gl.getProgramParameter(prog, gl.ACTIVE_ATTRIBUTES)
        const attribInfo = []
        for (let i = 0; i < numAttribs; i++) {
          const info = gl.getActiveAttrib(prog, i)
          const loc = gl.getAttribLocation(prog, info.name)
          attribInfo.push({ name: info.name, loc, type: info.type, size: info.size })
        }

        // 获取 uniform 信息
        const numUniforms = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS)
        const uniformInfo = []
        for (let i = 0; i < numUniforms; i++) {
          const info = gl.getActiveUniform(prog, i)
          const loc = gl.getUniformLocation(prog, info.name)
          let value = null
          if (info.type === gl.FLOAT_MAT4) {
            try {
              value = Array.from(gl.getUniform(prog, loc))
            } catch (e) {}
          } else if (info.type === gl.SAMPLER_2D) {
            try {
              value = gl.getUniform(prog, loc)
            } catch (e) {}
          }
          uniformInfo.push({
            name: info.name,
            type: info.type,
            value: value ? value.slice(0, 4) : null
          })
        }

        sampleVerts.push({
          drawCount,
          count,
          hasVbo: !!vbo,
          hasIbo: !!ibo,
          attribs: attribInfo,
          uniforms: uniformInfo
        })
      }

      return origDraw.apply(this, arguments)
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve({
          totalDraws: drawCount,
          samples: sampleVerts
        })
      })
    })
  })
})

console.log('=== Vertex/Shader Diagnosis ===')
console.log(JSON.stringify(result, null, 2))

await browser.close()
