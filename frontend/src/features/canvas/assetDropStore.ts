// Copyright (c) 2026 AI anime
import { create } from "zustand";

import type { CanvasCommitMediaType } from "@/modules/creative_canvas/public";

export interface ActiveNodeDrag {
  nodeId: string;
  mediaType: CanvasCommitMediaType;
  sourceUrl: string | null;
  thumbUrl: string | null;
  label: string;
  directorControlBundle: Record<string, unknown> | null;
}

export interface PendingAssetReplace {
  assetId: string;
  nodeId: string;
  sourceUrl: string;
  label: string;
  directorControlBundle: Record<string, unknown> | null;
  token: number;
}

interface AssetDropState {
  activeDrag: ActiveNodeDrag | null;
  hoverAssetId: string | null;
  pendingReplace: PendingAssetReplace | null;
  beginDrag: (drag: ActiveNodeDrag) => void;
  setHoverAsset: (assetId: string | null) => void;
  endDrag: (commit: boolean) => void;
  clearPendingReplace: () => void;
}

let replaceToken = 0;

export const useAssetDropStore = create<AssetDropState>((set, get) => ({
  activeDrag: null,
  hoverAssetId: null,
  pendingReplace: null,

  beginDrag: (drag) => set({ activeDrag: drag, hoverAssetId: null }),

  setHoverAsset: (assetId) => {
    if (get().hoverAssetId === assetId) return;
    set({ hoverAssetId: assetId });
  },

  endDrag: (commit) => {
    const { activeDrag, hoverAssetId } = get();
    if (commit && activeDrag && hoverAssetId && activeDrag.sourceUrl) {
      replaceToken += 1;
      set({
        pendingReplace: {
          assetId: hoverAssetId,
          nodeId: activeDrag.nodeId,
          sourceUrl: activeDrag.sourceUrl,
          label: activeDrag.label,
          directorControlBundle: activeDrag.directorControlBundle,
          token: replaceToken,
        },
        activeDrag: null,
        hoverAssetId: null,
      });
      return;
    }
    set({ activeDrag: null, hoverAssetId: null });
  },

  clearPendingReplace: () => set({ pendingReplace: null }),
}));
