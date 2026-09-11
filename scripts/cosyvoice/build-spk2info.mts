// scripts/cosyvoice/build-spk2info.mts
//
// 从参考音频生成 CosyVoice2 的 spk2info.pt（自定义音色 embedding 文件）。
//
// 运行方式：通过 `docker run --rm --gpus all` 在 `cosyvoice:local` 镜像内执行一段内嵌 Python，
// 无需本机安装 conda / PyTorch。要求机器具备 NVIDIA GPU 且已构建好 `cosyvoice:local` 镜像。
//
// 用法（从仓库根运行）：
//   pnpm build:cosyvoice-spk2info                                 # 用默认 EnglishTutor 音色
//   pnpm build:cosyvoice-spk2info -- --spk-id MyVoice --audio /abs/ref.wav
//   pnpm build:cosyvoice-spk2info -- --spk-id MyVoice --audio /abs/ref.mp3  # 自动转 WAV
//   pnpm build:cosyvoice-spk2info -- --spk-id MyVoice --audio /abs/ref.mp3 --rm-wav
//   pnpm build:cosyvoice-spk2info -- --help
//
// 默认路径：
//   参考音频 = <data-root>/cosyvoice-spk2info/<spk-id>.wav
//   输出文件 = <data-root>/cosyvoice-spk2info/<spk-id>.pt
//   data-root 解析：$AI_TUTOR_HOME/data（若设了 AI_TUTOR_HOME），否则 <repo>/data
//   —— 与 docker-compose.cosyvoice.yml 的挂载源路径完全对齐
//
// CosyVoice2 API 调研结论（基于 FunAudioLLM/CosyVoice 官方源码 main 分支）：
//   1. `CosyVoice2(model_dir)` 构造时读取 `{model_dir}/spk2info.pt` 作为内置音色表；
//      文件不存在则初始化为空 dict，不报错。
//   2. `add_zero_shot_spk(prompt_text, prompt_wav, zero_shot_spk_id)`：
//      内部调用 `frontend_zero_shot('', prompt_text, prompt_wav, sample_rate, '')`，
//      提取 prompt_text_token / speech_feat / speech_token / embedding 等字段，
//      删除其中的 text / text_len（属于 tts_text，与音色无关），
//      把剩余字段写入 `self.frontend.spk2info[zero_shot_spk_id]`。
//   3. `save_spkinfo()` 会 `torch.save(self.frontend.spk2info, '{model_dir}/spk2info.pt')`，
//      会覆盖默认音色表 —— 本脚本不采用，改为只保存单个 spk_id 的字段到独立文件。
//   4. spk2info.pt 加载端（CosyVoiceFrontEnd.__init__）用
//      `torch.load(spk2info, map_location=device, weights_only=True)`，
//      因此存档内容必须只含 tensor / 基础类型，本脚本保存 `{spk_id: model_input}` 满足该约束。
//
// ⚠ 首次在 GPU 机器运行需人工验证：
//   - cosyvoice:local 镜像里的 CosyVoice 代码版本是否仍提供 CosyVoice2 类与 add_zero_shot_spk 方法
//     （官方 main 分支提供；若镜像基于旧 tag，API 可能略有差异）
//   - 镜像内 python 默认指向 conda envs/cosyvoice（compose 的 command 直接用 python，已验证）
//   - /opt/CosyVoice/CosyVoice 是代码根目录，`-w` 设为它后 `import cosyvoice` 才能命中
//
// 实测结论（cosyvoice:local 镜像，2026-07，GTX 970）：官方 main 分支结论大体成立，但有 3 处
// 需针对本镜像适配（已在本脚本处理，直接 `pnpm build:cosyvoice-spk2info` 可跑通）：
//   a. deepspeed：镜像无 nvcc/CUDA_HOME，`import cosyvoice` 时 installed_cuda_version 会
//      raise MissingCUDAException 崩溃。仅 DS_BUILD_OPS=0 不够，需 sed patch builder.py 让其
//      返回 torch CUDA 版本（与 scripts/cosyvoice/server-wrapper.py 同款，见 buildDockerCommand）。
//   b. add_zero_shot_spk 的 prompt_wav 传「文件路径」而非 tensor：本镜像版本 frontend_zero_shot
//      内部 _extract_speech_feat/_extract_speech_token/_extract_spk_embedding 均调用
//      load_wav(prompt_wav)，而 load_wav 用 torchaudio.load 只接受路径，传 tensor 抛
//      'Invalid file: tensor(...)'。故 add_zero_shot_spk('', AUDIO_PATH, spk_id)。
//   c. 生成的 zero-shot 格式只有 llm_embedding/flow_embedding，缺 'embedding' 字段，而
//      inference_sft 的 frontend_sft 取 spk2info[spk_id]['embedding']（SFT 格式）。
//      故保存前补 spk_info['embedding'] = spk_info['llm_embedding']（二者同源于
//      _extract_spk_embedding 的 campplus [1,192] 向量），使克隆音色可被 /inference_sft 直接调用。
//   - 镜像内 python = /opt/conda/bin/python（Python 3.10），`-w /opt/CosyVoice/CosyVoice` 后
//     heredoc (`python - <<'PY'`) 的 sys.path 含 cwd，import cosyvoice 命中。

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '../..')

