# AI English Tutor —— .env 模板渲染公共库
# 被 scripts/lib/setup-env.sh 调用。
#
# 用法：
#   source scripts/lib/render-env.sh
#   render_env <template_path> <output_path> <overrides_file>
#
# 行为：
#   1. 读取 template_path（通常是 .env.example）。
#   2. 读取 overrides_file 中的 KEY=value 行。
#   3. 对 template 中每一行：
#      - 如果是 KEY=... 或 # KEY=... 形式，且 KEY 在 overrides_file 中存在，
#        则输出 KEY=<覆盖值>（取消注释）。
#      - 否则原样输出。
#   4. 如果 overrides_file 中有 template 中不存在的 KEY，则追加到输出末尾。
#
# 设计原则：
#   - .env.example 是唯一 canonical 模板，本函数只负责“按模板结构回填用户值”。
#   - 未激活 provider 的变量在模板中通常被注释，只要不被 overrides 命中就会保持注释。
#   - 保留所有注释、空行和分组结构。

# 渲染 .env 模板
# render_env <template_path> <output_path> <overrides_file>
render_env() {
  local template_path="$1"
  local output_path="$2"
  local overrides_file="$3"

  if [ ! -f "${template_path}" ]; then
    echo "[ERROR] 模板文件不存在: ${template_path}" >&2
    return 1
  fi

  if [ ! -f "${overrides_file}" ]; then
    echo "[ERROR] 覆盖文件不存在: ${overrides_file}" >&2
    return 1
  fi

  local tmp_output
  tmp_output=$(mktemp)

  # 用 awk 读取覆盖值并替换模板中的对应行
  awk -v overrides_file="${overrides_file}" '
    BEGIN {
      while ((getline line < overrides_file) > 0) {
        # 只处理 KEY=value 形式，忽略空行和注释
        if (line ~ /^[A-Za-z_][A-Za-z0-9_]*=/) {
          eq = index(line, "=")
          key = substr(line, 1, eq - 1)
          val = substr(line, eq + 1)
          ov[key] = val
        }
      }
      close(overrides_file)
    }

    {
      original = $0
      line = $0
      leading_comment = ""

      # 匹配可选的前导注释和空格：# KEY=... 或 #KEY=... 或 KEY=...
      if (match(line, /^[[:space:]]*#[[:space:]]*/)) {
        leading_comment = substr(line, 1, RLENGTH)
        line = substr(line, RLENGTH + 1)
      }

      # 检查是否是 KEY=... 形式
      if (match(line, /^[A-Za-z_][A-Za-z0-9_]*=/)) {
        eq = index(line, "=")
        key = substr(line, 1, eq - 1)
        if (key in ov) {
          print key "=" ov[key]
          next
        }
      }

      # 未命中覆盖，原样输出
      print original
    }
  ' "${template_path}" > "${tmp_output}"

  # 把 template 中没有的 key 追加到末尾
  while IFS= read -r line || [ -n "${line}" ]; do
    if [[ "${line}" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      local key="${line%%=*}"
      if ! grep -qE "^[[:space:]]*#?[[:space:]]*${key}=" "${template_path}"; then
        echo "" >> "${tmp_output}"
        echo "# 以下变量来自生成脚本，模板中未包含" >> "${tmp_output}"
        echo "${line}" >> "${tmp_output}"
      fi
    fi
  done < "${overrides_file}"

  mv "${tmp_output}" "${output_path}"
}

# 辅助函数：安全地追加 KEY=value 到覆盖文件
# append_override <overrides_file> <key> <value>
append_override() {
  local overrides_file="$1"
  local key="$2"
  local value="$3"
  printf '%s=%s\n' "${key}" "${value}" >> "${overrides_file}"
}

# 辅助函数：从覆盖文件中读取 KEY 的值
# get_override <overrides_file> <key>
get_override() {
  local overrides_file="$1"
  local key="$2"
  grep -E "^${key}=" "${overrides_file}" 2>/dev/null | tail -1 | cut -d= -f2-
}

# 辅助函数：创建空的覆盖文件
# create_overrides_file
# 返回文件路径
init_overrides_file() {
  mktemp
}
