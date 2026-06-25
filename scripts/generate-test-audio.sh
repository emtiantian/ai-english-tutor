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

if command -v say >/dev/null 2>&1; then
  # macOS 自带 say，支持直接输出 16kHz mono WAV
  say -o "${TMP_WAV}" --data-format=LEI16@16000 "${TEXT}"
elif command -v ffmpeg >/dev/null 2>&1; then
  # 用 ffmpeg 生成 3 秒 440Hz 正弦波（无语义，仅用于格式/连通性测试）
  ffmpeg -y -f lavfi -i "sine=frequency=440:duration=3" \
    -ar 16000 -ac 1 "${TMP_WAV}" >/dev/null 2>&1
else
  echo "[ERROR] 需要 say(macOS) 或 ffmpeg 来生成测试音频" >&2
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
