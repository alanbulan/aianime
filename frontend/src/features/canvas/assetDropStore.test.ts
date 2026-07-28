// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from "vitest";

import { useAssetDropStore } from "./assetDropStore";

describe("assetDropStore", () => {
  beforeEach(() => {
    useAssetDropStore.setState({
      activeDrag: null,
      hoverAssetId: null,
      pendingReplace: null,
    });
  });

  it("commits a valid drag target and clears transient state", () => {
    useAssetDropStore.getState().beginDrag({
      nodeId: "node-1",
      mediaType: "image",
      sourceUrl: "/image.png",
      thumbUrl: "/image.png",
      label: "Image",
      directorControlBundle: null,
    });
    useAssetDropStore.getState().setHoverAsset("asset-1");
    useAssetDropStore.getState().endDrag(true);

    expect(useAssetDropStore.getState()).toMatchObject({
      activeDrag: null,
      hoverAssetId: null,
      pendingReplace: {
        assetId: "asset-1",
        nodeId: "node-1",
        sourceUrl: "/image.png",
        label: "Image",
        directorControlBundle: null,
      },
    });

    useAssetDropStore.getState().clearPendingReplace();
    expect(useAssetDropStore.getState().pendingReplace).toBeNull();
  });
});
