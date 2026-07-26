// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  createCanvasFromPreset,
  getFreezoneCanvas,
  type FreezoneCanvasStorageGateway,
} from "./freezoneCanvasStorage";

function createGateway(): FreezoneCanvasStorageGateway {
  return {
    getCanvas: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    createFromPreset: vi.fn().mockResolvedValue({
      canvas_id: "default",
      reused: false,
      url: "/freezone/?canvas=default",
    }),
  };
}

describe("freezoneCanvasStorage", () => {
  it("delegates canvas reads through the storage port", async () => {
    const gateway = createGateway();
    const params = {
      projectId: "project-a",
      canvasId: "user_eric",
      signal: new AbortController().signal,
    };

    await getFreezoneCanvas(params, gateway);

    expect(gateway.getCanvas).toHaveBeenCalledWith(params);
  });

  it("delegates preset restoration through the storage port", async () => {
    const gateway = createGateway();
    const params = {
      projectId: "project-a",
      payload: {
        scope: "beat" as const,
        episode: 1,
        beat: 4,
        canvas_id: "user_eric",
        overwrite_existing: true,
      },
    };

    await createCanvasFromPreset(params, gateway);

    expect(gateway.createFromPreset).toHaveBeenCalledWith(params);
  });
});
