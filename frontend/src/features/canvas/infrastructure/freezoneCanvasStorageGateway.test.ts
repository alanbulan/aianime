// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";
import { freezoneCanvasStorageGateway } from "./freezoneCanvasStorageGateway";

vi.mock("@/shared/api/client", () => ({
  apiCall: vi.fn(),
}));

describe("freezoneCanvasStorageGateway", () => {
  beforeEach(() => {
    vi.mocked(apiCall).mockReset();
  });

  it("reads an encoded canvas path and forwards cancellation", async () => {
    const controller = new AbortController();
    vi.mocked(apiCall).mockResolvedValueOnce({ nodes: [], edges: [] });

    await freezoneCanvasStorageGateway.getCanvas({
      projectId: "project/a",
      canvasId: "user eric",
      signal: controller.signal,
    });

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2Fa/freezone/canvases/user%20eric",
      { signal: controller.signal },
    );
  });

  it("posts the preset payload through the canonical endpoint", async () => {
    const payload = {
      scope: "beat" as const,
      episode: 1,
      beat: 4,
      canvas_id: "default",
      overwrite_existing: true,
    };
    vi.mocked(apiCall).mockResolvedValueOnce({
      canvas_id: "default",
      reused: false,
      url: "/freezone/?canvas=default",
    });

    await freezoneCanvasStorageGateway.createFromPreset({
      projectId: "project-a",
      payload,
    });

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project-a/freezone/canvases:from-preset",
      { method: "POST", json: payload },
    );
  });
});
