# Python 后端局部指南

本目录规则补充仓库根入口。非简单改动先读取 `.aigo/AI_CODING_CONTEXT.md`、
`.aigo/rules/code-governance.md`、`.aigo/rules/python-backend.md` 和
`.aigo/rules/testing.md`。

- 根包只保留 CLI、desktop sidecar 与跨上下文组合根；业务实现进入
  `modules/<context>`。
- 新 HTTP 接口进入 `api/routes/<context>`，route 只处理认证、schema、用例调用和
  HTTP 错误映射。
- 跨上下文只通过目标模块 `public.py`；不反向依赖 API 或直接穿透其他模块私有层。
- Domain 保持纯规则；Application 使用端口；Infrastructure 实现 SQLite、文件和外部
  服务适配；Composition 只装配依赖。
- Python、Pytest 和 Ruff 必须从仓库根通过 `uv run` 执行。

最小验证：修改文件 Ruff 加相关 Pytest；分层或公共入口变化同时运行
`uv run pytest tests/architecture -q`。
