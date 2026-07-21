/**
 * 临时性能检查脚本：启动 Chromium，访问本地前端，截图并采集 Performance 指标。
 *
 * 运行：node scripts/perf-check.mjs
 */
import { chromium } from 'playwright-core'

const url = process.env.FRONTEND_URL || 'https://localhost:6173'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true
  })
  const page = await context.newPage()

  // 采集 Performance 指标
  await page.evaluate(() => {
    performance.mark('start')
  })

  await page.goto(url, { waitUntil: 'load', timeout: 30000 })

  // 等待 Live2D 加载完成（通过控制台日志判断）
  await page.waitForTimeout(8000)

  const screenshotPath = '/tmp/tutor-perf-screenshot.png'
  await page.screenshot({ path: screenshotPath, fullPage: false })
  console.log(`截图已保存: ${screenshotPath}`)

  // 读取 Performance 指标
  const metrics = await page.evaluate(() => {
    const entries = performance.getEntriesByType('navigation')
    const nav = entries[0] || {}
    return {
      domContentLoaded: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
      loadComplete: nav.loadEventEnd - nav.loadEventStart,
      fps: null // 需要在 page 里用 rAF 采样
    }
  })
  console.log('导航性能指标:', metrics)

  // 在页面内采样 Live2D 渲染帧时间
  const frameMetrics = await page.evaluate(async () => {
    return new Promise(resolve => {
      const samples = []
      let last = performance.now()
      let count = 0
      const maxSamples = 60

      function frame() {
        const now = performance.now()
        const delta = now - last
        last = now
        samples.push(delta)
        count++
        if (count < maxSamples) {
          requestAnimationFrame(frame)
        } else {
          const avg = samples.reduce((a, b) => a + b, 0) / samples.length
          const max = Math.max(...samples)
          resolve({ avgFrameTime: avg, maxFrameTime: max, sampleCount: samples.length })
        }
      }
      requestAnimationFrame(frame)
    })
  })
  console.log('渲染帧时间 (ms):', frameMetrics)

  await browser.close()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
