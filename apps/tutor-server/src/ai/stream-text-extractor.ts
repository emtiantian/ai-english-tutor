/**
 * 流式 JSON `text` 字段提取器。
 *
 * 教学/场景 prompt 强制 LLM 以形如 `{"text": "...", "textZh": "...", "vocabulary": [...]}`
 * 的 JSON 对象响应。某些模型（尤其是推理风格模型，即使不在 `<think>` 模式下）会在 JSON 对象前
 * 输出一段纯推理文本。
 *
 * 不过滤的话，这段文本加上 JSON 语法字符和其他字段都会泄漏到 `teacher.chunk` SSE 事件中，
 * 并在聊天气泡里实时显示，直到 `teacher.response` 最终完成并替换它。
 *
 * 本提取器通过一个小型状态机遍历流式字节，每次只产出顶层 `text` 字段值解码后的字符。
 * 其余所有内容 — 推理前缀、花括号、键/冒号/引号、其他字段值 — 都会被静默吞掉。
 *
 * 设计说明：
 * - 纯同步字符串处理，不调用 JSON.parse，除缓冲区和一个小型累加器外无额外分配。
 * - 对分块边界健壮：即使转义序列（`\n`、`\uXXXX`）、`"text":"` 字面量、值的结束引号等
 *   被拆分到不同 chunk，光标也只前进完全可消费的字节；尾部不完整字节保留在缓冲区中，
 *   等待下一次 push()。
 * - 若 LLM 从未输出 `{` 或从未输出 `"text"` 键，提取器也不会输出任何内容 — 调用方仍可通过
 *   LLM 流的 chunk 获得原始累积内容，供 `parseTeachingResponse` 进行非流式降级解析，
 *   从而生成 `teacher.response`。
 */

const PHASE_SEEK_OBJ = 0 // 在第一个 `{` 之前
const PHASE_TOP = 1 // 在 `{}` 内部、字段之间，期待键字符串或 `}`
const PHASE_KEY = 2 // 在键字符串 `"..."` 内部（收集键字符）
const PHASE_AFTER_KEY = 3 // 在键的结束 `"` 之后，跳过空白再找 `:`
const PHASE_AFTER_COLON = 4 // 在 `:` 之后，跳过空白再找值起始
const PHASE_TEXT_VAL = 5 // 在 text 字段的字符串值内部（输出字符）
const PHASE_OTHER_STR = 6 // 在非 text 字符串值内部（丢弃）
const PHASE_OTHER_NESTED = 7 // 在对象/数组值内部（丢弃，跟踪深度）
const PHASE_OTHER_PRIM = 8 // 在 number/true/false/null 值内部（丢弃）
const PHASE_DONE = 9 // 已看到并关闭 text 值；忽略其余所有内容

const ESCAPE_MAP: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  '"': '"',
  '\\': '\\',
  '/': '/'
}

function isWs(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r'
}

export class JsonTextStreamExtractor {
  private buffer = ''
  private cursor = 0
  private phase: number = PHASE_SEEK_OBJ
  private currentKey = ''
  private currentKeyIsText = false
  private depth = 0
  private insideNestedString = false

