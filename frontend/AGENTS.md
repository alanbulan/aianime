# React 前端局部指南

本目录规则补充仓库根入口。非简单改动先读取 `.aigo/AI_CODING_CONTEXT.md`、
`.aigo/rules/code-governance.md`、`.aigo/rules/frontend-react.md` 和
`.aigo/rules/testing.md`。

- `src/app` 负责 Bootstrap/Router/Provider，`src/routes` 只做参数与页面装配。
- 业务实现归 `src/modules/<context>`，跨上下文只从目标模块 `public.ts` 导入。
- Presentation 不直接访问原始 HTTP、IPC、浏览器存储或其他模块 infrastructure。
- 沿用现有 query、composition、ports、设计令牌和测试项目，不创建平行状态或网关。
- Unit、Component/Happy DOM、Browser 测试按行为选择，不使用 `--no-isolate`。

最小验证：相关 Vitest 项目加 `pnpm --dir frontend typecheck`；模块边界变化同时运行
`pnpm --dir frontend test:architecture`。
