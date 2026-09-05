// Copyright (c) 2026 AI anime
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type {
  ProjectUpdatePayload,
  ProjectWorkspaceGateway,
} from "@/modules/project_workspace/application/ports";
import type {
  ProjectLifecycleAction,
  ProjectRole,
  ProjectSummary,
} from "@/modules/project_workspace/domain/project";

const PROJECT_SUMMARIES_STALE_TIME_MS = 5 * 60_000;
const PROJECT_COVER_CANDIDATES_STALE_TIME_MS = 15_000;

export function createProjectWorkspaceQueryHooks(
  gateway: ProjectWorkspaceGateway,
) {
  function useProject(project: string) {
    return useQuery({
      queryKey: queryKeys.project(project),
      queryFn: ({ signal }) => gateway.getProject(project, signal),
      enabled: Boolean(project),
    });
  }

  function useCreateProject() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (name: string) => gateway.createProject(name),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects() });
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectSummaries(),
        });
      },
    });
  }

  function useUpdateProject(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (config: ProjectUpdatePayload) =>
        gateway.updateProject(project, config),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.project(project) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projectSummaries() });
      },
    });
  }

  function useProjectCoverCandidates(
    project: string,
    page: number,
    pageSize: number,
    enabled: boolean,
  ) {
    return useQuery({
      queryKey: [...queryKeys.project(project), "cover-candidates", page, pageSize],
      queryFn: ({ signal }) =>
        gateway.listProjectCoverCandidates(project, page, pageSize, signal),
      enabled: enabled && Boolean(project),
      staleTime: PROJECT_COVER_CANDIDATES_STALE_TIME_MS,
    });
  }

  function useUploadProjectCover(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (file: File) => gateway.uploadProjectCover(project, file),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.projectSummaries() });
      },
    });
  }

  function useSelectProjectCover(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (sourcePath: string) =>
        gateway.selectProjectCover(project, sourcePath),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.projectSummaries() });
      },
    });
  }

  function useAllProjectSummaries(): {
    data: ProjectSummary[] | undefined;
    isLoading: boolean;
  } {
    const query = useQuery({
      queryKey: queryKeys.projectSummaries(),
      queryFn: ({ signal }) => gateway.listProjectSummaries(signal),
      staleTime: PROJECT_SUMMARIES_STALE_TIME_MS,
    });
    return { data: query.data, isLoading: query.isLoading };
  }

  function useLifecycleMutation(action: ProjectLifecycleAction) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (project: string) =>
        gateway.changeProjectStatus(project, action),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects() });
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectSummaries(),
        });
      },
    });
  }

  const useArchiveProject = () => useLifecycleMutation("archive");
  const useUnarchiveProject = () => useLifecycleMutation("unarchive");
  const useSoftDeleteProject = () => useLifecycleMutation("delete");
  const useRestoreProject = () => useLifecycleMutation("restore");
  const usePurgeProject = () => useLifecycleMutation("purge");

  function useProjectGrants(project: string, enabled = true) {
    return useQuery({
      queryKey: queryKeys.projectGrants(project),
      queryFn: ({ signal }) => gateway.listProjectGrants(project, signal),
      enabled: enabled && Boolean(project),
    });
  }

  function useUserSearch(query: string) {
    const trimmed = query.trim();
    return useQuery({
      queryKey: queryKeys.userSearch(trimmed),
      queryFn: ({ signal }) => gateway.searchUsers(trimmed, signal),
      enabled: trimmed.length >= 3,
    });
  }

  function useAddProjectGrant(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (payload: {
        principalUsername?: string;
        principalId?: string;
        role: Exclude<ProjectRole, "owner">;
      }) => gateway.addProjectGrant(project, payload),
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectGrants(project),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectSummaries(),
        });
      },
    });
  }

  function useUpdateProjectGrant(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({
        grantId,
        role,
      }: {
        grantId: string;
        role: Exclude<ProjectRole, "owner">;
      }) => gateway.updateProjectGrant(project, grantId, role),
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectGrants(project),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectSummaries(),
        });
      },
    });
  }

  function useDeleteProjectGrant(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (grantId: string) =>
        gateway.deleteProjectGrant(project, grantId),
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectGrants(project),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectSummaries(),
        });
      },
    });
  }

  return {
    useAddProjectGrant,
    useAllProjectSummaries,
    useArchiveProject,
    useCreateProject,
    useDeleteProjectGrant,
    useProject,
    useProjectCoverCandidates,
    useProjectGrants,
    usePurgeProject,
    useRestoreProject,
    useSoftDeleteProject,
    useUnarchiveProject,
    useUpdateProject,
    useUploadProjectCover,
    useSelectProjectCover,
    useUpdateProjectGrant,
    useUserSearch,
  };
}

export type ProjectWorkspaceQueryHooks = ReturnType<
  typeof createProjectWorkspaceQueryHooks
>;
