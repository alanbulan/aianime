// Copyright (c) 2026 AI anime
import type { ReactNode } from "react";
import { ReactFlowProvider } from "@xyflow/react";

import type { ProjectSummary } from "@/modules/project_workspace/public";

import type {
  FreezoneProjectPageController,
  FreezoneProjectPageError,
} from "./useFreezoneProjectPageController";

export interface FreezoneProjectPageViewProps {
  controller: FreezoneProjectPageController;
  renderShell(project: ProjectSummary, canvasId: string): ReactNode;
  renderGlobalError(
    error: FreezoneProjectPageError | null,
    onClose: () => void,
  ): ReactNode;
}

export function FreezoneProjectPageView({
  controller,
  renderShell,
  renderGlobalError,
}: FreezoneProjectPageViewProps) {
  if (controller.status === "loading") {
    return (
      <div className="-m-6 flex h-[calc(100%+3rem)] items-center justify-center bg-bg-dark text-text-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (controller.status === "not-found") {
    return (
      <div className="-m-6 flex h-[calc(100%+3rem)] items-center justify-center bg-bg-dark">
        <div className="max-w-md rounded-2xl border border-border-default bg-surface px-6 py-8 text-center">
          <div className="mb-2 text-base font-medium text-text">项目不存在</div>
          <div className="mb-6 text-sm text-text-muted">
            当前账号下找不到项目{" "}
            <code className="rounded bg-bg-dark px-1 py-0.5">
              {controller.projectId}
            </code>
            。
          </div>
          <button
            type="button"
            onClick={controller.returnToProjects}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition hover:bg-primary/85"
          >
            返回项目
          </button>
        </div>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="-m-6 h-[calc(100%+3rem)] w-[calc(100%+3rem)] bg-bg-dark">
        {renderShell(controller.project, controller.canvasId)}
        {renderGlobalError(
          controller.globalError,
          controller.closeGlobalError,
        )}
      </div>
    </ReactFlowProvider>
  );
}
