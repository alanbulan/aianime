import { api } from "@/shared/api/transport";
import { p } from "@/shared/api/path";
import type { OkResponse } from "@/types/api";
import type { ProjectWorkspaceGateway } from "@/modules/project_workspace/application/ports";
import type {
  CreatedProject,
  ProjectConfig,
  ProjectGrant,
  ProjectRole,
  ProjectStatus,
  ProjectSummary,
  UserSearchResult,
} from "@/modules/project_workspace/domain/project";

interface ProjectSummaryPayload {
  id?: string;
  project_id?: string;
  name: string;
  owner_type?: "user" | "team" | null;
  owner_id?: string | null;
  owner_username?: string | null;
  effective_role?: ProjectRole | null;
  home_node_id?: string | null;
  status: ProjectStatus;
  archived_at?: string | null;
  deleted_at?: string | null;
  updated_at?: string | null;
  episode_count?: number | null;
  beat_count?: number | null;
}

interface CreatedProjectPayload {
  id?: string;
  project_id?: string;
  name: string;
}

interface ProjectGrantPayload {
  id: string;
  project_id: string;
  principal_type: "user" | "team";
  principal_id: string;
  principal_username?: string | null;
  role: Exclude<ProjectRole, "owner">;
  created_at?: string | null;
}

function mapSummary(
  payload: ProjectSummaryPayload,
  fallbackId?: string,
): ProjectSummary {
  const id = payload.id ?? payload.project_id ?? fallbackId;
  if (!id) {
    throw new Error(`Project summary missing project_id: ${payload.name}`);
  }
  return {
    id,
    name: payload.name,
    status: payload.status,
    ownerType: payload.owner_type ?? undefined,
    ownerId: payload.owner_id ?? undefined,
    ownerUsername: payload.owner_username ?? undefined,
    effectiveRole: payload.effective_role ?? undefined,
    homeNodeId: payload.home_node_id ?? undefined,
    archivedAt: payload.archived_at ?? undefined,
    deletedAt: payload.deleted_at ?? undefined,
    updatedAt: payload.updated_at ?? undefined,
    episodeCount: payload.episode_count ?? undefined,
    beatCount: payload.beat_count ?? undefined,
  };
}

function mapGrant(payload: ProjectGrantPayload): ProjectGrant {
  return {
    id: payload.id,
    projectId: payload.project_id,
    principalType: payload.principal_type,
    principalId: payload.principal_id,
    principalUsername: payload.principal_username ?? undefined,
    role: payload.role,
    createdAt: payload.created_at ?? undefined,
  };
}

function createdProject(payload: CreatedProjectPayload): CreatedProject {
  const id = payload.id ?? payload.project_id;
  if (!id) throw new Error(`Created project missing project_id: ${payload.name}`);
  return { id, name: payload.name };
}

export const httpProjectWorkspaceGateway: ProjectWorkspaceGateway = {
  async getProject(project, signal) {
    const response = await api
      .get(p`api/v1/projects/${project}`, { signal })
      .json<OkResponse<ProjectConfig>>();
    return response.data;
  },

  async createProject(name) {
    const response = await api
      .post("api/v1/projects", { json: { name } })
      .json<OkResponse<CreatedProjectPayload>>();
    return createdProject(response.data);
  },

  async updateProject(project, config) {
    const response = await api
      .patch(p`api/v1/projects/${project}`, { json: config })
      .json<OkResponse<ProjectConfig>>();
    return response.data;
  },

  async listProjectSummaries(signal) {
    const response = await api
      .get("api/v1/projects/summaries", {
        searchParams: { status: "all" },
        signal,
      })
      .json<OkResponse<ProjectSummaryPayload[]>>();
    return response.data.map((payload) => mapSummary(payload));
  },

  async changeProjectStatus(project, action) {
    const response = await api
      .post(p`api/v1/projects/${project}/${action}`)
      .json<OkResponse<ProjectSummaryPayload>>();
    return mapSummary(response.data, project);
  },

  async listProjectGrants(project, signal) {
    const response = await api
      .get(p`api/v1/projects/${project}/grants`, { signal })
      .json<OkResponse<ProjectGrantPayload[]>>();
    return response.data.map(mapGrant);
  },

  async searchUsers(query, signal) {
    const response = await api
      .get("api/v1/users/search", {
        searchParams: { q: query },
        signal,
      })
      .json<OkResponse<UserSearchResult[]>>();
    return response.data;
  },

  async addProjectGrant(project, payload) {
    const response = await api
      .post(p`api/v1/projects/${project}/grants`, {
        json: {
          principal_type: "user",
          principal_username: payload.principalUsername,
          principal_id: payload.principalId,
          role: payload.role,
        },
      })
      .json<OkResponse<ProjectGrantPayload>>();
    return mapGrant(response.data);
  },

  async updateProjectGrant(project, grantId, role) {
    const response = await api
      .patch(p`api/v1/projects/${project}/grants/${grantId}`, {
        json: { role },
      })
      .json<OkResponse<ProjectGrantPayload>>();
    return mapGrant(response.data);
  },

  async deleteProjectGrant(project, grantId) {
    await api.delete(p`api/v1/projects/${project}/grants/${grantId}`);
  },
};
