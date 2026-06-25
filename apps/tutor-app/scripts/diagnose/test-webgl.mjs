import { chromium } from 'playwright-core';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(10000);

// 手动绘制一个红色三角形
const result = await page.evaluate(() => {
  const canvas = document.querySelector('.character-canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  
  // 保存当前状态
  const origProg = gl.getParameter(gl.CURRENT_PROGRAM);
  const origFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
  
  // 创建简单的 shader
  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, `
    attribute vec2 a_pos;
    void main() {
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }
  `);
  gl.compileShader(vs);
  
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, `
    void main() {
      gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    }
  `);
  gl.compileShader(fs);
  
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  
  // 顶点数据：覆盖整个屏幕的三角形
  const verts = new Float32Array([-1, -1, 3, -1, -1, 3]);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  
  gl.useProgram(prog);
  const loc = gl.getAttribLocation(prog, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  gl.colorMask(true, true, true, true);
  
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  
  // 读取像素
  const pixels = new Uint8Array(4);
  gl.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  
  // 恢复状态
  gl.useProgram(origProg);
  gl.bindFramebuffer(gl.FRAMEBUFFER, origFbo);
  
  return {
    pixelCenter: Array.from(pixels),
    vsCompile: gl.getShaderParameter(vs, gl.COMPILE_STATUS),
    fsCompile: gl.getShaderParameter(fs, gl.COMPILE_STATUS),
    linkStatus: gl.getProgramParameter(prog, gl.LINK_STATUS),
  };
});

console.log('=== Manual WebGL Draw ===');
console.log(JSON.stringify(result, null, 2));

await browser.close();
