# Python 后端规则

## 环境

- 支持 Python 3.11/3.12，依赖由根 `pyproject.toml` 与 `uv.lock` 锁定。
- 从仓库根使用 `uv run python ...`、`uv run pytest ...`、`uv run ruff ...`。不要用
  PATH 中的全局 Python/Pytest，也不要为了修复测试环境而全局安装包。
- 桌面构建依赖使用现有 `desktop` group；3D World 使用现有 `world` extra。不得把
  Hermes 的独立依赖合并进主环境。

## 模块边界

- 业务实现进入 `src/ai_anime/modules/<context>` 的适用层；`src/ai_anime` 根包只保留
  CLI、sidecar 和跨上下文组合根。
- `domain` 保持纯规则，不依赖 FastAPI、数据库或文件系统；`application` 通过端口
  编排；`infrastructure` 实现外部适配；`composition` 只装配依赖。
- 跨上下文入口使用目标模块的 `public.py`。FastAPI route 只处理认证、schema、用例
  调用与 HTTP 错误映射，不直接实现业务状态机或持久化规则。
- SQLite、文件与外部服务写入沿用现有事务、原子写和路径安全实现，不创建旁路存储。

## 异步测试

- 仓库开发组已包含 `pytest-asyncio`，并配置 `asyncio_mode = "auto"`。邻近测试使用
  `pytest.mark.asyncio` 时继续沿用；只有所在测试域已经采用 AnyIO 或确有后端需求时
  才使用 `pytest.mark.anyio`。
- 不要把异步测试改写为 AnyIO 来掩盖错误解释器。出现 `Unknown config option:
  asyncio_mode` 或异步函数不受支持时，先检查命令是否通过 `uv run` 命中 `.venv`。
- 优先增加领域或用例级定向测试；API、持久化和任务生命周期变更再补合同或集成验证。

## 常用验证

```powershell
uv run ruff check <修改的 Python 文件>
uv run pytest <相关测试路径> -q
```

跨上下文边界变更同时运行 `uv run pytest tests/architecture -q`；全量后端回归使用
`uv run pytest`，并与 Node/TypeScript 大型检查串行执行。
