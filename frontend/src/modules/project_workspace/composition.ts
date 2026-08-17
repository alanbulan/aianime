import { useCallback, createElement } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";

import { openFreezoneProject } from "@/lib/freezone-url";
import { isCeRuntime } from "@/lib/runtime-config";
import { createProjectWorkspaceQueryHooks } from "@/modules/project_workspace/application/query-hooks";
import { createUseProjectDashboardController } from "@/modules/project_workspace/application/use-project-dashboard-controller";
import { createUseShareProjectController } from "@/modules/project_workspace/application/use-share-project-controller";
import { PROJECT_SECTION_ROUTES } from "@/modules/project_workspace/domain/project-navigation";
import { roleCanManageProjectGrants } from "@/modules/project_workspace/domain/project-permissions";
import { browserProjectLinkClipboard } from "@/modules/project_workspace/infrastructure/project-link-clipboard";
import { useProjectNavigationStore } from "@/modules/project_workspace/infrastructure/project-navigation-store";
import { httpProjectWorkspaceGateway } from "@/modules/project_workspace/infrastructure/http-project-workspace-gateway";
import { recentProjectPreference } from "@/modules/project_workspace/infrastructure/recent-project-preference";
import { ProjectDashboardView } from "@/modules/project_workspace/presentation/ProjectDashboard";
import { useAppStore } from "./presentation/appStore";
import {
  normalizeLastEpisodeLocation,
  useEpisodeWorkbenchStore,
} from "@/shared/stores/episode-workbench-store";

export const projectWorkspaceQueries = createProjectWorkspaceQueryHooks(
  httpProjectWorkspaceGateway,
);

export const {
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
} = projectWorkspaceQueries;

export function canManageProjectGrants(
  summary: Parameters<typeof roleCanManageProjectGrants>[0],
): boolean {
  return !isCeRuntime() && roleCanManageProjectGrants(summary);
}

export { useProjectNavigationStore };

const useProjectDashboardController = createUseProjectDashboardController(
  projectWorkspaceQueries,
  recentProjectPreference,
);
const useShareProjectController = createUseShareProjectController(
  projectWorkspaceQueries,
  browserProjectLinkClipboard,
);

function projectEntryRoute(project: string): string {
  const section =
    useProjectNavigationStore.getState().lastSectionByProject[project] ??
    "freezone";
  if (section === "episodes") {
    const remembered =
      useEpisodeWorkbenchStore.getState().lastEpisodeLocationByProject[project];
    if (remembered) {
      const normalized = normalizeLastEpisodeLocation(project, remembered);
      if (normalized) return normalized;
    }
  }
  return PROJECT_SECTION_ROUTES[section] ?? PROJECT_SECTION_ROUTES.freezone;
}

export function ProjectDashboardPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const currentTab = useAppStore((state) => state.dashboardTab);
  const setCurrentTab = useAppStore((state) => state.setDashboardTab);
  const view = useAppStore((state) => state.dashboardView);
  const setView = useAppStore((state) => state.setDashboardView);
  const openProject = useCallback(
    (project: string) => {
      navigate({ to: projectEntryRoute(project), params: { project } });
    },
    [navigate],
  );
  const preloadProject = useCallback(
    (project: string) => {
      void router
        .preloadRoute({
          to: projectEntryRoute(project),
          params: { project },
        })
        .catch(() => undefined);
    },
    [router],
  );
  const openCanvas = useCallback((project: string) => {
    openFreezoneProject(project);
  }, []);
  const controller = useProjectDashboardController({
    canManageProjectGrants,
    currentTab,
    openCanvas,
    openProject,
    preloadProject,
    setCurrentTab,
    setView,
    view,
  });
  const sharingEnabled = !isCeRuntime();
  const shareController = useShareProjectController(
    controller.shareProject,
    sharingEnabled && Boolean(controller.shareProject),
  );

  return createElement(ProjectDashboardView, {
    controller,
    shareController,
    sharingEnabled,
  });
}
