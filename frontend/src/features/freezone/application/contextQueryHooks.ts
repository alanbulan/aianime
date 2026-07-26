// Copyright (c) 2026 AI anime
import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import {
  listFreezoneBeatContext,
  listFreezoneProjectAssets,
  type FreezoneContextQueryGateway,
} from "./contextQueries";

export function createFreezoneContextQueryHooks(
  gateway: FreezoneContextQueryGateway,
) {
  function useFreezoneProjectAssets(
    project: string | null | undefined,
    enabled = true,
  ) {
    return useQuery({
      queryKey: project
        ? queryKeys.freezoneProjectAssets(project)
        : ["projects", "__missing__", "freezone", "assets"],
      queryFn: ({ signal }) => {
        if (!project) {
          throw new Error("project is required");
        }
        return listFreezoneProjectAssets(project, { signal }, gateway);
      },
      enabled: enabled && Boolean(project),
      staleTime: 15_000,
    });
  }

  function useFreezoneBeatContext(
    project: string | null | undefined,
    options: { episode?: number | null; beat?: number | null } = {},
    enabled = true,
  ) {
    const episode =
      typeof options.episode === "number" ? options.episode : null;
    const beat = typeof options.beat === "number" ? options.beat : null;
    return useQuery({
      queryKey: project
        ? queryKeys.freezoneBeatContext(project, episode, beat)
        : [
            "projects",
            "__missing__",
            "freezone",
            "beat-context",
            episode,
            beat,
          ],
      queryFn: ({ signal }) => {
        if (!project) {
          throw new Error("project is required");
        }
        return listFreezoneBeatContext(
          project,
          {
            ...(episode !== null ? { episode } : {}),
            ...(beat !== null ? { beat } : {}),
            signal,
          },
          gateway,
        );
      },
      enabled: enabled && Boolean(project),
      staleTime: 15_000,
    });
  }

  return { useFreezoneBeatContext, useFreezoneProjectAssets };
}

export type FreezoneContextQueryHooks = ReturnType<
  typeof createFreezoneContextQueryHooks
>;