/** CosyVoice 自托管镜像名（与 docker-compose.cosyvoice.yml 一致） */
const IMAGE = 'cosyvoice:local'

/** 容器内 spk2info 目录挂载点（与 compose 约定一致） */
const CONTAINER_SPK_DIR = '/opt/CosyVoice/spk2info'
/** 容器内 modelscope 缓存挂载点 */
const CONTAINER_MODELSCOPE_CACHE = '/root/.cache/modelscope'
/** 容器内预置模型目录挂载点 */
const CONTAINER_PRETRAINED_MODELS = '/opt/CosyVoice/CosyVoice/pretrained_models'
/** 容器内 CosyVoice 代码根目录（工作目录） */
const CONTAINER_WORKDIR = '/opt/CosyVoice/CosyVoice'

// ── CLI 参数解析 ──

interface CliArgs {
  spkId: string
  audio: string
  modelDir: string
  output: string
  rmWav: boolean
  help: boolean
}

/** 解析 data-root：与 docker-compose.cosyvoice.yml 挂载源对齐 */
function resolveDataRoot(): string {
  if (process.env.AI_TUTOR_HOME) {
    return path.join(process.env.AI_TUTOR_HOME, 'data')
  }
  return path.join(REPO_ROOT, 'data')
}

function parseArgs(argv: string[]): CliArgs {
  const dataRoot = resolveDataRoot()
  const spk2infoDir = path.join(dataRoot, 'cosyvoice-spk2info')

  const args: CliArgs = {
    spkId: 'EnglishTutor',
    audio: '',
    modelDir: 'iic/CosyVoice2-0.5B',
    output: '',
    rmWav: false,
    help: false
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '-h':
      case '--help':
        args.help = true
        break
      case '--spk-id':
        args.spkId = argv[++i] ?? ''
        break
      case '--audio':
        args.audio = argv[++i] ?? ''
        break
      case '--model-dir':
        args.modelDir = argv[++i] ?? ''
        break
      case '--output':
        args.output = argv[++i] ?? ''
        break
      case '--rm-wav':
        args.rmWav = true
        break
      case '--':
        // pnpm 透传的选项分隔符（如 `pnpm build:cosyvoice-spk2info -- --spk-id X`），跳过
        break
      default:
        console.error(`未知参数: ${arg}`)
        console.error('使用 --help 查看用法')
        process.exit(2)
    }
  }

  // 默认值依赖 spkId，在解析后填充
  if (!args.audio) args.audio = path.join(spk2infoDir, `${args.spkId}.wav`)
  if (!args.output) args.output = path.join(spk2infoDir, `${args.spkId}.pt`)

  return args
}

