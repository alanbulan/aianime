// Copyright (c) 2026 AI anime
import type {
  CanvasEdge,
  CanvasNode,
} from "@/features/canvas/domain/canvasNodes";
import { useAuthStore } from "@/modules/identity_access/public";
import { getAppRouter } from "@/lib/app-router";
import { writeUrl } from "@/lib/url-params";

import {
  consumeQueuedLocalFreezoneProjections,
  queueLocalFreezoneProjection,
} from "./application/canvasRuntimeState";
import {
  createOpenPresetProjection,
  type PresetProjectionNavigation,
} from "./application/openPresetProjection";
import { buildProjectionFromPreset } from "./composition";

function createPresetProjectionNavigation(): PresetProjectionNavigation {
  const router = getAppRouter();
  const currentPathname = () =>
    router?.state.location.pathname ??
    (typeof window !== "undefined" ? window.location.pathname : null);

  return {
    currentPathname,
    openCanvas(projectId, canvasId, pathname) {
      const freezonePath = `/projects/${encodeURIComponent(projectId)}/freezone`;
      if (pathname !== freezonePath) {
        if (router) {
          router.navigate({
            to: "/projects/$project/freezone",
            params: { project: projectId },
            search: { canvas: canvasId },
            resetScroll: false,
          });
        } else if (typeof window !== "undefined") {
          window.history.pushState(
            {},
            "",
            `${freezonePath}?canvas=${encodeURIComponent(canvasId)}`,
          );
          window.dispatchEvent(new PopStateEvent("popstate"));
        }
        return;
      }
      writeUrl({ canvas: canvasId });
    },
  };
}

export const openPresetProjectionInMyCanvas = createOpenPresetProjection({
  currentUsername: () => useAuthStore.getState().username,
  createNavigation: createPresetProjectionNavigation,
  buildProjection: buildProjectionFromPreset,
  publishProjection(projectId, canvasId, projection) {
    queueLocalFreezoneProjection(projectId, canvasId, {
      ...projection,
      nodes: projection.nodes as CanvasNode[],
      edges: projection.edges as CanvasEdge[],
    });
    consumeQueuedLocalFreezoneProjections(projectId, canvasId);
  },
});
