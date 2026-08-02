// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useState } from "react";

import type { ProjectSummary } from "@/modules/project_workspace/public";

import { canvasIdForFreezoneEntry } from "../domain/canvasIdentity";

export interface FreezoneProjectPageError {
  title: string;
  message: string;
  details?: string;
  copyText?: string;
}

export type FreezoneProjectPageController =
  | { status: "loading" }
  | {
      status: "not-found";
      projectId: string;
      returnToProjects(): void;
    }
  | {
      status: "ready";
      project: ProjectSummary;
      canvasId: string;
      globalError: FreezoneProjectPageError | null;
      closeGlobalError(): void;
    };

export interface FreezoneProjectPageControllerDependencies {
  useUsername(): string | null;
  useProjectSummaries(): {
    data: ProjectSummary[] | undefined;
    isLoading: boolean;
  };
  useCanvasParam(): string | null;
  subscribeGlobalError(
    listener: (error: FreezoneProjectPageError) => void,
  ): () => void;
  readLastCanvas(projectId: string): string | null;
  navigateToProjects(): void;
}

export function createUseFreezoneProjectPageController({
  useUsername,
  useProjectSummaries,
  useCanvasParam,
  subscribeGlobalError,
  readLastCanvas,
  navigateToProjects,
}: FreezoneProjectPageControllerDependencies) {
  return function useFreezoneProjectPageController(
    projectId: string,
  ): FreezoneProjectPageController {
    const username = useUsername();
    const { data: projects, isLoading } = useProjectSummaries();
    const canvasParam = useCanvasParam();
    const [globalError, setGlobalError] =
      useState<FreezoneProjectPageError | null>(null);

    useEffect(
      () => subscribeGlobalError(setGlobalError),
      [subscribeGlobalError],
    );

    const project = useMemo(
      () =>
        projects?.find((item) => item.id === projectId) ??
        projects?.find((item) => item.name === projectId) ??
        null,
      [projects, projectId],
    );

    if (isLoading || !projects) {
      return { status: "loading" };
    }

    if (!project) {
      return {
        status: "not-found",
        projectId,
        returnToProjects: navigateToProjects,
      };
    }

    return {
      status: "ready",
      project,
      canvasId: canvasIdForFreezoneEntry({
        explicitCanvasId: canvasParam ?? readLastCanvas(project.id),
        username,
      }),
      globalError,
      closeGlobalError: () => setGlobalError(null),
    };
  };
}
