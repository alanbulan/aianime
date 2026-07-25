// Copyright (c) 2026 AI anime
import { useCallback, useMemo } from "react";

import type { BeatsViewToggleId } from "@/modules/narrative_planning/application/episode-workbench-state";
import {
  DEFAULT_VIEW_TOGGLES,
  episodeWorkbenchScopeKey,
  useEpisodeWorkbenchStore,
} from "@/stores/episode-workbench-store";

export function useBeatsViewToggles(project: string, episode: number) {
  const scope = useMemo(() => ({ project, episode }), [episode, project]);
  const scopeKey = episodeWorkbenchScopeKey(scope);
  const persistedToggles = useEpisodeWorkbenchStore(
    useCallback(
      (state) =>
        state.viewTogglesByScope[scopeKey] ?? DEFAULT_VIEW_TOGGLES,
      [scopeKey],
    ),
  );
  const setViewToggles = useEpisodeWorkbenchStore(
    (state) => state.setViewToggles,
  );
  const toggles = useMemo(
    () => new Set<BeatsViewToggleId>(persistedToggles),
    [persistedToggles],
  );

  const toggle = useCallback(
    (id: BeatsViewToggleId) => {
      const next = new Set(toggles);
      if (next.has(id)) {
        if (next.size <= 1) return;
        next.delete(id);
      } else {
        next.add(id);
      }
      setViewToggles(scope, next);
    },
    [scope, setViewToggles, toggles],
  );

  return { toggles, toggle };
}
