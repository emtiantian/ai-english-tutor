# 项目问题清单（Code Review）

> 生成时间：2026-06-16  
> 状态说明：所有问题初始状态为 **未解决**。修复后请手动改为 **已解决** 并填写解决时间。已关闭的条目已从此清单中移除。

---

### 11. 后端核心模块测试覆盖不足

- **状态**：已解决
- **生成时间**：2026-06-15
- **解决时间**：2026-06-16
- **范围**：`apps/tutor-server/src/ai/`、`apps/tutor-server/src/routes/`
- **问题**：虽然新增了部分测试文件，但 `TutorEngine`、`AudioPipeline`、`VocabTracker` 等核心业务逻辑仍缺乏单元测试，重构风险高。
- **修复建议**：为以下模块补齐测试：
  - `src/ai/vocab-tracker.ts` — 精确、词干、模糊匹配
  - `src/ai/response-parser.ts` — JSON 提取、回退逻辑
  - `src/ai/audio-pipeline.ts` — 音频切片广播流程
  - `src/ai/engine.ts` — 会话流转、流式/非流式响应

---

### 13. 无身份验证，用户 ID 由客户端自生成

- **状态**：未解决
- **生成时间**：2026-06-15
- **解决时间**：_
- **文件**：`apps/tutor-app/src/stores/tutor.ts`（第 40-51 行）、`apps/tutor-server/src/routes/vocab.ts`
- **问题**：`userId` 用 `Date.now()` + `Math.random()` 在前端 localStorage 生成并持久化。服务端仅凭 userId 即可读写任何人的词汇进度，没有认证授权机制。
- **修复建议**：
  - 短中期：使用 signed token / JWT，服务端校验签名
  - 长期：接入真实用户系统（OAuth、手机号等）
