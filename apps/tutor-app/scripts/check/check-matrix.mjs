import { chromium } from 'playwright-core';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(10000);

const result = await page.evaluate(() => {
  return new Promise(resolve => {
    const canvas = document.querySelector('.character-canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    
    let drawCount = 0;
    let firstMVP = null;
    let firstPosRange = null;
    
    const origDraw = gl.drawElements;
    gl.drawElements = function(mode, count, type, offset) {
      drawCount++;
      
      if (drawCount === 1) {
        const prog = gl.getParameter(gl.CURRENT_PROGRAM);
        const mvpLoc = gl.getUniformLocation(prog, 'u_matrix');
        if (mvpLoc) {
          const mvp = gl.getUniform(prog, mvpLoc);
          firstMVP = mvp ? Array.from(mvp) : null;
        }
        
        const posLoc = gl.getAttribLocation(prog, 'a_position');
        if (posLoc >= 0) {
          const vbo = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
          if (vbo) {
            const size = gl.getBufferParameter(gl.ARRAY_BUFFER, gl.BUFFER_SIZE);
            const data = new Float32Array(size / 4);
            gl.getBufferSubData(gl.ARRAY_BUFFER, 0, data);
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (let j = 0; j < data.length; j += 2) {
              minX = Math.min(minX, data[j]);
              maxX = Math.max(maxX, data[j]);
              minY = Math.min(minY, data[j+1]);
              maxY = Math.max(maxY, data[j+1]);
            }
            firstPosRange = { minX, maxX, minY, maxY };
          }
        }
      }
      
      return origDraw.apply(this, arguments);
    };
    
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve({ drawCount, firstMVP, firstPosRange });
      });
    });
  });
});

console.log('=== Draw Info ===');
console.log(JSON.stringify(result, null, 2));

// 检查 framebuffer 像素
const pixels = await page.evaluate(() => {
  const canvas = document.querySelector('.character-canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const points = [];
  for (let y = 0.1; y <= 0.9; y += 0.2) {
    for (let x = 0.1; x <= 0.9; x += 0.2) {
      const p = new Uint8Array(4);
      gl.readPixels(Math.floor(x * canvas.width), Math.floor(y * canvas.height), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
      points.push({ x, y, p: Array.from(p), sum: p[0]+p[1]+p[2]+p[3] });
    }
  }
  return points;
});

console.log('=== Pixel Samples ===');
pixels.filter(p => p.sum > 0).forEach(p => console.log(p));
console.log('Non-zero pixels:', pixels.filter(p => p.sum > 0).length, '/', pixels.length);

await browser.close();
