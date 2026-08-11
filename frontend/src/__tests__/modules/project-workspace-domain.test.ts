import { describe, expect, it } from "vitest";

import {
  isValidProjectName,
  prioritizeProject,
  projectStatusCounts,
  sortProjectSummaries,
} from "@/modules/project_workspace/domain/project-dashboard";
import type { ProjectSummary } from "@/modules/project_workspace/domain/project";

const project = (
  id: string,
  name: string,
  status: ProjectSummary["status"],
  updatedAt: string,
): ProjectSummary => ({ id, name, status, updatedAt });

describe("Project Workspace domain", () => {
  it("keeps project-name validation aligned with the backend", () => {
    expect(isValidProjectName("story_01")).toBe(true);
    expect(isValidProjectName("我的漫剧_01")).toBe(true);
    expect(isValidProjectName("_hidden")).toBe(false);
    expect(isValidProjectName("story one")).toBe(false);
    expect(isValidProjectName("故事/第一集")).toBe(false);
    expect(isValidProjectName("")).toBe(false);
  });

  it("counts lifecycle states without transport fields", () => {
    expect(
      projectStatusCounts([
        project("1", "A", "active", "2026-01-01"),
        project("2", "B", "archived", "2026-01-02"),
        project("3", "C", "deleted", "2026-01-03"),
      ]),
    ).toEqual({ active: 1, archived: 1, deleted: 1 });
  });

  it("sorts deterministically and can prioritize a newly created project", () => {
    const projects = [
      project("1", "Beta", "active", "2026-01-01"),
      project("2", "Alpha", "active", "2026-01-02"),
    ];

    expect(
      sortProjectSummaries(projects, "updated-desc").map(({ name }) => name),
    ).toEqual(["Alpha", "Beta"]);
    expect(
      prioritizeProject(projects, "Alpha").map(({ name }) => name),
    ).toEqual(["Alpha", "Beta"]);
    expect(projects.map(({ name }) => name)).toEqual(["Beta", "Alpha"]);
  });
});