function printHelp(): void {
  const dataRoot = resolveDataRoot()
  console.log(
    `
用法:
  pnpm build:cosyvoice-spk2info [-- <选项>]
  pnpm build:cosyvoice-spk2info -- [选项]

从参考音频生成 CosyVoice2 的 spk2info.pt（自定义音色 embedding 文件）。
在本机通过 docker run --gpus all 调用 cosyvoice:local 镜像执行，无需安装 conda/PyTorch。

选项:
  --spk-id <id>       音色 ID（默认: EnglishTutor）
  --audio <path>      参考音频路径，支持 .wav 或 .mp3 等 ffmpeg 可识别格式
                      .mp3 会自动转码为 16kHz 单声道 WAV
                      （默认: <data-root>/cosyvoice-spk2info/<spk-id>.wav）
  --model-dir <dir>   CosyVoice2 模型目录，本地路径或 modelscope repo id
                      （默认: iic/CosyVoice2-0.5B）
  --output <path>     输出 spk2info.pt 路径（默认: <data-root>/cosyvoice-spk2info/<spk-id>.pt）
  --rm-wav            若本次由 .mp3 转换出 .wav，Docker 成功后删除该临时 .wav
  -h, --help          显示本帮助

环境变量:
  AI_TUTOR_HOME       部署根目录；设置后 data-root = $AI_TUTOR_HOME/data
                      未设置时 data-root = <repo>/data

当前 data-root: ${dataRoot}
镜像: ${IMAGE}

约束:
  - 参考音频与输出文件必须在同一目录（即 cosyvoice-spk2info 目录），该目录会被读写挂载到容器
  - 已针对 cosyvoice:local 镜像适配（deepspeed patch / 传路径 / 补 embedding），详见文件头实测结论
`.trim()
  )
}

// ── 前置检查 ──

function fail(msg: string): never {
  console.error(`错误: ${msg}`)
  process.exit(1)
}

/** 检查命令是否可用（同步） */
function commandAvailable(cmd: string): boolean {
  const result = spawnSync(cmd, ['--version'], { stdio: 'ignore', shell: false })
  return result.status === 0
}

/** 检查 docker 镜像是否已构建 */
function imageExists(image: string): boolean {
  const result = spawnSync('docker', ['image', 'inspect', image], { stdio: 'ignore' })
  return result.status === 0
}

