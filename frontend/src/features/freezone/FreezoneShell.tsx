// Copyright (c) 2026 AI anime
import { createElement } from "react";

import type { ProjectSummary } from "@/modules/project_workspace/public";

import { useFreezoneShellController } from "./hooks/useFreezoneShellController";
import { FreezoneShellView } from "./presentation/FreezoneShellView";

interface FreezoneShellProps {
  project: ProjectSummary;
  canvasId: string;
}

/**
 * Mounts the shared xyflow canvas inside the AI anime Beat Workbench shell.
 * The controller owns runtime orchestration while the view owns shell markup.
 */
export function FreezoneShell({ project, canvasId }: FreezoneShellProps) {
  const controller = useFreezoneShellController({
    projectId: project.id,
    canvasId,
  });

  return createElement(FreezoneShellView, { controller });
}
