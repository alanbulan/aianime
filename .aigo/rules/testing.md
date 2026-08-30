# 测试与环境规则

## 基线

- 先证明命令运行在仓库锁定环境，再解释测试失败。Python 使用 `uv run`，Node 使用对应
  子项目的 `pnpm --dir` 脚本。
- 定向验证优先：覆盖修改行为、相邻合同和已知回归路径。架构、接口、持久化、IPC 或
  发布边界变化时再扩大到对应门禁或全量套件。
- 不因环境失败修改业务逻辑或测试语义；先核对解释器、插件、工作目录、锁文件和标准
  入口。
- Windows 上按 Pytest、前端 Vitest/TypeScript、桌面测试的顺序串行执行大型检查。

## 变更到验证的映射

| 变更 | 最小验证 |
| --- | --- |
| 文档和 AI 指令 | `uv run pytest tests/architecture/test_agent_guidance.py -q`、`git diff --check` |
| Python 业务逻辑 | 修改文件 Ruff、相关 Pytest |
| FastAPI/合同 | 相关 API/contract 测试，必要时 OpenAPI 架构测试 |
| Python 分层或跨上下文 | `uv run pytest tests/architecture -q` |
| React 领域或应用逻辑 | 对应 Unit/Component 测试、`pnpm --dir frontend typecheck` |
| 前端模块边界 | `pnpm --dir frontend test:architecture` |
| 浏览器布局或 Canvas | 对应 Browser 测试 |
| Electron/IPC/商业合同 | `pnpm --dir desktop typecheck`、`pnpm --dir desktop test` |
| 发布制品 | 目标平台构建与 `.aigo/rules/release-security.md` 指定冒烟 |

## Python 环境诊断

出现异步插件、导入或版本差异时，先运行：

```powershell
uv run python -c "import sys; print(sys.executable)"
uv run python -m pytest --version --version
```

解释器应指向仓库 `.venv`。全局 `pytest` 即使能收集部分 AnyIO 测试，也不能作为项目
环境正常的证据。

## 结果表达

- 明确记录执行命令、通过/失败数量和失败原因。
- 跳过、警告、超时和环境限制不得包装为通过。
- 单元测试通过不代表真实 Gateway、付费模型、安装包、自动更新或人工工作流已验证。