/** 检查前置条件：docker / 镜像 / 参考音频 / 挂载目录 */
function preflightChecks(args: CliArgs): {
  hostSpkDir: string
  hostModelscopeCache: string
  hostPretrainedModels: string
  containerAudioPath: string
  containerOutputPath: string
} {
  // 1) docker 命令可用
  if (!commandAvailable('docker')) {
    fail(
      '未检测到 docker 命令。请先安装 Docker 并确保 docker 在 PATH 中。\n' +
        '  macOS: https://docs.docker.com/desktop/install/mac-install/\n' +
        '  Linux: https://docs.docker.com/engine/install/'
    )
  }

  // 2) cosyvoice:local 镜像已构建
  if (!imageExists(IMAGE)) {
    fail(
      `镜像 ${IMAGE} 不存在。请先在具备 GPU 的机器上构建该镜像（参考 CosyVoice 官方仓库的 Dockerfile），\n` +
        '  或在远程服务器上确认镜像已就绪后再运行本脚本。'
    )
  }

  // 3) 参考音频文件存在
  if (!existsSync(args.audio)) {
    fail(
      `参考音频不存在: ${args.audio}\n` +
        `  请将参考音频放到 <data-root>/cosyvoice-spk2info/<spk-id>.wav，\n` +
        '  或通过 --audio 参数指定其他路径。'
    )
  }

  // 4) 参考音频是普通文件
  const audioStat = statSync(args.audio)
  if (!audioStat.isFile()) {
    fail(`参考音频路径不是普通文件: ${args.audio}`)
  }

  // 5) 参考音频与输出文件必须在同一目录（挂载点对齐）
  const audioDir = path.dirname(args.audio)
  const outputDir = path.dirname(args.output)
  if (path.resolve(audioDir) !== path.resolve(outputDir)) {
    fail(
      `参考音频目录与输出目录不一致:\n` +
        `  参考音频目录: ${audioDir}\n` +
        `  输出目录:     ${outputDir}\n` +
        '  本脚本只挂载一个 spk2info 目录到容器，两者必须位于同一目录。'
    )
  }

  const dataRoot = resolveDataRoot()
  const hostSpkDir = path.resolve(audioDir)
  const hostModelscopeCache = path.join(dataRoot, 'modelscope-cache')
  const hostPretrainedModels = path.join(dataRoot, 'cosyvoice-models')

  // 6) 挂载目录存在性检查（不存在则自动创建，避免 docker 以 root 创建导致权限问题）
  for (const dir of [hostModelscopeCache, hostPretrainedModels]) {
    if (!existsSync(dir)) {
      console.warn(`警告: 挂载源目录不存在，自动创建: ${dir}`)
      console.warn('  （若首次运行，建议先跑 bash scripts/config/init-host.sh 完成目录初始化）')
      try {
        mkdirSync(dir, { recursive: true })
      } catch (e) {
        fail(`创建目录失败: ${dir} - ${(e as Error).message}`)
      }
    }
  }

  // 容器内路径（basename 保持与宿主机一致）
  const containerAudioPath = path.posix.join(CONTAINER_SPK_DIR, path.basename(args.audio))
  const containerOutputPath = path.posix.join(CONTAINER_SPK_DIR, path.basename(args.output))

  return {
    hostSpkDir,
    hostModelscopeCache,
    hostPretrainedModels,
    containerAudioPath,
    containerOutputPath
  }
}

// ── 音频格式预处理 ──

/** 判断文件扩展名是否为 WAV（不检查内容） */
function isWavFile(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.wav'
}

/** 把任意音频路径映射为同目录同名 .wav 路径 */
function deriveWavPath(inputPath: string): string {
  const parsed = path.parse(inputPath)
  return path.format({ ...parsed, base: undefined, ext: '.wav' })
}

/** 异步检查命令是否可用 */
function commandAvailableAsync(cmd: string): Promise<boolean> {
  return new Promise(resolve => {
    const child = spawn(cmd, ['--version'], { stdio: 'ignore' })
    child.on('error', () => resolve(false))
    child.on('close', code => resolve(code === 0))
  })
}

/**
 * 确保参考音频是 CosyVoice 可读取的 16kHz 单声道 WAV。
 * 若输入已是 .wav，直接返回；否则调用 ffmpeg 转码为同目录同名 .wav。
 */
async function ensureWav16kMono(audioPath: string): Promise<string> {
  if (isWavFile(audioPath)) return audioPath

  if (!(await commandAvailableAsync('ffmpeg'))) {
    fail(
      '参考音频不是 .wav 格式，且未检测到 ffmpeg 命令。\n' +
        '  请先安装 ffmpeg（macOS: brew install ffmpeg；Ubuntu: apt install ffmpeg），\n' +
        '  或预先将参考音频转换为 16kHz 单声道 WAV 后再运行。'
    )
  }

  const outputPath = deriveWavPath(audioPath)
  console.log(`检测到非 WAV 参考音频，转换为 16kHz 单声道 WAV: ${outputPath}`)

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      audioPath,
      '-acodec',
      'pcm_s16le',
      '-ac',
      '1',
      '-ar',
      '16000',
      outputPath
    ])

    const errChunks: Buffer[] = []
    ffmpeg.stderr.on('data', (chunk: Buffer) => errChunks.push(chunk))

    ffmpeg.on('error', err => {
      reject(new Error(`启动 ffmpeg 失败: ${err.message}`))
    })

    ffmpeg.on('close', code => {
      if (code !== 0) {
        const err = Buffer.concat(errChunks).toString('utf-8')
        reject(new Error(`ffmpeg 转换失败（code=${code}）：${err || '未知错误'}`))
        return
      }
      if (!existsSync(outputPath)) {
        reject(new Error(`ffmpeg 声称成功，但输出文件不存在: ${outputPath}`))
        return
      }
      resolve(outputPath)
    })
  })
}

