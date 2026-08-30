# React 前端规则

## 所有权与分层

- 前端按 `app -> routes -> modules -> shared` 组合；业务模块内部使用适用的
  `domain/application/infrastructure/presentation/composition/public` 层。
- `routes` 只读取路由参数和装配页面；业务状态、查询、命令和 transport 归所属模块。
- 跨上下文消费只通过目标模块的 `public.ts`。Presentation 不直接访问原始 HTTP、IPC、
  浏览器存储或其他模块的 infrastructure。
- 优先复用现有 composition、ports、query keys、组件和设计令牌，不创建同义合同、并行
  网关或新的全局状态来源。
- 不新增未登记的硬编码 UI 色值；可访问性、主题对比度和长列表虚拟化规则由现有架构
  测试约束。

## 测试约定

- 纯规则使用 Unit 项目；DOM 组件使用 Component/Happy DOM；真实布局、Canvas 和复杂
  浏览器交互使用 Browser 项目。
- 非 TSX DOM 测试使用 `.dom.test.ts`；Browser Mode 使用 `.browser.test.ts` 或
  `.browser.test.tsx`。
- 不使用 `--no-isolate`。MSW 未 mock 请求必须保持 `onUnhandledRequest: "error"`，测试
  不得静默访问真实服务。
- 修改查询、缓存或跨模块装配时，验证调用方状态、失效路径和错误投影，不只断言组件
  初始渲染。

## 常用验证

```powershell
pnpm --dir frontend typecheck
pnpm --dir frontend test:unit
pnpm --dir frontend test:component
pnpm --dir frontend test:browser
pnpm --dir frontend test:architecture
```

先选择与改动匹配的项目；跨模块边界或发布级改动再运行完整 `pnpm --dir frontend test`
与 `pnpm --dir frontend build:ce`。Windows 上不要与 Pytest 或桌面 TypeScript 并行。
