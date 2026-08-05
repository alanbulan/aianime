// Copyright (c) 2026 AI anime
import { createElement } from "react";
import { useRouterState } from "@tanstack/react-router";

import { GlobalErrorDialog } from "@/components/GlobalErrorDialog";
import { subscribeOpenGlobalErrorDialog } from "@/modules/creative_canvas/infrastructure/errorDialogEvents";
import { readLastCanvas, writeUrl } from "@/lib/url-params";
import {
  createUseFreezoneProjectPageController,
  FreezoneProjectPageView,
  type FreezoneProjectPageError,
} from "@/modules/creative_canvas/public";
import { useAuthStore } from "@/modules/identity_access/public";
import {
  useAllProjectSummaries,
  type ProjectSummary,
} from "@/modules/project_workspace/public";

import { FreezoneShell } from "./creative-canvas-shell-composition";

const useFreezoneProjectPageController =
  createUseFreezoneProjectPageController({
    useUsername: () => useAuthStore((state) => state.username),
    useProjectSummaries: useAllProjectSummaries,
    useCanvasParam: () =>
      useRouterState({
        select: (state) => {
          const canvas = (state.location.search as { canvas?: unknown }).canvas;
          return typeof canvas === "string" && canvas.length > 0
            ? canvas
            : null;
        },
      }),
    subscribeGlobalError: subscribeOpenGlobalErrorDialog,
    readLastCanvas,
    navigateToProjects: () => writeUrl({ project: null, canvas: null }),
  });

function renderShell(project: ProjectSummary, canvasId: string) {
  return createElement(FreezoneShell, { project, canvasId });
}

function renderGlobalError(
  error: FreezoneProjectPageError | null,
  onClose: () => void,
) {
  return createElement(GlobalErrorDialog, {
    isOpen: Boolean(error),
    title: error?.title ?? "",
    message: error?.message ?? "",
    details: error?.details,
    copyText: error?.copyText,
    onClose,
  });
}

export interface FreezoneProjectPageProps {
  projectId: string;
}

export function FreezoneProjectPage({ projectId }: FreezoneProjectPageProps) {
  const controller = useFreezoneProjectPageController(projectId);
  return createElement(FreezoneProjectPageView, {
    controller,
    renderShell,
    renderGlobalError,
  });
}
