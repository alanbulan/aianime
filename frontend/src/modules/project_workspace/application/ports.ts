import type {
  CreatedProject,
  ProjectConfig,
  ProjectGrant,
  ProjectLifecycleAction,
  ProjectRole,
  ProjectSummary,
  UserSearchResult,
} from "@/modules/project_workspace/domain/project";

export interface ProjectWorkspaceGateway {
  getProject(project: string, signal?: AbortSignal): Promise<ProjectConfig>;
  createProject(name: string): Promise<CreatedProject>;
  updateProject(
    project: string,
    config: Partial<ProjectConfig>,
  ): Promise<ProjectConfig>;
  listProjectSummaries(signal?: AbortSignal): Promise<ProjectSummary[]>;
  changeProjectStatus(
    project: string,
    action: ProjectLifecycleAction,
  ): Promise<ProjectSummary>;
  listProjectGrants(
    project: string,
    signal?: AbortSignal,
  ): Promise<ProjectGrant[]>;
  searchUsers(query: string, signal?: AbortSignal): Promise<UserSearchResult[]>;
  addProjectGrant(
    project: string,
    payload: {
      principalUsername?: string;
      principalId?: string;
      role: Exclude<ProjectRole, "owner">;
    },
  ): Promise<ProjectGrant>;
  updateProjectGrant(
    project: string,
    grantId: string,
    role: Exclude<ProjectRole, "owner">,
  ): Promise<ProjectGrant>;
  deleteProjectGrant(project: string, grantId: string): Promise<void>;
}

export interface RecentProjectPreference {
  read(): string | null;
  write(projectName: string): void;
}

export interface ProjectLinkClipboard {
  copy(project: ProjectSummary): Promise<void>;
}
