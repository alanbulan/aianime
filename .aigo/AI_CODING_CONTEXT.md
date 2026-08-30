# AI Anime Desktop 编码上下文

本文件是 AI 编码工具的渐进式披露路由入口。根入口只保存全仓不变量；这里决定
当前任务还需要加载哪些局部规则，避免把整份工程文档注入每个任务。

## 文档所有权与优先级

- `AGENTS.md` 与 `CLAUDE.md`：跨工具一致的仓库入口和底线。
- 本文件：任务路由、规则优先级和项目系统图摘要。
- `.aigo/rules/*.md`：可执行的工程、技术栈、测试和发布规则。
- `desktop/AGENTS.md`、`frontend/AGENTS.md`、`src/ai_anime/AGENTS.md`：目录局部规则。
- `README.md`：当前产品、运行架构、技术栈、目录和开发命令事实。
- `UPSTREAM.md`：上游评估与移植流程。
- `docs/architecture/`：架构计划、审计和阶段记录；只读取与任务相关的文档，历史
  记录不自动代表当前实现。

代码、配置、锁文件、测试和可复现命令输出优先于描述性文档。发现冲突时应报告
文档漂移并基于明确证据处理，不自行选择一个版本继续。

## 任务路由

| 任务 | 必须读取 | 按需读取 |
| --- | --- | --- |
| 任意非简单改动 | `.aigo/rules/code-governance.md`、`.aigo/rules/testing.md` | 相关测试与最近实现 |
| Python、FastAPI、SQLite、任务执行 | `.aigo/rules/python-backend.md`、`src/ai_anime/AGENTS.md` | `README.md` 第 4.3、5、6、11 节 |
| React、路由、状态、Canvas、UI | `.aigo/rules/frontend-react.md`、`frontend/AGENTS.md` | `README.md` 第 4.1、5、6、11 节 |
| Electron、IPC、sidecar、桌面商业链路 | `.aigo/rules/desktop-electron.md`、`desktop/AGENTS.md` | `README.md` 第 2、4.2、7、8 节 |
| 跨栈合同或架构边界 | 涉及的各栈规则、现有架构门禁 | `docs/architecture/` 中的当前相关记录 |
| 测试、构建或环境故障 | `.aigo/rules/testing.md` | 锁文件、测试配置和失败日志 |
| 打包、更新、安全、上游同步 | `.aigo/rules/release-security.md` | `README.md` 第 12、13 节、`UPSTREAM.md` |

## 系统边界摘要

- 产品由 Electron 主进程、React Renderer、FastAPI sidecar、Hermes ACP sidecar、
  SQLite/本地文件与商业 Gateway 组成。
- Electron 主进程持有操作系统能力、密钥、许可、更新器、模型代理与 sidecar 生命周期；
  Renderer 只通过白名单 IPC 和本地 HTTP/SSE/WebSocket 使用能力。
- 前后端业务上下文采用同名 DDD 边界，跨上下文只经 `public` 入口。
- `src/ai_anime` 根包不新增业务实现；新增业务进入所属 `modules/<context>`，新增 HTTP
  接口进入 `api/routes/<context>`。
- Hermes 使用 `desktop/hermes-runtime/uv.lock` 独立锁定，不并入主 Python 环境。
- 构建产物、用户数据、日志、密钥、JWT 和私钥不进入版本库。

## 工作流

1. 确认目标行为、所属上下文和现有测试。
2. 按路由只加载必要规则与实现证据。
3. 以项目既有模式完成最小改动，不建立第二套抽象或兼容路径。
4. 先跑定向验证；只有变更跨边界或风险较高时扩大验证范围。
5. 复查差异、验证结果和未覆盖的真实边界后交付。