// ── 内嵌 Python 脚本 ──

/**
 * 在容器内执行的 Python 脚本。
 *
 * 通过 stdin heredoc 传入（`python - <<'PY'`），无需落盘。
 * 环境变量由 `docker run -e` 注入：
 *   - SPK_ID       音色 ID
 *   - AUDIO_PATH   容器内参考音频路径
 *   - MODEL_DIR    CosyVoice2 模型目录
 *   - OUTPUT_PATH  容器内输出路径
 */
const PYTHON_SCRIPT = `
import os
import sys
import traceback

import torch
from cosyvoice.cli.cosyvoice import CosyVoice2
from cosyvoice.utils.file_utils import load_wav

SPK_ID = os.environ.get('SPK_ID', '')
AUDIO_PATH = os.environ.get('AUDIO_PATH', '')
MODEL_DIR = os.environ.get('MODEL_DIR', 'iic/CosyVoice2-0.5B')
OUTPUT_PATH = os.environ.get('OUTPUT_PATH', '')

assert SPK_ID, 'SPK_ID 环境变量未设置'
assert AUDIO_PATH, 'AUDIO_PATH 环境变量未设置'
assert OUTPUT_PATH, 'OUTPUT_PATH 环境变量未设置'

try:
    print(f'[1/4] 加载 CosyVoice2 模型: {MODEL_DIR}', flush=True)
    cosyvoice = CosyVoice2(MODEL_DIR)
    existing_spks = cosyvoice.list_available_spks()
    print(f'      模型内置音色: {existing_spks if existing_spks else "(无)"}', flush=True)

    print(f'[2/4] 加载参考音频: {AUDIO_PATH}', flush=True)
    assert os.path.exists(AUDIO_PATH), f'参考音频不存在: {AUDIO_PATH}'
    prompt_speech_16k = load_wav(AUDIO_PATH, 16000)
    duration = prompt_speech_16k.shape[-1] / 16000
    print(f'      音频时长: {duration:.2f}s, 采样点数: {prompt_speech_16k.shape[-1]}', flush=True)

    print(f'[3/4] 提取说话人 embedding (spk_id={SPK_ID})', flush=True)
    # add_zero_shot_spk 内部调用 frontend_zero_shot 提取以下字段:
    #   prompt_text_token / prompt_text_token_len
    #   llm_prompt_speech_token / llm_prompt_speech_token_len
    #   flow_prompt_speech_token / flow_prompt_speech_token_len
    #   prompt_speech_feat / prompt_speech_feat_len
    #   llm_embedding / flow_embedding
    # prompt_text 传空字符串即可: sft 推理只用到 embedding 字段,
    # zero-shot 推理才会用到 prompt_text_token（空 token 也能工作）
    # IMPORTANT: prompt_wav 传「文件路径」而非 tensor —— 当前镜像版本 frontend_zero_shot 内部
    # _extract_speech_feat/_extract_speech_token/_extract_spk_embedding 均调用 load_wav(prompt_wav),
    # 而 load_wav 用 torchaudio.load 只接受文件路径，传 tensor 会抛 'Invalid file: tensor(...)'。
    # （上方 load_wav(AUDIO_PATH,16000) 仅用于打印时长，不参与 embedding 提取）
    cosyvoice.add_zero_shot_spk('', AUDIO_PATH, SPK_ID)
    spk_info = cosyvoice.frontend.spk2info[SPK_ID]
    print(f'      embedding 维度: {spk_info["llm_embedding"].shape}', flush=True)
    print(f'      提取字段: {list(spk_info.keys())}', flush=True)

    print(f'[4/4] 保存 spk2info 到: {OUTPUT_PATH}', flush=True)
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    # 补 embedding 字段以兼容 /inference_sft:
    # add_zero_shot_spk 生成的是 zero-shot 格式（含 llm_embedding/flow_embedding）,
    # 而 frontend_sft 取 spk2info[spk_id]['embedding']（SFT 格式，EnglishTutor.pt 即此格式）。
    # llm_embedding 与 flow_embedding 同源于 _extract_spk_embedding（campplus [1,192]），
    # 故补 embedding = llm_embedding，使克隆音色可被 /inference_sft 直接调用。
    spk_info['embedding'] = spk_info['llm_embedding']
    # 保存为 {spk_id: spk_info} 的 dict, 与 CosyVoice 默认 spk2info.pt 格式一致,
    # 加载端用 torch.load(..., weights_only=True) 能正常读取
    torch.save({SPK_ID: spk_info}, OUTPUT_PATH)
    size = os.path.getsize(OUTPUT_PATH)
    print(f'      文件大小: {size} bytes ({size / 1024:.1f} KB)', flush=True)

    print('', flush=True)
    print('完成!', flush=True)
    print(f'  spk_id: {SPK_ID}', flush=True)
    print(f'  输出: {OUTPUT_PATH}', flush=True)
    print(f'  后续: 将此文件挂载到 cosyvoice 容器即可通过 spk_id 调用 /inference_sft', flush=True)

except Exception as e:
    print(f'Python 错误: {e}', file=sys.stderr, flush=True)
    traceback.print_exc()
    sys.exit(1)
`

