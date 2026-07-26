// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";
import { httpFreezoneCanvasProjectionGateway } from "./httpFreezoneCanvasProjectionGateway";

vi.mock("@/shared/api/client", () => ({
  apiCall: vi.fn(),
}));

describe("httpFreezoneCanvasProjectionGateway", () => {
  beforeEach(() => {
    vi.mocked(apiCall).mockReset();
  });

  it("builds a preset projection without a target canvas", async () => {
    const payload = {
      scope: "beat" as const,
      episode: 1,
      beat: 4,
      projection_key: "beat:1:4",
      base_revision: 0,
    };
    vi.mocked(apiCall).mockResolvedValueOnce({
      projection_key: "beat:1:4",
      facts_signature: "sig",
      nodes: [],
      edges: [],
    });

    await httpFreezoneCanvasProjectionGateway.buildProjection({
      projectId: "project/a",
      payload,
    });

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2Fa/freezone/projections:build-from-preset",
      { method: "POST", json: payload },
    );
  });

  it("posts a projection status request to an encoded canvas", async () => {
    vi.mocked(apiCall).mockResolvedValueOnce({
      canvas_id: "user eric",
      revision: 8,
      projections: [],
    });

    await httpFreezoneCanvasProjectionGateway.getStatuses({
      projectId: "project-a",
      canvasId: "user eric",
      projectionKeys: ["beat:1:4"],
    });

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project-a/freezone/canvases/user%20eric/projections:status",
      {
        method: "POST",
        json: { projection_keys: ["beat:1:4"] },
      },
    );
  });
});
