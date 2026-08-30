# AI Anime Desktop 工程指令

`AGENTS.md` 与 `CLAUDE.md` 是面向不同编码代理的字节级一致入口。修改任一
文件时必须同步另一文件；详细规则只保存在 `.aigo/` 与各技术栈目录中。

## 必须加载的上下文

1. 非简单任务先读 `.aigo/AI_CODING_CONTEXT.md`。
2. 按其中的路由表只读取与当前任务相关的 `.aigo/rules/*.md`。
3. 涉及 Python、前端或 Electron 时，分别读取
   `src/ai_anime/AGENTS.md`、`frontend/AGENTS.md` 或 `desktop/AGENTS.md`。
4. 涉及发布、上游同步或当前架构事实时，再读取 `README.md`、`UPSTREAM.md`
   或对应的 `docs/architecture/` 文档。

## 仓库级不变量

- Python 环境由仓库根目录的 `uv.lock` 管理。Python、Pytest、Ruff 命令必须
  通过 `uv run` 执行；不要用未激活环境下的全局 `python`、`pip` 或 `pytest`。
- Node 依赖分别由 `frontend/pnpm-lock.yaml` 与 `desktop/pnpm-lock.yaml` 管理，
  使用对应目录的 `pnpm` 脚本，不绕过锁文件或标准测试入口。
- 业务代码遵循既有 DDD 所有权与
  `domain/application/infrastructure/presentation/composition/public` 分层；跨上下文
  调用只经过目标上下文的 `public.py` 或 `public.ts`。
- FastAPI route、React route 与 Electron 组合根保持薄层，不复制用例或领域规则。
- 不恢复已移除的旧路径、兼容 re-export、第二套请求链路或无业务含义的 facade。
- 只修改当前任务直接相关内容，保留工作树中的既有改动。新增依赖、破坏性数据
  或配置变更、真实 Gateway/付费模型调用、发布操作必须先确认。
- 代码、配置、测试和命令输出是判断依据。若文档与实现冲突，先指出漂移，不猜测。

## 验证底线

- 先运行与改动直接相关的最小测试，再按风险补充类型检查、架构门禁或构建。
- Windows 上让 Pytest、Vitest 和 TypeScript 串行运行，避免资源争抢导致假失败。
- 后端测试使用 `uv run pytest ...`；前端和桌面分别使用
  `pnpm --dir frontend ...`、`pnpm --dir desktop ...`。
- 结束前运行与改动范围相符的检查，并执行 `git diff --check`。
- 未实际运行的检查不得表述为已通过；单元测试不能替代真实 Gateway 联调、安装包
  冒烟或人工工作流验收。
