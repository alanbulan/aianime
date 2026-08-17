import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { RecentProjectPreference } from "@/modules/project_workspace/application/ports";
import type { ProjectWorkspaceQueryHooks } from "@/modules/project_workspace/application/query-hooks";
import {
  isValidProjectName,
  prioritizeProject,
  projectRouteParam,
  projectStatusCounts,
  sortProjectSummaries,
  type PendingProjectAction,
  type ProjectSortKey,
} from "@/modules/project_workspace/domain/project-dashboard";
import type {
  ProjectDashboardViewMode,
  ProjectLifecycleAction,
  ProjectStatus,
  ProjectSummary,
} from "@/modules/project_workspace/domain/project";

const PROJECT_COVER_PAGE_SIZE = 15;

export interface ProjectDashboardControllerOptions {
  currentTab: ProjectStatus;
  setCurrentTab(value: ProjectStatus): void;
  view: ProjectDashboardViewMode;
  setView(value: ProjectDashboardViewMode): void;
  openProject(project: string): void;
  openCanvas(project: string): void;
  preloadProject(project: string): void;
  canManageProjectGrants(summary: ProjectSummary): boolean;
}

export function createUseProjectDashboardController(
  queries: ProjectWorkspaceQueryHooks,
  recentProject: RecentProjectPreference,
) {
  return function useProjectDashboardController(
    options: ProjectDashboardControllerOptions,
  ) {
    const { t } = useTranslation();
    const [search, setSearch] = useState("");
    const [sort, setSort] = useState<ProjectSortKey>("updated-desc");
    const [createOpen, setCreateOpen] = useState(false);
    const [newName, setNewName] = useState("");
    const [recentlyCreatedProject, setRecentlyCreatedProject] = useState<
      string | null
    >(() => recentProject.read());
    const [pending, setPending] = useState<PendingProjectAction | null>(null);
    const [shareProject, setShareProject] = useState<ProjectSummary | null>(
      null,
    );
    const [profileProject, setProfileProjectState] =
      useState<ProjectSummary | null>(null);
    const [profileName, setProfileName] = useState("");
    const [profileCandidatePage, setProfileCandidatePage] = useState(1);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const allSummaries = queries.useAllProjectSummaries();
    const [wasColdOnMount] = useState(() => allSummaries.isLoading);
    const createProject = queries.useCreateProject();
    const archive = queries.useArchiveProject();
    const unarchive = queries.useUnarchiveProject();
    const softDelete = queries.useSoftDeleteProject();
    const restore = queries.useRestoreProject();
    const purge = queries.usePurgeProject();
    const profileProjectId = profileProject?.id ?? "";
    const profileConfig = queries.useUpdateProject(profileProjectId);
    const profileCandidates = queries.useProjectCoverCandidates(
      profileProjectId,
      profileCandidatePage,
      PROJECT_COVER_PAGE_SIZE,
      Boolean(profileProject),
    );
    const uploadCover = queries.useUploadProjectCover(profileProjectId);
    const selectCover = queries.useSelectProjectCover(profileProjectId);

    useEffect(() => {
      const focusSearch = (event: KeyboardEvent) => {
        if (event.key !== "/") return;
        const target = event.target as HTMLElement | null;
        if (
          target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          target?.isContentEditable
        ) {
          return;
        }
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      };
      window.addEventListener("keydown", focusSearch);
      return () => window.removeEventListener("keydown", focusSearch);
    }, []);

    const all = allSummaries.data ?? [];
    const statusCounts = useMemo(() => projectStatusCounts(all), [all]);
    const totalProjects =
      statusCounts.active + statusCounts.archived + statusCounts.deleted;
    const normalizedSearch = search.trim().toLowerCase();
    const visibleByStatus = (status: ProjectStatus) =>
      all.filter(
        (project) =>
          project.status === status &&
          (!normalizedSearch ||
            (project.displayName || project.name)
              .toLowerCase()
              .includes(normalizedSearch)),
      );
    const activeList = useMemo(
      () =>
        prioritizeProject(
          sortProjectSummaries(visibleByStatus("active"), sort),
          recentlyCreatedProject,
        ),
      [all, normalizedSearch, recentlyCreatedProject, sort],
    );
    const archivedList = useMemo(
      () => sortProjectSummaries(visibleByStatus("archived"), sort),
      [all, normalizedSearch, sort],
    );
    const deletedList = useMemo(
      () => sortProjectSummaries(visibleByStatus("deleted"), sort),
      [all, normalizedSearch, sort],
    );

    const trimmedNewName = newName.trim();
    const existingProject = useMemo(
      () =>
        trimmedNewName
          ? all.find((project) => project.name === trimmedNewName)
          : null,
      [all, trimmedNewName],
    );
    const createNameError =
      trimmedNewName && !isValidProjectName(trimmedNewName)
        ? t("project.nameInvalid")
        : existingProject?.status === "active"
          ? t("project.nameExistsActive")
          : existingProject?.status === "archived"
            ? t("project.nameExistsArchived")
            : existingProject?.status === "deleted"
              ? t("project.nameExistsDeleted")
              : null;

    const handleCreate = async () => {
      const name = trimmedNewName;
      if (!name || createNameError) return;
      try {
        const created = await createProject.mutateAsync(name);
        const createdName = created.name || name;
        setRecentlyCreatedProject(createdName);
        recentProject.write(createdName);
        setNewName("");
        setCreateOpen(false);
      } catch {
        toast.error(t("project.toasts.createFailed"));
      }
    };

    const runWithUndo = (
      name: string,
      forward: () => void,
      undo: () => void,
      toastKey: string,
    ) => {
      forward();
      toast.success(t(toastKey, { name }), {
        action: {
          label: t("project.toasts.undo"),
          onClick: undo,
        },
      });
    };

    const onAction = (
      summary: ProjectSummary,
      action: ProjectLifecycleAction,
    ) => {
      const project = projectRouteParam(summary);
      const { name } = summary;
      if (action === "archive") {
        setPending({ kind: "archive", project, name });
        return;
      }
      if (action === "delete") {
        setPending({ kind: "delete", project, name });
        return;
      }
      if (action === "purge") {
        setPending({ kind: "purge", project, name });
        return;
      }
      if (action === "unarchive") {
        runWithUndo(
          name,
          () => unarchive.mutate(project),
          () => archive.mutate(project),
          "project.toasts.unarchived",
        );
        return;
      }
      runWithUndo(
        name,
        () => restore.mutate(project),
        () => softDelete.mutate(project),
        "project.toasts.restored",
      );
    };

    const confirmPending = () => {
      if (!pending) return;
      const { kind, project, name } = pending;
      if (kind === "archive") {
        runWithUndo(
          name,
          () => archive.mutate(project),
          () => unarchive.mutate(project),
          "project.toasts.archived",
        );
      } else if (kind === "delete") {
        runWithUndo(
          name,
          () => softDelete.mutate(project),
          () => restore.mutate(project),
          "project.toasts.deleted",
        );
      } else {
        purge.mutate(project);
        toast.success(t("project.toasts.purged", { name }));
      }
      setPending(null);
    };

    const setProfileProject = (project: ProjectSummary | null) => {
      setProfileProjectState(project);
      setProfileName(project?.displayName || project?.name || "");
      setProfileCandidatePage(1);
    };

    const saveProjectProfile = async () => {
      const displayName = profileName.trim();
      if (!profileProjectId || !displayName) return;
      try {
        await profileConfig.mutateAsync({ display_name: displayName });
        toast.success(t("project.profile.saved"));
        setProfileProject(null);
      } catch {
        toast.error(t("project.profile.saveFailed"));
      }
    };

    const uploadProjectCover = async (file: File) => {
      if (!profileProjectId) return;
      try {
        await uploadCover.mutateAsync(file);
        toast.success(t("project.profile.coverSaved"));
      } catch {
        toast.error(t("project.profile.coverFailed"));
      }
    };

    const selectProjectCover = async (sourcePath: string) => {
      if (!profileProjectId) return;
      try {
        await selectCover.mutateAsync(sourcePath);
        toast.success(t("project.profile.coverSaved"));
      } catch {
        toast.error(t("project.profile.coverFailed"));
      }
    };

    return {
      ...options,
      activeList,
      allSummariesLoading: allSummaries.isLoading,
      archivedList,
      confirmPending,
      createNameError,
      createOpen,
      deletedList,
      handleCreate,
      isCreating: createProject.isPending,
      newName,
      onAction,
      pending,
      profileCandidateHasMore: profileCandidates.data?.hasMore ?? false,
      profileCandidateLoadedPage: profileCandidates.data?.page ?? profileCandidatePage,
      profileCandidatePage,
      profileCandidateTotal: profileCandidates.data?.total ?? 0,
      profileCandidateTotalPages: profileCandidates.data?.totalPages ?? 1,
      profileCandidates: profileCandidates.data?.items ?? [],
      profileCandidatesFetching: profileCandidates.isFetching,
      profileCandidatesLoading: profileCandidates.isLoading,
      profileName,
      profilePending:
        profileConfig.isPending || uploadCover.isPending || selectCover.isPending,
      profileProject,
      search,
      searchInputRef,
      setCreateOpen,
      setNewName,
      setPending,
      setProfileName,
      setProfileCandidatePage,
      setProfileProject,
      setSearch,
      setShareProject,
      setSort,
      shareProject,
      sort,
      saveProjectProfile,
      selectProjectCover,
      statusCounts,
      totalProjects,
      uploadProjectCover,
      trimmedNewName,
      wasColdOnMount,
    };
  };
}

export type ProjectDashboardController = ReturnType<
  ReturnType<typeof createUseProjectDashboardController>
>;
