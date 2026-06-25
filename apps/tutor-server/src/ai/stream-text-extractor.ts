/**
 * Streaming JSON `text` field extractor.
 *
 * The teaching/scenario prompts force the LLM to respond with a JSON object
 * shaped like `{"text": "...", "textZh": "...", "vocabulary": [...]}`.
 * Some models (notably reasoning-style ones, even in non-`<think>` mode)
 * dump a stretch of plain reasoning prose BEFORE the JSON object.
 *
 * Without filtering, that prose plus the JSON syntax characters and other
 * fields all leak into `teacher.chunk` SSE events and show up live in the
 * chat bubble until `teacher.response` finalizes and replaces it.
 *
 * This extractor walks the streamed bytes through a small state machine
 * and yields ONLY the decoded characters of the top-level `text` field
 * value, one chunk at a time. Everything else — the reasoning prefix,
 * the braces, the keys/colons/quotes, the other field values — is
 * silently swallowed.
 *
 * Design notes:
 * - Pure synchronous string processing, no JSON.parse, no allocations
 *   beyond the buffer and a small accumulator.
 * - Resilient to chunk boundaries that split escape sequences (`\n`,
 *   `\uXXXX`), the `"text":"` literal, the value's closing quote, etc.:
 *   the cursor only advances over fully-consumable bytes; partial trailing
 *   bytes are kept in the buffer until the next push().
 * - If the LLM never emits `{` or never emits a `"text"` key, the
 *   extractor never emits anything — the caller still has the raw
 *   accumulated content via the LLM stream's chunks for `parseTeachingResponse`
 *   to do a non-streaming fallback parse, which feeds `teacher.response`.
 */

const PHASE_SEEK_OBJ = 0 // before the first `{`
const PHASE_TOP = 1 // inside `{}`, between fields, expecting a key string or `}`
const PHASE_KEY = 2 // inside a key string `"..."` (collecting key chars)
const PHASE_AFTER_KEY = 3 // after key's closing `"`, scanning ws then `:`
const PHASE_AFTER_COLON = 4 // after `:`, scanning ws then value start
const PHASE_TEXT_VAL = 5 // inside the text field's string value (emit chars)
const PHASE_OTHER_STR = 6 // inside a non-text string value (discard)
const PHASE_OTHER_NESTED = 7 // inside an object/array value (discard, depth-tracked)
const PHASE_OTHER_PRIM = 8 // inside a number/true/false/null value (discard)
const PHASE_DONE = 9 // text value seen and closed; ignore everything else

const ESCAPE_MAP: Record<string, string> = {
  n: '\n',
  t: '\t',
  r: '\r',
  b: '\b',
  f: '\f',
  '"': '"',
  '\\': '\\',
  '/': '/',
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
   * Append a raw LLM chunk and return any newly-decoded `text` field
   * characters. Returns `''` if this chunk produced nothing visible
   * (e.g. it was reasoning prefix, a key, whitespace, or a non-text value).
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
            // object closed without a `text` field — nothing more to extract
            this.phase = PHASE_DONE
            this.cursor++
            return out
          } else if (isWs(ch) || ch === ',') {
            // whitespace or `,` between fields
            this.cursor++
          } else {
            // The `{` we entered on was a false positive — e.g. the model
            // wrote reasoning prose containing a literal `{`. Reset and
            // resume seeking the real top-level JSON object instead of
            // silently swallowing arbitrary characters here.
            this.phase = PHASE_SEEK_OBJ
            this.cursor++
          }
          break
        }

        case PHASE_KEY: {
          if (ch === '\\') {
            // need at least one more char for the escape sequence
            if (this.cursor + 1 >= this.buffer.length) return out
            // We only care whether the key equals "text"; that key has no
            // escapes, so we can append the literal escaped char and any
            // mismatch just won't equal "text".
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
            // malformed input; bail
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
            // nested structured value — text is always a string per our schema,
            // so currentKeyIsText hitting this is malformed; either way we skip.
            this.phase = PHASE_OTHER_NESTED
            this.depth = 1
            this.insideNestedString = false
            this.cursor++
          } else {
            // primitive (number/true/false/null) — let PHASE_OTHER_PRIM
            // re-read this same char on the next loop iteration
            this.phase = PHASE_OTHER_PRIM
          }
          break
        }

        case PHASE_TEXT_VAL: {
          if (ch === '\\') {
            // need at least 2 chars for any escape; \u needs 6
            if (this.cursor + 1 >= this.buffer.length) return out
            const next = this.buffer[this.cursor + 1]
            if (next === 'u') {
              if (this.cursor + 6 > this.buffer.length) return out
              const hex = this.buffer.substring(this.cursor + 2, this.cursor + 6)
              if (/^[0-9a-fA-F]{4}$/.test(hex)) {
                out += String.fromCharCode(parseInt(hex, 16))
              } else {
                // malformed unicode escape — emit it literally so we don't drop content
                out += this.buffer.substring(this.cursor, this.cursor + 6)
              }
              this.cursor += 6
            } else {
              out += ESCAPE_MAP[next] ?? next
              this.cursor += 2
            }
          } else if (ch === '"') {
            // end of text value — we have everything we need
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
            // end of primitive — re-dispatch the terminator under PHASE_TOP
            this.phase = PHASE_TOP
          } else {
            this.cursor++
          }
          break
        }

        default: {
          // unreachable
          this.cursor++
        }
      }
    }

    return out
  }

  /**
   * Called when the LLM stream signals end. There is no buffered partial
   * output in this implementation (we only ever return fully-decoded
   * characters), so this is a no-op returning `''`. Kept for API symmetry.
   */
  flush(): string {
    return ''
  }
}
