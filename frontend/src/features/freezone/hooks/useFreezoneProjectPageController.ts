// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

import {
  subscribeOpenGlobalErrorDialog,
  type GlobalErrorDialogDetail,
} from "@/features/app/errorDialogEvents";
import { readLastCanvas, writeUrl } from "@/lib/url-params";
import { useAuthStore } from "@/modules/identity_access/public";
import {
  useAllProjectSummaries,
  type ProjectSummary,
} from "@/modules/project_workspace/public";

import { canvasIdForFreezoneEntry } from "@/modules/creative_canvas/public";

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
      globalError: GlobalErrorDialogDetail | null;
      closeGlobalError(): void;
    };

export function useFreezoneProjectPageController(
  projectId: string,
): FreezoneProjectPageController {
  const username = useAuthStore((state) => state.username);
  const { data: projects, isLoading } = useAllProjectSummaries();
  const [globalError, setGlobalError] =
    useState<GlobalErrorDialogDetail | null>(null);
  const canvasParam = useRouterState({
    select: (state) => {
      const canvas = (state.location.search as { canvas?: unknown }).canvas;
      return typeof canvas === "string" && canvas.length > 0 ? canvas : null;
    },
  });

  useEffect(() => subscribeOpenGlobalErrorDialog(setGlobalError), []);

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
      returnToProjects: () => writeUrl({ project: null, canvas: null }),
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
}
