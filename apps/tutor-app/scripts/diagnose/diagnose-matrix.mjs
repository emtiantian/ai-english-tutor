import { chromium } from 'playwright-core'
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

await page.goto('http://127.0.0.1:5174/', { waitUntil: 'networkidle', timeout: 30000 })
await page.waitForTimeout(8000)

const result = await page.evaluate(() => {
  return new Promise(resolve => {
    const canvas = document.querySelector('.live2d-canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')

    let matrixInfo = []
    let drawCount = 0

    const origDraw = gl.drawElements
    gl.drawElements = function (mode, count, type, offset) {
      drawCount++

      if (drawCount <= 5) {
        const prog = gl.getParameter(gl.CURRENT_PROGRAM)
        const numUniforms = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS)
        const uniforms = {}

        for (let i = 0; i < numUniforms; i++) {
          const info = gl.getActiveUniform(prog, i)
          const loc = gl.getUniformLocation(prog, info.name)

          if (info.type === gl.FLOAT_MAT4) {
            // mat4: get all 16 values
            const vals = []
            for (let r = 0; r < 4; r++) {
              const row = gl.getUniform(prog, loc)
              if (row && Array.isArray(row)) {
                vals.push(...row.slice(r * 4, r * 4 + 4))
              }
            }
            // Actually getUniform for mat4 returns a Float32Array of 16 elements
            const full = gl.getUniform(prog, loc)
            uniforms[info.name] = Array.from(full)
          } else if (info.type === gl.FLOAT_VEC4) {
            const val = gl.getUniform(prog, loc)
            uniforms[info.name] = val ? Array.from(val) : null
          } else if (info.type === gl.FLOAT_VEC2) {
            const val = gl.getUniform(prog, loc)
            uniforms[info.name] = val ? Array.from(val) : null
          } else if (info.type === gl.FLOAT) {
            uniforms[info.name] = gl.getUniform(prog, loc)
          } else if (info.type === gl.SAMPLER_2D) {
            uniforms[info.name] = gl.getUniform(prog, loc)
          }
        }

        // 获取顶点数据
        const posLoc = gl.getAttribLocation(prog, 'a_position')
        let posRange = null
        if (posLoc >= 0) {
          // 获取 vertex buffer 数据
          const vbo = gl.getParameter(gl.ARRAY_BUFFER_BINDING)
          if (vbo) {
            const size = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE)
            const data = new Float32Array(size / 4)
            gl.getBufferSubData(gl.ARRAY_BUFFER, 0, data)

            let minX = Infinity,
              maxX = -Infinity
            let minY = Infinity,
              maxY = -Infinity
            for (let j = 0; j < data.length; j += 2) {
              minX = Math.min(minX, data[j])
              maxX = Math.max(maxX, data[j])
              minY = Math.min(minY, data[j + 1])
              maxY = Math.max(maxY, data[j + 1])
            }
            posRange = { minX, maxX, minY, maxY, count: data.length / 2 }
          }
        }

        matrixInfo.push({
          drawCount,
          elementCount: count,
          uniforms,
          posRange
        })
      }

      return origDraw.apply(this, arguments)
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve({
          totalDraws: drawCount,
          draws: matrixInfo
        })
      })
    })
  })
})

console.log('=== Matrix/Vertex Diagnosis ===')
console.log(JSON.stringify(result, null, 2))

await browser.close()
