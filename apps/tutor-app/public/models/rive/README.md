# Rive 角色文件放置处

`VITE_CHARACTER_PROVIDER=rive` 时，`RiveCharacterProvider` 会加载这里的 `.riv` 文件。

- 默认路径：`/models/rive/tutor.riv`（可用 `VITE_RIVE_SRC` 覆盖）
- 默认状态机：`State Machine 1`（可用 `VITE_RIVE_STATE_MACHINE` 覆盖）
- 文件不存在 / 加载失败时，会自动降级到 SVG 占位（见 `createCharacterProviderSafe`）

## 状态机输入命名约定

在 Rive 编辑器里给状态机加以下 **Inputs**，运行时会被自动写入（按名字查找，缺哪个就忽略哪个）：

| 输入名       | 类型    | 含义 / 取值                                                                                    |
| ------------ | ------- | ---------------------------------------------------------------------------------------------- |
| `mouth`      | Number  | 口型张开度 0..1（由 TTS 播放 / 录音音量驱动，做 lip-sync）                                     |
| `speaking`   | Boolean | 是否正在说话（可驱动点头、嘴动 idle）                                                          |
| `listening`  | Boolean | 是否正在听用户说（可驱动前倾、注视）                                                           |
| `thinking`   | Boolean | 是否在思考（等待 LLM）                                                                         |
| `emotion`    | Number  | 表情索引：0 neutral / 1 happy / 2 curious / 3 surprised / 4 encouraging / 5 thoughtful / 6 sad |
| `<motionId>` | Trigger | 动作触发器，名字 = 动作语义 ID（如 `wave`、`surprised`、`think`）                              |

> 表情索引映射见 `src/providers/rive-character.ts` 的 `EMOTION_INDEX`。
> 动作语义 ID 见 `@ai-english-tutor/shared` 的 MotionRegistry。

## 哪里找 / 做 .riv

- Rive 社区有免费可商用的角色：https://rive.app/community/
- 或在 https://editor.rive.app 自己做一个，按上表加好 Inputs 即可即插即用。
