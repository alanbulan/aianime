// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it } from "vitest";

import { useCanvasStore } from "@/features/canvas/canvasStore";

describe("canvasStore image viewer", () => {
  beforeEach(() => {
    useCanvasStore.getState().closeImageViewer();
  });

  it("opens, navigates, and closes through the public store commands", () => {
    useCanvasStore.getState().openImageViewer("second.png", [
      "first.png",
      "second.png",
    ]);
    expect(useCanvasStore.getState().imageViewer).toMatchObject({
      isOpen: true,
      currentImageUrl: "second.png",
      currentIndex: 1,
    });

    useCanvasStore.getState().navigateImageViewer("prev");
    expect(useCanvasStore.getState().imageViewer).toMatchObject({
      currentImageUrl: "first.png",
      currentIndex: 0,
    });

    useCanvasStore.getState().closeImageViewer();
    expect(useCanvasStore.getState().imageViewer).toEqual({
      isOpen: false,
      currentImageUrl: null,
      imageList: [],
      currentIndex: 0,
    });
  });
});
