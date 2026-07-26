// Copyright (c) 2026 AI anime
import { useCanvasStore } from '@/stores/canvasStore';

/** Hide per-node operations while a box selection spans multiple nodes. */
export function useIsBoxSelecting(): boolean {
  return useCanvasStore((state) => {
    let count = 0;
    for (const node of state.nodes) {
      if (!node.selected) {
        continue;
      }
      count += 1;
      if (count > 1) {
        return true;
      }
    }
    return false;
  });
}
