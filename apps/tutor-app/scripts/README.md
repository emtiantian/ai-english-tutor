# Diagnostic Scripts

Playwright-based headless browser scripts for debugging WebGL rendering (Live2D / Spine).

## Prerequisites

```bash
pnpm add -D playwright-core
npx playwright install chromium
```

## Usage

Start the dev server first, then run a script:

```bash
pnpm dev
node scripts/check/check-matrix.mjs
```

## Directory Structure

### `check/` — WebGL State Inspection

Quick checks on the character canvas WebGL context.

| Script               | What it checks                        |
| -------------------- | ------------------------------------- |
| `check-all-mvp.mjs`  | Full MVP matrix state                 |
| `check-buffer.mjs`   | WebGL buffer objects                  |
| `check-full-mvp.mjs` | Detailed MVP matrix check             |
| `check-matrix.mjs`   | Matrix/transformation state           |
| `check-opacity.mjs`  | Alpha/opacity rendering               |
| `check-texture.mjs`  | Texture binding state                 |
| `check-utils.mjs`    | Live2DCubismCore utility availability |

### `diagnose/` — Deep Diagnostics

In-depth investigation of model loading and rendering issues.

| Script                | What it does                                            |
| --------------------- | ------------------------------------------------------- |
| `diagnose-matrix.mjs` | Matrix-related issue diagnosis                          |
| `diagnose-model.mjs`  | Model loading and rendering diagnostics                 |
| `diagnose-vertex.mjs` | Vertex data inspection (injects drawMeshWebGL override) |
| `find-model.mjs`      | Captures console logs to find model-related info        |
| `test-webgl.mjs`      | Draws a red triangle to verify basic WebGL works        |

### `screenshot/` — Visual Capture

Screenshot-based visual verification.

| Script                  | Output                                      |
| ----------------------- | ------------------------------------------- |
| `screenshot-check.mjs`  | `live2d-current.png` + WebGL position check |
| `screenshot-live2d.mjs` | `live2d-position-check.png`                 |
| `spine-screenshot.mjs`  | Spine animation screenshot                  |

## Ports

- `:5173` — Default Vite dev server
- `:5174` — Alternate dev server (used by some diagnose scripts)
- `:6173` — Production-like server (used by screenshot scripts)
