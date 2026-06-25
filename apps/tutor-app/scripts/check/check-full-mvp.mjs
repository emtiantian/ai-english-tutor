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
    const mvps = [];
    
    const origDraw = gl.drawElements;
    gl.drawElements = function(mode, count, type, offset) {
      drawCount++;
      
      if (drawCount <= 3) {
        const prog = gl.getParameter(gl.CURRENT_PROGRAM);
        const mvpLoc = gl.getUniformLocation(prog, 'u_matrix');
        let matrix = null;
        if (mvpLoc) {
          const m = gl.getUniform(prog, mvpLoc);
          matrix = m ? Array.from(m) : null;
        }
        
        const posLoc = gl.getAttribLocation(prog, 'a_position');
        let posRange = null;
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
            posRange = { minX, maxX, minY, maxY };
          }
        }
        
        // 获取 baseColor
        const baseLoc = gl.getUniformLocation(prog, 'u_baseColor');
        let baseColor = null;
        if (baseLoc) {
          const b = gl.getUniform(prog, baseLoc);
          baseColor = b ? Array.from(b) : null;
        }
        
        mvps.push({ drawCount, count, matrix, posRange, baseColor });
      }
      
      return origDraw.apply(this, arguments);
    };
    
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve({ drawCount, mvps });
      });
    });
  });
});

console.log('=== Full MVP Analysis ===');
console.log(JSON.stringify(result, null, 2));

await browser.close();
