// Copyright (c) 2026 AI anime
import { useEffect, useMemo, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { ReactFlowProvider } from "@xyflow/react";

import { GlobalErrorDialog } from "@/components/GlobalErrorDialog";
import {
  subscribeOpenGlobalErrorDialog,
  type GlobalErrorDialogDetail,
} from "@/features/app/errorDialogEvents";
import { useAuthStore } from "@/modules/identity_access/public";
import { useAllProjectSummaries } from "@/modules/project_workspace/public";
import { readLastCanvas, writeUrl } from "@/lib/url-params";

import { FreezoneShell } from "./FreezoneShell";
import { canvasIdForFreezoneEntry } from "./domain/canvasIdentity";

export interface FreezoneProjectPageProps {
  projectId: string;
}

export function FreezoneProjectPage({ projectId }: FreezoneProjectPageProps) {
  const username = useAuthStore((state) => state.username);
  const { data: projects, isLoading } = useAllProjectSummaries();
  const [globalError, setGlobalError] = useState<GlobalErrorDialogDetail | null>(null);
  // Router state includes a navigation queued for the next microtask; window.location can lag it.
  const canvasParam = useRouterState({
    select: (state) => {
      const canvas = (state.location.search as { canvas?: unknown }).canvas;
      return typeof canvas === "string" && canvas.length > 0 ? canvas : null;
    },
  });

  useEffect(() => subscribeOpenGlobalErrorDialog(setGlobalError), []);

  const matchedProject = useMemo(
    () =>
      projects?.find((item) => item.id === projectId) ??
      projects?.find((item) => item.name === projectId) ??
      null,
    [projects, projectId],
  );

  if (isLoading || !projects) {
    return (
      <div className="-m-6 flex h-[calc(100%+3rem)] items-center justify-center bg-bg-dark text-text-muted">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!matchedProject) {
    return (
      <div className="-m-6 flex h-[calc(100%+3rem)] items-center justify-center bg-bg-dark">
        <div className="max-w-md rounded-2xl border border-border-default bg-surface px-6 py-8 text-center">
          <div className="mb-2 text-base font-medium text-text">项目不存在</div>
          <div className="mb-6 text-sm text-text-muted">
            当前账号下找不到项目 <code className="rounded bg-bg-dark px-1 py-0.5">{projectId}</code>。
          </div>
          <button
            type="button"
            onClick={() => writeUrl({ project: null, canvas: null })}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground transition hover:bg-primary/85"
          >
            返回项目
          </button>
        </div>
      </div>
    );
  }

  const canvasId = canvasIdForFreezoneEntry({
    explicitCanvasId: canvasParam ?? readLastCanvas(matchedProject.id),
    username,
  });

  return (
    <ReactFlowProvider>
      <div className="-m-6 h-[calc(100%+3rem)] w-[calc(100%+3rem)] bg-bg-dark">
        <FreezoneShell project={matchedProject} canvasId={canvasId} />
        <GlobalErrorDialog
          isOpen={Boolean(globalError)}
          title={globalError?.title ?? ""}
          message={globalError?.message ?? ""}
          details={globalError?.details}
          copyText={globalError?.copyText}
          onClose={() => setGlobalError(null)}
        />
      </div>
    </ReactFlowProvider>
  );
}
