// Copyright (c) 2026 AI anime
export interface CanvasBoxSelectionNode {
  selected?: boolean;
}

export interface CanvasBoxSelectionStore {
  nodes: readonly CanvasBoxSelectionNode[];
}

export type CanvasBoxSelectionStoreHook = <TSelected>(
  selector: (state: CanvasBoxSelectionStore) => TSelected,
) => TSelected;

export interface IsBoxSelectingDependencies {
  useStore: CanvasBoxSelectionStoreHook;
}

/** Hide per-node operations while a box selection spans multiple nodes. */
export function createUseIsBoxSelecting({
  useStore,
}: IsBoxSelectingDependencies) {
  return function useIsBoxSelecting(): boolean {
    return useStore((state) => {
      let selectedCount = 0;
      for (const node of state.nodes) {
        if (!node.selected) {
          continue;
        }
        selectedCount += 1;
        if (selectedCount > 1) {
          return true;
        }
      }
      return false;
    });
  };
}
