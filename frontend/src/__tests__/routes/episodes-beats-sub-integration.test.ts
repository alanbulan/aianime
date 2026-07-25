// Copyright (c) 2026 AI anime
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  "src/routes/_app/projects.$project/episodes.$episode/beats.lazy.tsx",
  "utf-8",
);
const actionPanelSource = readFileSync(
  "src/modules/narrative_planning/action-panel-composition.ts",
  "utf-8",
);
const actionPanelControllerSource = readFileSync(
  "src/modules/narrative_planning/application/use-action-panel-controller.ts",
  "utf-8",
);

describe("beats sub-section deep links", () => {
  it("keeps sub params as first-class route state", () => {
    expect(routeSource).toContain("targetSection");
    expect(routeSource).toContain("targetSection={targetSection}");
    expect(actionPanelSource).toContain("targetSection?: SectionId | null");
    expect(actionPanelControllerSource).toContain("next.add(targetSection)");
  });
});
