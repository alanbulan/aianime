// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf-8");

describe("task controller provider placement", () => {
  it("owns one registry in the signed-in app shell", () => {
    const appLayout = read("src/app/AppLayoutView.tsx");
    const pageCompositions = [
      read("src/app/workspace-composition.tsx"),
      read("src/modules/asset_world/composition.ts"),
      read("src/modules/narrative_planning/presentation/EpisodesPageView.tsx"),
    ].join("\n");

    expect(appLayout.match(/<TaskControllerProvider>/g)).toHaveLength(1);
    expect(appLayout).toMatch(
      /<TaskControllerProvider>[\s\S]*<TaskCenterProvider/,
    );
    expect(pageCompositions).not.toContain("TaskControllerProvider");
  });
});
