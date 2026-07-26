// Copyright (c) 2026 AI anime
import { useQuery } from "@tanstack/react-query";
import { listFreezoneCanvases } from "@/api/canvas";
import {
  listFreezoneBeatContext,
  listFreezoneProjectAssets,
} from "@/features/freezone/public";
import { queryKeys } from "@/lib/query-keys";

export function useFreezoneCanvases(
  project: string | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: project
      ? queryKeys.freezoneCanvases(project)
      : ["projects", "__missing__", "freezone", "canvases"],
    queryFn: ({ signal }) => {
      if (!project) {
        throw new Error("project is required");
      }
      return listFreezoneCanvases(project, { signal });
    },
    enabled: enabled && Boolean(project),
    staleTime: 15_000,
  });
}

export function useFreezoneProjectAssets(
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
      return listFreezoneProjectAssets(project, { signal });
    },
    enabled: enabled && Boolean(project),
    staleTime: 15_000,
  });
}

export function useFreezoneBeatContext(
  project: string | null | undefined,
  opts: { episode?: number | null; beat?: number | null } = {},
  enabled = true,
) {
  const episode = typeof opts.episode === "number" ? opts.episode : null;
  const beat = typeof opts.beat === "number" ? opts.beat : null;
  return useQuery({
    queryKey: project
      ? queryKeys.freezoneBeatContext(project, episode, beat)
      : ["projects", "__missing__", "freezone", "beat-context", episode, beat],
    queryFn: ({ signal }) => {
      if (!project) {
        throw new Error("project is required");
      }
      return listFreezoneBeatContext(project, {
        ...(episode !== null ? { episode } : {}),
        ...(beat !== null ? { beat } : {}),
        signal,
      });
    },
    enabled: enabled && Boolean(project),
    staleTime: 15_000,
  });
}
