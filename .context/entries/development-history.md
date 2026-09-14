# AI English Tutor 开发记录

## 产品定位

第一版定位为英语场景对话练习工具，核心闭环是：选择场景 → DeepSeek 生成开场和后续回复 → 小米 TTS 播放 → 用户文字或浏览器 ASR 语音输入 → LLM 继续对话 → 查看基础单词和可选回复提示。

课程体系、用户成长、长期学习历史、积分、支付、登录、复杂复习算法、多 LLM、多 TTS Provider 和 TTS 缓存都不进入第一版主流程，只保留必要接口或记录在优化计划中。

## 当前架构

- `apps/tutor-app`：Vue 3 + Vite + Pinia + UnoCSS，负责页面、交互、TTS 播放、浏览器 ASR 和 Live2D。
- `apps/tutor-server`：Fastify + TypeScript，负责场景对话、SSE、DeepSeek、Xiaomi TTS、词汇解析和健康检查。
- `packages/shared`：共享类型、协议、场景数据、模型定义和纯函数。
- `gateway`：Nginx 反向代理，生产环境提供 HTTP/HTTPS、前端静态资源和 `/api` 转发。
- 生产使用 Docker Compose，Node 服务通过 `restart: unless-stopped` 保活，不使用 PM2。

## 已完成的主要迭代

1. 清理旧课程设计，统一角色身份为 `English conversation partner`，去除 AI English teacher 的注入文案。
2. 保留 DeepSeek + Xiaomi TTS + 浏览器 ASR 的最小实际链路；Voice Design 只由用户选择，不由场景决定。
3. 修复浏览器 ASR 长句结果合并；开启中间结果，用户松手后最多等待 2.5 秒收尾，避免 5 秒语句等待 20 秒后 `aborted`。
4. 修复移动端多轮对话滚动和 ASR 错误消息展示。
5. 场景回复继续返回中文翻译、基础词汇和 `studentReplyHints`。
6. 新增 1～3 条可选英文回复提示；提示可以点击播放，不会自动发送，也不写入历史；用户可跟读，也可以忽略后自由回答。
7. 提示语句播放使用独立 TTS 音色，与对话音色区分：
   - `XIAOMI_TTS_HINT_VOICE`
   - `XIAOMI_TTS_HINT_VOICE_DESIGN`
8. 增强 LLM 短暂 DNS/网络故障重试，默认最大重试次数由 2 次提高到 4 次。
9. 删除未引用的性能诊断脚本、未使用的旧场景兼容入口和过时注释。
10. 增加 HTTPS 证书检查和续期脚本，证书由 Let's Encrypt + `acme.sh` 管理，续期后校验 Compose/Nginx 并写日志。

## 线上部署

- SSH：`haohe@100.100.132.72`
- 项目目录：`/home/haohe/data/.ai-english-tutor/app`
- 数据目录：`/home/haohe/data/.ai-english-tutor/data`
- 域名：[https://emengtt.com](https://emengtt.com)
- 证书目录：`/home/haohe/data/.ai-english-tutor/data/certs`
- 证书管理：`/home/haohe/.acme.sh/`，Let's Encrypt，DNS-01，通常 90 天有效。
- 续期 cron：
  `0 3 * * * /home/haohe/data/.ai-english-tutor/app/scripts/deploy/cert-renew.sh emengtt.com`
- 证书日志：`/home/haohe/data/.ai-english-tutor/data/logs/cert-renewal.log`
- 常用部署：`pnpm push:server`

## 已知问题和排查结论

- 服务器只有 IPv6，`emengtt.com` 当前只有 AAAA 记录，没有 A 记录。没有 IPv6 的客户端无法访问，浏览器会出现 `ERR_FAILED` 和 Workbox `no-response`；后者是 Service Worker 对网络失败的二次报错。
- 线上偶发 LLM 失败曾确认是容器 DNS 的 `getaddrinfo EAI_AGAIN api.deepseek.com`，宿主机和容器多数时候可正常解析；当前代码已增加重试，但长期可考虑配置 IPv4 出口/双栈代理并持续监控 DNS。
- 浏览器 ASR 的误识别会直接影响 LLM，例如 `cold` 被识别成 `uncle` 时，LLM 通常只是忠实理解错误转写。当前尚未实现“发送前确认/编辑 ASR 文本”。
- PWA/Service Worker 可能让用户看到旧资源，前端发布后若提示不更新需强制刷新或清理站点缓存。

## 重要提交

- `d8fd655`：删除废弃场景兼容代码
- `4ebfb80`：浏览器 ASR 停止收尾修复
- `d4876b4`：可播放场景回复提示
- `2fe0e51`：LLM 网络故障重试
- `658db85`：提示语句独立音色

## 后续建议

下一步优先验证提示语句在真实手机上的播放和跟读效果，再考虑 ASR 发送前确认。课程设计应保持“短目标表达 → 提示播放/跟读 → 场景应用 → 简短纠错”的方向，避免重新扩展为自由聊天或复杂课程系统。

工程规则以根目录 `AGENTS.md` 为准，产品边界和延后能力以 `doc/优化计划.md` 为准。
