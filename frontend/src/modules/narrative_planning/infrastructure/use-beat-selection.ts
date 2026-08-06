// Copyright (c) 2026 AI anime
import { useCallback, useMemo, useState } from "react";

import type {
  EpisodeWorkbenchScope,
  SelectionState,
} from "@/modules/narrative_planning/application/episode-workbench-state";
import {
  DEFAULT_BEAT_SELECTION,
  episodeWorkbenchScopeKey,
  useEpisodeWorkbenchStore,
  type PersistedBeatSelection,
} from "@/shared/stores/episode-workbench-store";

function toSelectionState(selection: PersistedBeatSelection): SelectionState {
  if (selection.mode === "single") {
    return { mode: "single", beatNum: selection.beatNum };
  }
  if (selection.mode === "multi") {
    return { mode: "multi", checked: new Set(selection.checked) };
  }
  return { mode: "none" };
}

export function useBeatSelection(scope?: EpisodeWorkbenchScope) {
  const scopeKey = scope ? episodeWorkbenchScopeKey(scope) : null;
  const persistedSelection = useEpisodeWorkbenchStore(
    useCallback(
      (state) =>
        scopeKey
          ? state.beatSelectionByScope[scopeKey] ?? DEFAULT_BEAT_SELECTION
          : DEFAULT_BEAT_SELECTION,
      [scopeKey],
    ),
  );
  const setPersistedSelection = useEpisodeWorkbenchStore(
    (state) => state.setBeatSelection,
  );

  const [state, setState] = useState<SelectionState>({ mode: "none" });
  const [activeBeat, setActiveBeat] = useState<number | null>(null);
  const effectiveState = useMemo(
    () => (scope ? toSelectionState(persistedSelection) : state),
    [persistedSelection, scope, state],
  );
  const effectiveActiveBeat = scope ? persistedSelection.activeBeat : activeBeat;

  const selectSingle = useCallback(
    (beatNumber: number) => {
      if (scope) {
        setPersistedSelection(scope, {
          mode: "single",
          beatNum: beatNumber,
          activeBeat: beatNumber,
        });
        return;
      }
      setActiveBeat(beatNumber);
      setState({ mode: "single", beatNum: beatNumber });
    },
    [scope, setPersistedSelection],
  );

  const toggleCheck = useCallback(
    (beatNumber: number) => {
      if (scope) {
        const previous =
          persistedSelection.mode === "multi"
            ? new Set(persistedSelection.checked)
            : new Set<number>();
        const next = new Set(previous);
        if (next.has(beatNumber)) next.delete(beatNumber);
        else next.add(beatNumber);
        if (next.size === 0) {
          setPersistedSelection(scope, {
            mode: "none",
            activeBeat: null,
          });
          return;
        }
        setPersistedSelection(scope, {
          mode: "multi",
          checked: [...next],
          activeBeat: null,
        });
        return;
      }
      setActiveBeat(null);
      setState((previous) => {
        const checked =
          previous.mode === "multi"
            ? new Set(previous.checked)
            : new Set<number>();
        if (checked.has(beatNumber)) checked.delete(beatNumber);
        else checked.add(beatNumber);
        return checked.size === 0
          ? { mode: "none" }
          : { mode: "multi", checked };
      });
    },
    [persistedSelection, scope, setPersistedSelection],
  );

  const handleCardClick = useCallback(
    (beatNumber: number) => {
      if (scope) {
        setPersistedSelection(scope, {
          mode: "single",
          beatNum: beatNumber,
          activeBeat: beatNumber,
        });
        return;
      }
      setActiveBeat(beatNumber);
      setState({ mode: "single", beatNum: beatNumber });
    },
    [scope, setPersistedSelection],
  );

  const clearSelection = useCallback(() => {
    if (scope) {
      setPersistedSelection(scope, {
        mode: "none",
        activeBeat: null,
      });
      return;
    }
    setActiveBeat(null);
    setState({ mode: "none" });
  }, [scope, setPersistedSelection]);

  return {
    state: effectiveState,
    activeBeat: effectiveActiveBeat,
    handleCardClick,
    toggleCheck,
    selectSingle,
    clearSelection,
  };
}