// ── 主流程 ──

function buildDockerCommand(
  args: CliArgs,
  paths: {
    hostSpkDir: string
    hostModelscopeCache: string
    hostPretrainedModels: string
    containerAudioPath: string
    containerOutputPath: string
  }
): string[] {
  // heredoc 通过 bash -c 传入, 'PY' 加引号禁止变量展开
  // 先 patch deepspeed（与 scripts/cosyvoice/server-wrapper.py 一致）：本镜像无 nvcc/CUDA_HOME，
  // DS_BUILD_OPS=0 不编译 op，但 installed_cuda_version 仍会 raise MissingCUDAException 致
  // import cosyvoice 崩溃，需让其返回 torch CUDA 版本。docker run --rm 是全新容器，没有
  // wrapper 的运行时 patch，故在此显式补上。
  const innerCmd = [
    `_py=/opt/conda/lib/python3.10/site-packages/deepspeed/ops/op_builder/builder.py`,
    `if grep -q 'raise MissingCUDAException("CUDA_HOME does not exist, unable to compile CUDA op(s)")' "$_py"; then`,
    `  sed -i 's|raise MissingCUDAException("CUDA_HOME does not exist, unable to compile CUDA op(s)")|return (12, 1)  # patched by build-cosyvoice-spk2info|' "$_py"`,
    `  echo '[patch] deepspeed builder.py 已 patch'`,
    `fi`,
    `python - <<'PY'`,
    PYTHON_SCRIPT,
    `PY`
  ].join('\n')

  return [
    'run',
    '--rm',
    '--gpus',
    'all',
    // spk2info 目录: 读写挂载, 容器要把生成的 .pt 写回宿主机
    '-v',
    `${paths.hostSpkDir}:${CONTAINER_SPK_DIR}`,
    // modelscope 缓存: 命中即免重下 ~11G 模型
    '-v',
    `${paths.hostModelscopeCache}:${CONTAINER_MODELSCOPE_CACHE}`,
    // 预置模型目录: 避免容器内重新下载
    '-v',
    `${paths.hostPretrainedModels}:${CONTAINER_PRETRAINED_MODELS}`,
    '-w',
    CONTAINER_WORKDIR,
    // DS_BUILD_OPS=0 禁用 deepspeed CUDA op 编译（镜像 ENV 已设，显式注入便于脱离该镜像时仍生效）
    '-e',
    `DS_BUILD_OPS=0`,
    '-e',
    `SPK_ID=${args.spkId}`,
    '-e',
    `AUDIO_PATH=${paths.containerAudioPath}`,
    '-e',
    `MODEL_DIR=${args.modelDir}`,
    '-e',
    `OUTPUT_PATH=${paths.containerOutputPath}`,
    IMAGE,
    'bash',
    '-c',
    innerCmd
  ]
}

