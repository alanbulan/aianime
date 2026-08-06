// Copyright (c) 2026 AI anime
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // Mirror the compile-time `__APP_VERSION__` that `vite.config.ts` injects,
  // so code importing `@/lib/app-version` works under vitest too. In tests we
  // don't care about the real value — a stable placeholder is plenty.
  define: {
    __APP_VERSION__: JSON.stringify("test"),
    __BUILD_ID__: JSON.stringify("test-build"),
  },
  test: {
    environment: "jsdom",
    // 完整套件并行负载下，文件级架构门禁的纯读文件用例曾被 5 秒默认超时中断
    // （无断言失败，单独复跑通过）。统一放宽到 30 秒，保持全量门禁可复现。
    testTimeout: 30000,
    setupFiles: ["./src/__tests__/setup.ts"],
    globals: true,
    // Don't re-collect tests from nested git worktrees. Claude Code's agent
    // lifecycle leaves locked .claude/worktrees/* directories that mirror the
    // repo; without this exclude, vitest runs every test file ~N times and
    // blows up the total count.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.worktrees/**", "**/.claude/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