  /**
   * 追加一段原始 LLM chunk，并返回新解码出的 `text` 字段字符。
   * 若该 chunk 未产生可见内容（例如是推理前缀、键、空白或非 text 值），则返回 `''`。
   */
  push(rawChunk: string): string {
    if (this.phase === PHASE_DONE) return ''
    this.buffer += rawChunk
    let out = ''

    while (this.cursor < this.buffer.length) {
      const ch = this.buffer[this.cursor]

      switch (this.phase) {
        case PHASE_SEEK_OBJ: {
          if (ch === '{') this.phase = PHASE_TOP
          this.cursor++
          break
        }

        case PHASE_TOP: {
          if (ch === '"') {
            this.phase = PHASE_KEY
            this.currentKey = ''
            this.cursor++
          } else if (ch === '}') {
            // 对象已关闭但没有 `text` 字段 — 无需继续提取
            this.phase = PHASE_DONE
            this.cursor++
            return out
          } else if (isWs(ch) || ch === ',') {
            // 字段之间的空白或 `,`
            this.cursor++
          } else {
            // 我们进入的 `{` 是误报 — 例如模型写了包含字面量 `{` 的推理文本。
            // 重置并继续寻找真正的顶层 JSON 对象，而不是在此静默吞掉任意字符。
            this.phase = PHASE_SEEK_OBJ
            this.cursor++
          }
          break
        }

        case PHASE_KEY: {
          if (ch === '\\') {
            // 转义序列至少需要再多一个字符
            if (this.cursor + 1 >= this.buffer.length) return out
            // 我们只关心键是否等于 "text"；该键没有转义，因此可以直接追加字面转义字符，
            // 任何不匹配都不会等于 "text"。
            this.currentKey += this.buffer[this.cursor + 1]
            this.cursor += 2
          } else if (ch === '"') {
            this.currentKeyIsText = this.currentKey === 'text'
            this.phase = PHASE_AFTER_KEY
            this.cursor++
          } else {
            this.currentKey += ch
            this.cursor++
          }
          break
        }

        case PHASE_AFTER_KEY: {
          if (ch === ':') {
            this.phase = PHASE_AFTER_COLON
            this.cursor++
          } else if (isWs(ch)) {
            this.cursor++
          } else {
            // 输入格式错误；退出
            this.phase = PHASE_DONE
            return out
          }
          break
        }

        case PHASE_AFTER_COLON: {
          if (isWs(ch)) {
            this.cursor++
          } else if (ch === '"') {
            this.phase = this.currentKeyIsText ? PHASE_TEXT_VAL : PHASE_OTHER_STR
            this.cursor++
          } else if (ch === '{' || ch === '[') {
            // 嵌套结构化值 — 根据我们的 schema，text 始终是字符串，因此 currentKeyIsText
            // 走到这里属于格式错误；无论如何都跳过。
            this.phase = PHASE_OTHER_NESTED
            this.depth = 1
            this.insideNestedString = false
            this.cursor++
          } else {
            // 原始值（number/true/false/null）— 让 PHASE_OTHER_PRIM 在下次循环中重新读取同一个字符
            this.phase = PHASE_OTHER_PRIM
          }
          break
        }

        case PHASE_TEXT_VAL: {
          if (ch === '\\') {
            // 任意转义至少需要 2 个字符；\u 需要 6 个
            if (this.cursor + 1 >= this.buffer.length) return out
            const next = this.buffer[this.cursor + 1]
            if (next === 'u') {
              if (this.cursor + 6 > this.buffer.length) return out
              const hex = this.buffer.substring(this.cursor + 2, this.cursor + 6)
              if (/^[0-9a-fA-F]{4}$/.test(hex)) {
                out += String.fromCharCode(parseInt(hex, 16))
              } else {
                // 格式错误的 unicode 转义 — 原样输出，避免丢失内容
                out += this.buffer.substring(this.cursor, this.cursor + 6)
              }
              this.cursor += 6
            } else {
              out += ESCAPE_MAP[next] ?? next
              this.cursor += 2
            }
          } else if (ch === '"') {
            // text 值结束 — 已获取所需全部内容
            this.phase = PHASE_DONE
            this.cursor++
            return out
          } else {
            out += ch
            this.cursor++
          }
          break
        }

        case PHASE_OTHER_STR: {
          if (ch === '\\') {
            if (this.cursor + 1 >= this.buffer.length) return out
            this.cursor += 2
          } else if (ch === '"') {
            this.phase = PHASE_TOP
            this.cursor++
          } else {
            this.cursor++
          }
          break
        }

        case PHASE_OTHER_NESTED: {
          if (this.insideNestedString) {
            if (ch === '\\') {
              if (this.cursor + 1 >= this.buffer.length) return out
              this.cursor += 2
            } else if (ch === '"') {
              this.insideNestedString = false
              this.cursor++
            } else {
              this.cursor++
            }
          } else if (ch === '"') {
            this.insideNestedString = true
            this.cursor++
          } else if (ch === '{' || ch === '[') {
            this.depth++
            this.cursor++
          } else if (ch === '}' || ch === ']') {
            this.depth--
            this.cursor++
            if (this.depth === 0) this.phase = PHASE_TOP
          } else {
            this.cursor++
          }
          break
        }

        case PHASE_OTHER_PRIM: {
          if (ch === ',' || ch === '}') {
            // 原始值结束 — 在 PHASE_TOP 下重新分发终止符
            this.phase = PHASE_TOP
          } else {
            this.cursor++
          }
          break
        }

        default: {
          // 不可达
          this.cursor++
        }
      }
    }

    return out
  }

  /**
   * 在 LLM 流发出结束信号时调用。本实现中没有缓冲的部分输出（只返回完全解码的字符），
   * 因此这是一个返回 `''` 的空操作。为 API 对称性保留。
   */
  flush(): string {
    return ''
  }
}
