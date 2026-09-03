// Copyright (c) 2026 AI anime
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { playwright } from "@vitest/browser-playwright";
import path from "path";
import { defineConfig } from "vitest/config";

const baseExclude = [
  "**/node_modules/**",
  "**/dist/**",
  "**/.worktrees/**",
  "**/.claude/**",
];
const domTestPattern = "src/**/*.dom.test.ts";
const browserTestPatterns = [
  "src/**/*.browser.test.ts",
  "src/**/*.browser.test.tsx",
];

// react-konva publishes both CommonJS (`main`) and ESM (`module`) entries.
// VM pools externalize the package through Node, which selects the CommonJS
// entry and then tries to require the ESM-only `konva`. Point tests at the
// package's official ESM build, matching Vite's browser-side resolution.
const reactKonvaEsmEntry = path.resolve(
  import.meta.dirname,
  "node_modules/react-konva/es/ReactKonva.js",
);

export default defineConfig({
  plugins: [react()],
  // Mirror the compile-time `__APP_VERSION__` that `vite.config.ts` injects,
  // so code importing `@/lib/app-version` works under vitest too. In tests we
  // don't care about the real value — a stable placeholder is plenty.
  define: {
    __APP_VERSION__: JSON.stringify("test"),
    __BUILD_ID__: JSON.stringify("test-build"),
  },
  test: {
    globals: true,
    maxWorkers: 4,
    // VM pools retain ESM modules until a worker is recycled. Use a fixed
    // limit instead of the host-memory percentage default so CI is predictable.
    vmMemoryLimit: "1GB",
    // 完整套件并行负载下，文件级架构门禁的纯读文件用例曾被 5 秒默认超时中断
    // （无断言失败，单独复跑通过）。统一放宽到 30 秒，保持全量门禁可复现。
    testTimeout: 30000,
    exclude: baseExclude,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          pool: "vmThreads",
          include: ["src/**/*.test.ts"],
          exclude: [
            ...baseExclude,
            domTestPattern,
            ...browserTestPatterns,
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "component",
          environment: "happy-dom",
          pool: "vmThreads",
          include: ["src/**/*.test.tsx", domTestPattern],
          exclude: [...baseExclude, ...browserTestPatterns],
          setupFiles: [
            "./src/__tests__/setup.component.ts",
            "./src/__tests__/setup.ui.ts",
          ],
        },
      },
      {
        extends: true,
        plugins: [tailwindcss()],
        test: {
          name: "browser",
          include: browserTestPatterns,
          exclude: baseExclude,
          setupFiles: ["./src/__tests__/setup.ui.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
  resolve: {
    alias: [
      { find: /^react-konva$/, replacement: reactKonvaEsmEntry },
      { find: "@", replacement: path.resolve(import.meta.dirname, "./src") },
    ],
  },
});
