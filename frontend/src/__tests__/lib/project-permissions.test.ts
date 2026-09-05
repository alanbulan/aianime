// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  canDeleteProject,
} from "@/modules/project_workspace/domain/project-permissions";
import { canManageProjectGrants } from "@/modules/project_workspace/composition";
import type {
  ProjectRole,
  ProjectSummary,
} from "@/modules/project_workspace/domain/project";

const runtimeState = vi.hoisted(() => ({ isCeRuntime: false, sharingAvailable: true }));

vi.mock("@/lib/runtime-config", () => ({
  projectSharingEnabled: () => !runtimeState.isCeRuntime && runtimeState.sharingAvailable,
}));

function summaryWithRole(role: ProjectRole): ProjectSummary {
  return { effectiveRole: role } as ProjectSummary;
}

describe("canManageProjectGrants (sharing capability gating)", () => {
  beforeEach(() => {
    runtimeState.isCeRuntime = false;
    runtimeState.sharingAvailable = true;
  });

  it("allows admin and owner in EE runtime", () => {
    expect(canManageProjectGrants(summaryWithRole("admin"))).toBe(true);
    expect(canManageProjectGrants(summaryWithRole("owner"))).toBe(true);
  });

  it("denies viewer and editor in EE runtime", () => {
    expect(canManageProjectGrants(summaryWithRole("viewer"))).toBe(false);
    expect(canManageProjectGrants(summaryWithRole("editor"))).toBe(false);
  });

  it("denies everyone in CE runtime — even owner (no grants concept)", () => {
    runtimeState.isCeRuntime = true;
    expect(canManageProjectGrants(summaryWithRole("owner"))).toBe(false);
    expect(canManageProjectGrants(summaryWithRole("admin"))).toBe(false);
  });

  it("denies everyone when EE sharing routes are unavailable", () => {
    runtimeState.sharingAvailable = false;
    expect(canManageProjectGrants(summaryWithRole("owner"))).toBe(false);
    expect(canManageProjectGrants(summaryWithRole("admin"))).toBe(false);
  });
});

describe("canDeleteProject (CE lifecycle stays available)", () => {
  beforeEach(() => {
    runtimeState.isCeRuntime = false;
  });

  it("owner can delete regardless of edition", () => {
    expect(canDeleteProject(summaryWithRole("owner"))).toBe(true);
    runtimeState.isCeRuntime = true;
    expect(canDeleteProject(summaryWithRole("owner"))).toBe(true);
  });

  it("non-owner cannot delete", () => {
    expect(canDeleteProject(summaryWithRole("admin"))).toBe(false);
  });
});
