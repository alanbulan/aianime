# 代码来源与同步约定

本仓库基于 DramaClaw 上游代码持续演进，并在此基础上进行 DDD 模块化单体重构、桌面端商业能力接入和跨平台打包适配。

## 远端定义

| Remote | 地址 | 用途 |
| --- | --- | --- |
| `origin` | `https://gitee.com/mingcheng_software/ai-manga-desktop.git` | 明程软件主仓，日常开发与发布代码推送到这里 |
| `upstream` | `https://github.com/dramaclaw/dramaclaw.git` | 原始项目上游，只用于拉取和评估更新 |

上游最后审查基线：`30efddcccc58d0106bfe35a5db08c8541aa0c694`（上游提交时间 2026-08-07）。2026-08-09 已执行 `git fetch upstream --prune`，`upstream/main` 仍指向该提交，因此本次没有新增同步项。

## 上游同步流程

```bash
git fetch upstream --prune
git show -s --format="%H %cI %s" upstream/main
git log --oneline 30efddcccc58d0106bfe35a5db08c8541aa0c694..upstream/main
```

当前仓库与上游已经形成独立提交历史，`HEAD..upstream/main` 会列出上游历史分叉中的旧提交，不能直接当成“尚未同步清单”。每次从上次登记的审查基线向新的 `upstream/main` 比较，再按功能逐项移植并更新本文件基线。

不要直接覆盖当前架构，也不要批量合并上游提交。先逐项判断上游改动是否适用于当前产品，再按现有 bounded context、domain、application、infrastructure、presentation 和 composition 边界进行移植。

适配完成后至少执行：

```bash
uv run ruff check src tests desktop/backend
uv run pytest
pnpm --dir frontend typecheck
pnpm --dir frontend test
pnpm --dir frontend build:ce
pnpm --dir desktop typecheck
pnpm --dir desktop test
git diff --check
```

验证通过后提交到 Gitee：

```bash
git push origin master
```

涉及通用能力且适合回馈原项目的改动，应单独整理补丁并经过评审；不要直接向 `upstream` 推送当前商业配置、密钥、发布制品或内部架构代码。
