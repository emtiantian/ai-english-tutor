# Live2D 诊断工具

本目录保存 Live2D/WebGL 的手动诊断工具，不参与应用构建、测试或生产部署。所有工具统一放在 `live2d/` 下，按用途分为状态检查、深度诊断和截图验证三类。

## 前置条件

```bash
pnpm install
npx playwright install chromium
pnpm dev
```

当前脚本统一访问 `http://127.0.0.1:6173/`。

## 目录

### `live2d/check/`：WebGL 状态检查

- `check-all-mvp.mjs`：检查 MVP 矩阵、顶点范围和绘制次数。
- `check-full-mvp.mjs`：详细检查 MVP 矩阵、顶点范围和基础颜色。
- `check-matrix.mjs`：检查首帧矩阵、顶点范围和像素绘制情况。
- `check-buffer.mjs`：检查顶点缓冲区大小、数据和属性位置。
- `check-opacity.mjs`：检查透明度、基础颜色和纹理绑定。
- `check-texture.mjs`：检查纹理、Shader uniform、Framebuffer 和 viewport。
- `check-utils.mjs`：检查 Live2D Core 的 Utils、版本 API 和绘制次数。

### `live2d/diagnose/`：深度诊断

- `diagnose-matrix.mjs`：输出矩阵、uniform 和顶点范围。
- `diagnose-model.mjs`：检查 Live2D Core、模型 API 和实际绘制状态。
- `diagnose-vertex.mjs`：检查顶点缓冲区、attribute 和 uniform。
- `find-model.mjs`：捕获模型日志并采样 Canvas 像素范围。
- `test-webgl.mjs`：绘制红色三角形，验证基础 WebGL 是否可用。

### `live2d/screenshot/`：截图验证

- `screenshot-live2d.mjs`：截图并输出 Canvas、Live2D 日志和错误。
- `screenshot-check.mjs`：截图检查角色位置。
- `monorepo-root-screenshot-live2d.mjs`：从仓库根目录运行截图检查。

## 运行示例

从 `apps/tutor-app` 目录运行：

```bash
node scripts/live2d/check/check-texture.mjs
node scripts/live2d/diagnose/diagnose-model.mjs
node scripts/live2d/screenshot/screenshot-live2d.mjs
```

从仓库根目录运行：

```bash
node apps/tutor-app/scripts/live2d/check/check-texture.mjs
```

截图脚本会把图片写入当前工作目录。诊断脚本只读取浏览器和 WebGL 状态，不修改源代码或模型资源。

## 注意事项

- 需要真实 Chromium WebGL 环境；无 GPU 环境可能只能验证 WebGL 创建。
- 脚本通过页面中的第一个 `canvas` 获取角色 WebGL 上下文；当前应用只有一个角色 Canvas。
- Live2D 现在在首页场景数据加载完成后后台启动，脚本需要等待资源初始化后再采样。
