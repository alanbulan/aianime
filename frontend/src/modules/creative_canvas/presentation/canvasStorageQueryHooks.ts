// Copyright (c) 2026 AI anime
import { useQuery } from "@tanstack/react-query";

import {
  listFreezoneCanvases,
  type FreezoneCanvasStorageGateway,
} from "../application/canvasStorageOperations";

export function createFreezoneCanvasQueryHooks(
  gateway: Pick<FreezoneCanvasStorageGateway, "listCanvases">,
) {
  function useFreezoneCanvases(
    project: string | null | undefined,
    enabled = true,
  ) {
    return useQuery({
      queryKey: project
        ? ["projects", project, "freezone", "canvases"]
        : ["projects", "__missing__", "freezone", "canvases"],
      queryFn: ({ signal }) => {
        if (!project) {
          throw new Error("project is required");
        }
        return listFreezoneCanvases({ projectId: project, signal }, gateway);
      },
      enabled: enabled && Boolean(project),
      staleTime: 15_000,
    });
  }

  return { useFreezoneCanvases };
}

export type FreezoneCanvasQueryHooks = ReturnType<
  typeof createFreezoneCanvasQueryHooks
>;
