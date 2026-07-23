// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  PROJECT_SECTION_ROUTES,
  projectModeFromPath,
  projectSectionFromPath,
} from "@/modules/project_workspace/domain/project-navigation";

describe("project navigation routes", () => {
  it("uses freezone as the project dashboard entry", () => {
    expect(PROJECT_SECTION_ROUTES.freezone).toBe("/projects/$project/freezone");
  });

  it("classifies freezone as canvas and every production section as workspace", () => {
    expect(projectModeFromPath("/projects/demo/freezone")).toBe("canvas");
    expect(projectModeFromPath("/projects/demo/ingest")).toBe("workspace");
    expect(projectModeFromPath("/projects/demo/tasks")).toBe("workspace");
  });

  it("preserves the tasks section when switching projects", () => {
    expect(projectSectionFromPath("/projects/demo/tasks")).toBe("tasks");
  });

  it("does not silently classify unknown project sections as freezone", () => {
    expect(projectSectionFromPath("/projects/demo/unknown")).toBeNull();
  });
});
