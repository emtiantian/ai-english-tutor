# Git Hooks（仓库内版本控制）

本目录的 hook 通过 `git config core.hooksPath .githooks` 启用，团队成员一次安装即可共享。

## 安装

```bash
bash scripts/install-githooks.sh
```

或手动：

```bash
git config core.hooksPath .githooks
chmod +x .githooks/post-commit
```

## 卸载

```bash
git config --unset core.hooksPath
```

---

## post-commit：Context Memory 自动 link-commit

每次 `git commit` 之后，自动把最近 60 分钟内创建的、还没有 SHA 关联的 context entry 绑到刚生成的 commit 上。

### 过滤器（6 层，任一命中即跳过）

| # | 跳过 | 原因 |
|---|---|---|
| 1 | merge commit（多父） | 合并不该作为新决策 |
| 2 | revert commit | 回退不应作为原决策的二次记录 |
| 3 | message 含 `[skip-context]` 或 `[no-context]` | 显式 opt-out |
| 4 | message 以 `chore(context):` / `chore(memory):` 开头 | context 系统自身的元提交（防循环） |
| 5 | 改动**全部**在 `.context/` `docs/` `README` `.gitignore` `.gitattributes` `.githooks/*.md` | 纯文档 commit 没真实代码变更 |
| 6 | numstat 总变更行数 < 5 | typo / 空行 / 格式化等 trivial 改动 |

### 显式跳过本次 commit

在 commit message 任意位置加 `[skip-context]`：

```bash
git commit -m "chore: 修个错别字 [skip-context]"
```

### 显式跳过本次 commit（替代写法）

把上面那行改成 `[no-context]` 也一样。

---

## 绑定逻辑

匹配条件（**全部满足**才绑）：

1. 文件 mtime 在最近 60 分钟内
2. 文件内容含 `commits: []`（即未关联）
3. 文件内容含 `status: "active"`

匹配到的每条 entry 都会跑一次 `link-commit`，多条 entry → 同一 commit 也支持。

---

## 边界场景与 gotchas

### `git commit --amend`

- amend 会触发 post-commit
- 如果**第一次**已经成功 link 到原 SHA，entry 的 `commits:` 已不为空 → amend 时 hook 扫描不到那条 entry → 不会 link 到新 SHA
- 结果：entry 关联到一个被 amend 干掉的 orphan SHA
- 解决：amend 之后手动跑：
  ```bash
  python3 ~/.claude/skills/context-memory/scripts/context_manager.py \
    --project-root "$(pwd)" link-commit \
    --entry-id <id> --commit HEAD
  ```
  或者：amend 前先把 entry MD 文件里的旧 SHA 删掉变回 `commits: []`，amend 时 hook 会重新绑。

### `git rebase` / `git cherry-pick`

- 会重写历史 SHA，原绑定全部变 orphan
- 当前 hook **不处理**这种情况
- 严重的 rebase 之后，建议手动重建相关 entry 的 commits 字段

### 一次 commit 横跨多个 entry

- hook 会把时间窗内所有 `commits:[]` 的 entry 都绑到这一次 commit
- 如果不希望某条 entry 被绑：删那条 entry 的 `status: active` 或手动加上一个假 SHA 占位

### 同一 entry 跨多个 commit

- 第一次 commit 后 entry 的 `commits:` 不再为空 → 后续 commit 不会自动追加
- 需要追加：手动跑 `link-commit --entry-id <id> --commit <sha>`，或临时把 entry 的 `commits:` 字段改回 `[]` 让下次 commit 触发

### context_manager 自身的 auto-commit

- `link-commit` 命令内部会再 commit 一次（`chore(context): link-commit ...`）
- 这次 auto-commit 触发 post-commit hook，但被**过滤器 4** 直接跳过
- 不会无限循环 ✅

---

## 调试

想看 hook 跑了什么但不真触发？空 commit 跑：

```bash
git commit --allow-empty -m "test [skip-context]"   # 应该静默退出（过滤器 3 命中）
git commit --allow-empty -m "test"                  # 应该静默退出（过滤器 6 命中：0 < 5 行）
```

要看 hook 输出，正常 commit 时它打印到 stderr：

```
[context] linked ctx-20260617-113704998453-404aca6f → 2bd4912 (部署脚本 v2.1...)
```

如果你想完全关掉 hook 但不卸载：

```bash
chmod -x .githooks/post-commit
```
