// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("selected beat video task binding", () => {
  it("keeps BatchPanel pending while selected single_video tasks are active", () => {
    const batchPanelController = read(
      "src/modules/production/application/use-batch-panel-controller.ts",
    );

    expect(batchPanelController).toContain("dependencies.useTasks");
    expect(batchPanelController).toContain("TASK_TYPES.SINGLE_VIDEO");
    expect(batchPanelController).toContain("selectedVideoRunning");
    expect(batchPanelController).toContain("isActiveStatus");
  });
});
