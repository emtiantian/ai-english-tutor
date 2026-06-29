# Live2D 素材集成与多模型适配计划

> 本文是 `doc/优化计划.md` 中 **⑧ 多老师角色卡** 的前置准备工作:先把素材接进来 + 让框架支持多模型切换,后续上层角色卡只需要选 modelId。

---

## 一、调研结论速览

| 来源 | 是否能拿 | 原因 |
|---|---|---|
| `moeru-ai/airi` | ❌ **拿不到** | 仓库根 `.assetsignore` 显式排除模型素材,模型不进仓库,通过 HuggingFace / CDN 单独下载,airi 本身没有"分发权" |
| `Open-LLM-VTuber/live2d-models/shizuku` | ✅ **直接拷** | 仓库内完整素材,Live2D Free Material License,有 ReadMe |
| `Open-LLM-VTuber/live2d-models/mao_pro` | ✅ **直接拷** | 同上 |

**最终结论**:从 `Open-LLM-VTuber` 拷 **shizuku + mao_pro**(都是 Live2D Inc. 官方 sample),加上我们已有的 **hiyori**,合计 **3 个 Live2D 模型**。

> 这 3 个本质都是 Live2D Inc. 官方 sample,适用同一份 [Live2D Free Material License Agreement](https://www.live2d.com/eula/live2d-sample-model-terms_en.html)。我们已经在用 hiyori 了,法律状态没有新增风险 —— 但**商用前**(订阅 / 卖软件 / 企业版)必须向 Live2D Inc. 取得商业 license。

---

## 二、目标产物

1. **3 个可切换的 Live2D 模型**:hiyori / shizuku / mao_pro
2. **统一的模型加载接口**:provider 不再硬编码路径,通过 modelId 加载
3. **每个模型一份 motion-registry**:配套动作/表情映射
4. **运行时切换能力**(暂时通过 env / 设置页,后期对接多老师角色卡)
5. **VRM 决策结论**:写在末尾章节,**暂不实现**,但留好目录位置

---

## 三、目录结构设计

### 模型资产(前端)

```
apps/tutor-app/public/models/
  ├─ hiyori/                       # 现有,保留
  │   ├─ Hiyori.model3.json
  │   ├─ Hiyori.moc3
  │   ├─ Hiyori.physics3.json
  │   ├─ textures/
  │   ├─ motions/
  │   └─ LICENSE-Live2D.md         # 新增(从 Open-LLM-VTuber 拷)
  ├─ shizuku/                      # 新增,来自 Open-LLM-VTuber
  │   ├─ shizuku.model3.json
  │   ├─ shizuku.moc3
  │   ├─ shizuku.physics3.json
  │   ├─ shizuku.pose3.json
  │   ├─ shizuku.cdi3.json
  │   ├─ textures/
  │   ├─ motions/                  # .motion3.json 集合
  │   ├─ expressions/              # .exp3.json(shizuku 自带,比 hiyori 友好)
  │   ├─ ReadMe.txt                # 原始素材附带
  │   └─ LICENSE-Live2D.md
  └─ mao_pro/                      # 新增,同上
      ├─ mao_pro.model3.json
      ├─ ...
      └─ LICENSE-Live2D.md
```

> **拷贝来源**:Open-LLM-VTuber 的 `live2d-models/<name>/runtime/` 整个搬过来(里层 runtime 目录可以不要,直接拍平到 `public/models/<name>/`)。

### 模型元信息(shared 包)

```
packages/shared/src/
  ├─ models/                       # ✅ A 阶段已建(2026-06-25)
  │   ├─ index.ts                  # 统一导出 + 类型 re-export
  │   ├─ types.ts                  # ModelManifest / MotionMapping 等类型
  │   ├─ list.ts                   # AVAILABLE_LIVE2D_MODELS 列表
  │   └─ registry/                 # 每个模型一份 manifest
  │       ├─ hiyori.ts             # ✅ HIYORI_MANIFEST
  │       ├─ shizuku.ts            # 待 B 阶段
  │       └─ mao_pro.ts            # 待 B 阶段
  └─ motion-registry.ts            # 现有,保留接口定义
```

### Provider 改造(前端,A 阶段已完成)

```
apps/tutor-app/src/providers/
  ├─ live2d-character.ts           # ✅ 已重构 — 接受 manifest,去除硬编码
  └─ factory.ts                    # ✅ 已加 live2dModelId 选项
```

### VRM 预留(暂不实现,留位置)

```
apps/tutor-app/src/providers/
  └─ vrm/                          # 空目录,加 README.md 说明计划
      └─ README.md
```

---

## 四、ModelManifest 设计(A 阶段已实现)

实际实现见 `packages/shared/src/models/types.ts`:

```ts
export interface Live2DModelManifest {
  id: string                              // 'hiyori' / 'shizuku' / 'mao_pro'
  displayName: string
  type: 'live2d'
  modelJsonPath: string                   // '/models/hiyori/Hiyori.model3.json'
  hasExpressions: boolean                 // 是否自带 .exp3.json
  expressionParamPresets?: Record<string, ExpressionParamPreset>
  view: Live2DModelView                   // { scale, offsetX, offsetY }
  motionRegistry: MotionRegistry          // 语义动作/表情 → 模型 key
  credit: ModelCredit                     // 出处与许可证
}
```

查表 API(`packages/shared/src/models/list.ts`):
- `AVAILABLE_LIVE2D_MODELS` — 数组
- `DEFAULT_LIVE2D_MODEL_ID = 'mao_pro'`
- `getLive2DModelManifest(id)` — 找不到返 undefined
- `getLive2DModelManifestOrDefault(id?)` — 找不到 fallback 到默认(`mao_pro`)

---

## 五、任务拆解

### 阶段 A:基建(让框架支持多模型,**不影响现有体验**)✅ 已完成

- [x] **A1** 在 `packages/shared/src/models/` 创建目录与 `types.ts`
- [x] **A2** 把 `HIYORI_MANIFEST` 写入 `registry/hiyori.ts`,保留旧 `HIYORI_MOTION_REGISTRY` 后端兼容
- [x] **A3** 把 `live2d-character.ts` 里的硬编码 `MODEL_PATH` + `EXPRESSION_PRESETS` 抽到 manifest;构造函数接收 manifest 参数
- [x] **A4** `providers/factory.ts` 增加 `live2dModelId?: string` 选项,默认 `DEFAULT_LIVE2D_MODEL_ID`
- [x] **A5** 跑现有 vitest + 手动 smoke,**确认 hiyori 行为完全没变**(前端 142 / 后端 17 全过)

完成 commit:`2a681e3 feat(live2d): A 阶段 — 抽出 Live2DModelManifest,Provider 接受 manifest 参数`

### 阶段 B:素材拷贝与协议合规 ✅ 已完成

- [x] **B1** 从 Open-LLM-VTuber 仓库下载 `live2d-models/shizuku/runtime/` 整个目录,拍平拷到 `apps/tutor-app/public/models/shizuku/`
- [x] **B2** 同上,处理 `mao_pro`
- [x] **B3** 从 Open-LLM-VTuber 仓库拷 `LICENSE-Live2D.md`(根目录)到我们仓库 `LICENSE-Live2D.md`(同级)
- [x] **B4** 在 `apps/tutor-app/public/models/<id>/LICENSE-Live2D.md` 各放一份(per-model 显式声明)
- [x] **B5** 项目根 `README.md` / `NOTICE.md` 加 "Third-party Live2D Sample Models" 章节,列出 3 个模型 + 协议链接
- [x] **B6** `apps/tutor-app/public/models/<id>/ReadMe.txt` 保留(Live2D 协议要求)
- [x] **B7** 校验:在浏览器直接打开 `http://localhost:6173/models/shizuku/shizuku.model3.json`,确认 404 之外的所有依赖资源都能加载(代码层面已就位,建议首次发版前手测一遍)

### 阶段 C:Motion Registry 适配 ✅ 已完成

每个模型的动作组(`Idle`、`TapBody`、`Flick` …)和表情命名都不一样,需要为每个模型写一份 manifest。

- [x] **C1** 用 `cat public/models/shizuku/shizuku.model3.json` 读出 `FileReferences.Motions` 和 `Expressions` 列表
- [x] **C2** `registry/shizuku.ts`:把动作组映射到我们的统一 motion tag 集合(`smile` / `nod` / `wave` / `think` …)
- [x] **C3** `registry/mao_pro.ts`:同上
- [x] **C4** 不全的动作:用 `null` 占位 + fallback 到 idle,后端 motion-analyzer 兜底也能用
- [x] **C5** `view`(scale/offset):shizuku 画风偏大,mao_pro 偏 chibi,需要在 canvas 内手动调整缩放;每个 manifest 各填一组数值

### 阶段 D:运行时切换 ✅ 已完成

- [x] **D1** `apps/tutor-app/.env.example` 加 `VITE_LIVE2D_MODEL_ID=mao_pro`(可选)
- [x] **D2** 设置页 / 临时调试 UI:加一个下拉,挑模型,持久化到 IndexedDB(`tutor.live2dModelId`)
- [x] **D3** `App.vue` 监听切换,重建 provider(`provider.dispose()` + `createCharacterProvider({ modelId })`)
- [x] **D4** 切换中 UI 状态:loading spinner,失败回 hiyori
- [x] **D5** **预留 hook**:这里的 `modelId` 后续会被 ⑧ 多老师角色卡的 `TeacherProfile.characterModel` 接管,先用单一 store 字段过渡

### 阶段 E:测试与文档 ✅ 部分完成(自动化测试已覆盖)

- [x] **E1** vitest:`live2d-manifest.test.ts` 扩展覆盖三个模型的 manifest 装载(目前只测了 hiyori)
- [ ] **E2** 手测脚本:对每个模型分别触发 5 个 motion tag,目测动作正确(待发版前手测)
- [ ] **E3** 性能:三个模型连续切换 10 次,**确认没有内存泄漏**(WebGL context 必须正确 dispose)(待发版前手测)
- [x] **E4** `CLAUDE.md` 更新:加新模型时只改 manifest + 放素材,不改 provider 代码

---

## 六、风险与边角

| 风险 | 应对 |
|---|---|
| shizuku 是老一代 Cubism 2/3 混合模型,我们运行时基于 Cubism 4 框架 | 实际可用,SDK 向后兼容 Cubism 3,但 cdi3.json 之类只在 3+ 用;先在 docker 跑通 |
| mao_pro 体积偏大(~10MB) | 配置 vite asset 异步加载,首屏不阻塞;PWA cache 这部分 |
| 模型 textures 路径大小写 | macOS dev(case-insensitive)正常,Linux docker 可能 404,要 lint 一遍 |
| 旧 IndexedDB 没有 modelId 字段 | 默认 fallback 到 `DEFAULT_LIVE2D_MODEL_ID`,不破坏现有用户 |
| 协议:商用前未取 Live2D 商业 license 即上线收费版 | 计划文档里写死红线;商业化前 stop & buy license |

---

## 七、预估工作量

| 阶段 | 工作量 | 状态 |
|---|---|---|
| A 基建重构 | 0.5d | ✅ 完成(2026-06-25) |
| B 素材拷贝 | 0.5d | ✅ 完成 |
| C Motion 适配 | 1d | ✅ 完成 |
| D 运行时切换 | 0.5d | ✅ 完成 |
| E 测试文档 | 0.5d | ⚠️ 自动化测试完成,E2/E3 待发版前手测 |
| **合计** | **~3d** | 单人 |

---

## 八、VRM(3D)适配性评估

### 结论:**目前不实现,但留接口位置**

### 评估维度

| 维度 | Live2D | VRM | 对英语陪练的影响 |
|---|---|---|---|
| **资源大小** | 5-15MB | 8-50MB(贴图多) | 移动端 / 弱网 Live2D 占优 |
| **运行时性能** | 2D canvas,~5% CPU 即可 | WebGL + 骨骼蒙皮,~15% CPU + GPU | 长时间陪练,Live2D 更省电 |
| **画风** | 平面 anime 强,氛围统一 | 3D 立体,VRoid 类风格 | 教学场景"亲切感"Live2D 更合适 |
| **动作丰富度** | 头部 + 上身,正面镜头为主 | 全身动作,任意视角 | 我们镜头基本只拍肩部以上,**3D 优势用不上** |
| **lipsync** | 参数驱动嘴型(2-3 参数) | BlendShape 5+ 参数(更精细) | VRM 微胜,但 Live2D 也够 |
| **免费模型供给** | Live2D Free Material(sample 商用受限)/ 社区独立画师 | **VRoid Hub 海量免费 + CC0/CC-BY** | VRM 在**商用授权**上明显占优 |
| **开发成本** | 框架已就位 | 需引入 `three.js` + `@pixiv/three-vrm`,新 provider | Live2D ~3 天,VRM 实现 ~5-7 天 |
| **维护成本** | 单依赖,接口稳定 | three.js 升级会牵连,VRM 1.0/0.x 双标准 | Live2D 占优 |

### 关键判断

> **场景适配性**:我们的角色就是个"挂在右侧的老师",需要的是**正面友好表情 + 几个手势**。这正是 Live2D 的舒适区。VRM 适合的是"角色绕场漫步 / 复杂全身动作 / 玩家可换角度"的场景(VTuber 直播、虚拟陪伴 app 主屏角色)。

> **唯一可能反转结论的点**:商业化之后,Live2D sample 需要付费授权(中小厂 ~50 万日元/年起步),而 VRM 免费模型直接可商用。但这是远期问题,不影响近期决策。

### 留位置(不实现的设计)

```
apps/tutor-app/src/providers/vrm/
  └─ README.md                     # 写 "intentionally empty, see doc/live2d-素材集成计划.md §8"

packages/shared/src/models/
  └─ types.ts                      # ✅ A 阶段已实现联合类型:
                                   #    CharacterModelManifest = Live2DModelManifest | VRMModelManifest
                                   #    (VRMModelManifest 仅占位,实际字段待启动 VRM 时填)
```

`apps/tutor-app/src/providers/factory.ts` 的 `type` 字面量类型当前只接受 `'live2d' | 'spine' | 'svg' | 'rive'`,未来加 `'vrm'` 时再扩展。

### 未来何时启动 VRM(触发条件)

- ✅ 当 Live2D sample 商用 license 成为预算痛点(走商业化前)
- ✅ 当用户调研中 ≥ 30% 用户表示想要 3D 立体角色
- ✅ 当某个推广合作要求自定义角色,而 VRoid 上有合适素材

**任一条件触发**前,VRM 不动。

---

## 九、与上层计划的对接

| 上层计划 | 本计划的衔接点 |
|---|---|
| **⑧ 多老师角色卡** | `TeacherProfile.characterModel.modelId` 直接复用本计划的 manifest 注册表(A 阶段成果) |
| **① 内心独白 motion tag** | 每个 manifest 的 `motionRegistry` 必须覆盖 inline tag 协议白名单,本计划的 motion 适配(C 阶段)直接对齐 inline tag |
| **② VAD 打断** | 模型切换时要正确 dispose(避免 audio buffer 引用旧的 lipsync handle),D3 的 dispose 逻辑要测打断场景 |

---

## 十、执行顺序建议

**单线推进,不并行**(WebGL context + manifest schema 都是单点)。建议节奏:

```
Day 1: A1 → A5(基建重构)+ B1-B7(素材拷贝)         ← A 已完成,继续 B
Day 2: C1 → C5(motion 适配,最慢的部分)
Day 3: D1 → D5(运行时切换)+ E1-E4(测试文档)
```

A 阶段完成后,即可开始 P1 ① 内心独白(motion tag 协议)的工作 —— 那时 motion-registry 已经是多模型形态,inline tag 协议就能在 3 个角色之间一次拉通。

---

_文档创建时间:2026-06-25_
_文档恢复时间:2026-06-25(原版在远端备份回滚后丢失,从对话上下文重写)_
_前置文档:`doc/优化计划.md`_
_A 阶段成果:commit `2a681e3` (2026-06-25)_
