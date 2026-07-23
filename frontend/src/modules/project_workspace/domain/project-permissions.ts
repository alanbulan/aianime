// Copyright (c) 2026 AI anime
import type {
  ProjectRole,
  ProjectSummary,
} from "@/modules/project_workspace/domain/project";

const ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 10,
  editor: 20,
  admin: 30,
  owner: 40,
};

export function projectRole(summary: ProjectSummary): ProjectRole {
  return summary.effectiveRole ?? "owner";
}

export function roleAllows(actual: ProjectRole | undefined, required: ProjectRole): boolean {
  return ROLE_RANK[actual ?? "viewer"] >= ROLE_RANK[required];
}

export function roleCanManageProjectGrants(summary: ProjectSummary): boolean {
  return roleAllows(projectRole(summary), "admin");
}

export function canDeleteProject(summary: ProjectSummary): boolean {
  return projectRole(summary) === "owner";
}

export function isSharedProject(summary: ProjectSummary): boolean {
  return projectRole(summary) !== "owner";
}

export function projectRoleLabel(role: ProjectRole | undefined): string {
  switch (role ?? "owner") {
    case "viewer":
      return "查看者";
    case "editor":
      return "编辑者";
    case "admin":
      return "管理员";
    case "owner":
      return "所有者";
  }
}
