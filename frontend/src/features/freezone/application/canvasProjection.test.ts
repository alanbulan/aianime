// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  buildProjectionFromPreset,
  getProjectionStatuses,
  type FreezoneCanvasProjectionGateway,
} from "./canvasProjection";

function createGateway(): FreezoneCanvasProjectionGateway {
  return {
    buildProjection: vi.fn().mockResolvedValue({
      projection_key: "beat:1:4",
      facts_signature: "sig",
      nodes: [],
      edges: [],
    }),
    getStatuses: vi.fn().mockResolvedValue({
      canvas_id: "user_eric",
      projections: [],
    }),
  };
}

describe("canvasProjection", () => {
  it("delegates projection builds through the application port", async () => {
    const gateway = createGateway();
    const params = {
      projectId: "project-a",
      payload: {
        scope: "beat" as const,
        episode: 1,
        beat: 4,
        projection_key: "beat:1:4",
        base_revision: 0,
      },
    };

    await buildProjectionFromPreset(params, gateway);

    expect(gateway.buildProjection).toHaveBeenCalledWith(params);
  });

  it("delegates scoped status queries through the application port", async () => {
    const gateway = createGateway();
    const params = {
      projectId: "project-a",
      canvasId: "user_eric",
      projectionKeys: ["beat:1:4"],
    };

    await getProjectionStatuses(params, gateway);

    expect(gateway.getStatuses).toHaveBeenCalledWith(params);
  });
});
