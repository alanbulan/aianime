// Copyright (c) 2026 AI anime
import { useCallback, useMemo } from "react";

import type { ActionPanelSectionState } from "@/modules/narrative_planning/application/use-action-panel-controller";
import type { SectionId } from "@/modules/narrative_planning/application/use-single-beat-panel-controller";
import {
  DEFAULT_ACTION_PANEL_SECTIONS,
  episodeWorkbenchScopeKey,
  useEpisodeWorkbenchStore,
} from "@/stores/episode-workbench-store";

export function useEpisodeWorkbenchSectionState(
  project: string,
  episode: number,
): ActionPanelSectionState {
  const scope = useMemo(() => ({ project, episode }), [episode, project]);
  const scopeKey = episodeWorkbenchScopeKey(scope);
  const persistedSections = useEpisodeWorkbenchStore(
    useCallback(
      (state) =>
        state.actionPanelSectionsByScope[scopeKey] ??
        DEFAULT_ACTION_PANEL_SECTIONS,
      [scopeKey],
    ),
  );
  const setActionPanelSections = useEpisodeWorkbenchStore(
    (state) => state.setActionPanelSections,
  );
  const openSections = useMemo(
    () => new Set<SectionId>(persistedSections),
    [persistedSections],
  );
  const setOpenSections = useCallback(
    (sections: ReadonlySet<SectionId>) => {
      setActionPanelSections(scope, sections);
    },
    [scope, setActionPanelSections],
  );

  return { openSections, setOpenSections };
}
