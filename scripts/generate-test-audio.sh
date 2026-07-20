#!/usr/bin/env bash
# ── AI English Tutor — 生成 ASR 标准测试音频 ──
# 用法: ./scripts/generate-test-audio.sh [输出路径]
# 默认输出到 ./.dev-data/test-asr.mp3
#
# 生成格式：16kHz 单声道 MP3，64kbps（与前端上传格式一致）

set -euo pipefail

LOCAL_PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="${1:-${LOCAL_PROJECT_ROOT}/.dev-data/test-asr.mp3}"
TEXT="Hello, I would like to order a cup of coffee."

mkdir -p "$(dirname "${OUTPUT}")"

# 临时 WAV，16kHz mono
TMP_WAV="$(mktemp /tmp/test-asr-XXXXXX.wav)"
trap 'rm -f "${TMP_WAV}"' EXIT

# 探测 espeak（Linux 常见，生成有语义英文语音，whisper 可识别）
ESPEAK=$(command -v espeak-ng 2>/dev/null || command -v espeak 2>/dev/null || true)

if command -v say >/dev/null 2>&1; then
  # macOS 自带 say，支持直接输出 16kHz mono WAV
  say -o "${TMP_WAV}" --data-format=LEI16@16000 "${TEXT}"
elif [ -n "${ESPEAK}" ]; then
  # Linux espeak：输出 22050Hz WAV，后续 ffmpeg 统一转 16kHz mono MP3
  "${ESPEAK}" -v en-us -s 140 "${TEXT}" -w "${TMP_WAV}"
elif command -v ffmpeg >/dev/null 2>&1; then
  # 兜底：440Hz 正弦波（无语义，whisper 可能识别为空，仅用于格式/连通性测试）
  echo "[WARN] 无 say/espeak，用 ffmpeg 生成正弦波（无语义，whisper 可能识别为空）" >&2
  ffmpeg -y -f lavfi -i "sine=frequency=440:duration=3" \
    -ar 16000 -ac 1 "${TMP_WAV}" >/dev/null 2>&1
else
  echo "[ERROR] 需要 say(macOS) / espeak / ffmpeg 来生成测试音频" >&2
  exit 1
fi

# 统一转码为 MP3
if command -v ffmpeg >/dev/null 2>&1; then
  ffmpeg -y -i "${TMP_WAV}" -ar 16000 -ac 1 -b:a 64k "${OUTPUT}" >/dev/null 2>&1
else
  echo "[ERROR] 需要 ffmpeg 把 WAV 转成 MP3" >&2
  exit 1
fi

echo "[INFO] 已生成测试音频: ${OUTPUT}"
ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate,channels,bit_rate -of default=noprint_wrappers=1 "${OUTPUT}" || true
