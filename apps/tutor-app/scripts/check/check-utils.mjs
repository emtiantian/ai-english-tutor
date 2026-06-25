import { chromium } from 'playwright-core';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(8000);

const utils = await page.evaluate(() => {
  const core = window.Live2DCubismCore;
  return {
    hasUtils: !!core.Utils,
    utilsMethods: core.Utils ? Object.keys(core.Utils) : [],
    hasVersion: !!core.Version,
    versionMethods: core.Version ? Object.keys(core.Version) : [],
  };
});

console.log('Core Utils:', JSON.stringify(utils, null, 2));

// 检查 draw calls
const drawInfo = await page.evaluate(() => {
  return new Promise(resolve => {
    const canvas = document.querySelector('.character-canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    let drawCount = 0;
    const orig = gl.drawElements;
    gl.drawElements = function(mode, count, type, offset) {
      drawCount++;
      return orig.apply(this, arguments);
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve({ drawCount });
      });
    });
  });
});

console.log('Draw count:', drawInfo.drawCount);

await browser.close();
