import type {
  ProjectStatus,
  ProjectSummary,
} from "@/modules/project_workspace/domain/project";

export type ProjectSortKey =
  | "updated-desc"
  | "updated-asc"
  | "name-asc"
  | "name-desc";

export type PendingProjectAction =
  | { kind: "archive"; project: string; name: string }
  | { kind: "delete"; project: string; name: string }
  | { kind: "purge"; project: string; name: string };

export const PROJECT_NAME_PATTERN = /^[\p{L}\p{N}_]+$/u;

export function isValidProjectName(name: string): boolean {
  return PROJECT_NAME_PATTERN.test(name) && !name.startsWith("_");
}

export function projectRouteParam(summary: ProjectSummary): string {
  return summary.id;
}

export function projectStatusCounts(
  projects: ProjectSummary[],
): Record<ProjectStatus, number> {
  const counts: Record<ProjectStatus, number> = {
    active: 0,
    archived: 0,
    deleted: 0,
  };
  for (const project of projects) counts[project.status] += 1;
  return counts;
}

function updatedAt(summary: ProjectSummary): string {
  return summary.updatedAt ?? summary.archivedAt ?? summary.deletedAt ?? "";
}

function displayName(summary: ProjectSummary): string {
  return summary.displayName || summary.name;
}

export function sortProjectSummaries(
  projects: ProjectSummary[],
  key: ProjectSortKey,
): ProjectSummary[] {
  const sorted = [...projects];
  switch (key) {
    case "updated-desc":
      return sorted.sort((left, right) => {
        const leftUpdatedAt = updatedAt(left);
        const rightUpdatedAt = updatedAt(right);
        if (leftUpdatedAt !== rightUpdatedAt) {
          return leftUpdatedAt < rightUpdatedAt ? 1 : -1;
        }
        return displayName(left).localeCompare(displayName(right));
      });
    case "updated-asc":
      return sorted.sort((left, right) => {
        const leftUpdatedAt = updatedAt(left);
        const rightUpdatedAt = updatedAt(right);
        if (leftUpdatedAt !== rightUpdatedAt) {
          return leftUpdatedAt > rightUpdatedAt ? 1 : -1;
        }
        return displayName(left).localeCompare(displayName(right));
      });
    case "name-asc":
      return sorted.sort((left, right) =>
        displayName(left).localeCompare(displayName(right)),
      );
    case "name-desc":
      return sorted.sort((left, right) =>
        displayName(right).localeCompare(displayName(left)),
      );
  }
}

export function prioritizeProject(
  projects: ProjectSummary[],
  projectName: string | null,
): ProjectSummary[] {
  if (!projectName) return projects;
  const index = projects.findIndex((project) => project.name === projectName);
  if (index <= 0) return projects;
  const prioritized = [...projects];
  const [project] = prioritized.splice(index, 1);
  prioritized.unshift(project);
  return prioritized;
}