function runDocker(dockerArgs: string[], cleanup?: () => void): Promise<void> {
  // 日志只展示命令骨架，内嵌 Python 脚本（最后一个参数）用省略号代替
  const displayArgs = dockerArgs.slice(0, -1).join(' ')
  console.log('执行 docker 命令:')
  console.log(`  docker ${displayArgs} "python - <<'PY' ..."`)
  console.log('')

  return new Promise((resolve, reject) => {
    const child = spawn('docker', dockerArgs, { stdio: 'inherit' })

    child.on('error', err => {
      reject(new Error(`启动 docker 失败: ${err.message}`))
    })

    child.on('close', code => {
      if (code === 0) {
        resolve()
        return
      }

      console.error('')
      console.error(`docker 进程退出码: ${code}`)
      if (code === 125) {
        console.error(
          '  可能原因: --gpus all 不被支持（未安装 nvidia-container-toolkit），\n' +
            '  或 GPU 设备不可用。请确认机器具备 NVIDIA GPU 且已安装 nvidia-container-toolkit。'
        )
      } else if (code === 126 || code === 127) {
        console.error(
          '  可能原因: 容器内 python 或 bash 命令找不到。\n' +
            `  请检查 ${IMAGE} 镜像是否完好（进入容器跑 \`which python\` 确认）。`
        )
      } else if (code === 137) {
        console.error(
          '  可能原因: 容器被 OOM Killed。GTX 970 4GB 显存可能不足，请关闭其他 GPU 进程后重试。'
        )
      } else {
        console.error(
          '  详见上方 Python traceback。若为 API 不匹配，请核对 cosyvoice:local 镜像内的 CosyVoice 代码版本。'
        )
      }
      reject(new Error(`docker 进程退出码: ${code}`))
    })
  }).finally(() => {
    if (cleanup) cleanup()
  })
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    printHelp()
    return
  }

  console.log('CosyVoice spk2info 生成脚本')
  console.log('  spk-id:    ', args.spkId)
  console.log('  参考音频:   ', args.audio)
  console.log('  模型目录:   ', args.modelDir)
  console.log('  输出:       ', args.output)
  console.log('  镜像:       ', IMAGE)
  console.log('')

  const originalAudio = args.audio
  args.audio = await ensureWav16kMono(args.audio)
  const convertedWav = args.audio !== originalAudio ? args.audio : null
  if (convertedWav) {
    console.log('  转换后音频: ', args.audio)
    console.log('')
  }

  const paths = preflightChecks(args)

  console.log('挂载映射:')
  console.log(`  ${paths.hostSpkDir} -> ${CONTAINER_SPK_DIR} (rw)`)
  console.log(`  ${paths.hostModelscopeCache} -> ${CONTAINER_MODELSCOPE_CACHE} (ro)`)
  console.log(`  ${paths.hostPretrainedModels} -> ${CONTAINER_PRETRAINED_MODELS} (ro)`)
  console.log('')

  const dockerArgs = buildDockerCommand(args, paths)

  try {
    await runDocker(dockerArgs, () => {
      if (convertedWav && args.rmWav && existsSync(convertedWav)) {
        console.log(`清理临时 WAV: ${convertedWav}`)
        rmSync(convertedWav)
      }
    })
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
