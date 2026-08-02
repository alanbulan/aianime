// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  buildProjectionFromPreset,
  createCanvasProjectionCommands,
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

describe("Creative Canvas projection application", () => {
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

  it("builds and applies a projection recovered from canvas metadata", async () => {
    const dependencies = {
      buildProjection: vi.fn().mockResolvedValue({
        projection_key: "beat:1:4",
        facts_signature: "facts-v2",
        nodes: [{ id: "projection-node" }],
        edges: [{ id: "projection-edge" }],
        metadata: { source: "server" },
      }),
      queueProjection: vi.fn(),
      consumeProjectionQueue: vi.fn().mockReturnValue(true),
      removeProjection: vi.fn().mockReturnValue(true),
      markProjectionFresh: vi.fn(),
    };
    const commands = createCanvasProjectionCommands(dependencies);

    await expect(commands.sync({
      projectId: "project-a",
      canvasId: "user_eric",
      metadata: {
        projections: {
          "beat:1:4": {
            projection_key: "beat:1:4",
            request: {
              scope: "beat",
              episode: 1,
              beat: 4,
              primary_slot: "sketch",
            },
          },
        },
      },
      projectionKey: "beat:1:4",
    })).resolves.toBe(true);

    expect(dependencies.buildProjection).toHaveBeenCalledWith({
      projectId: "project-a",
      payload: {
        scope: "beat",
        episode: 1,
        beat: 4,
        primary_slot: "render",
        asset_kind: undefined,
        character: undefined,
        identity_id: undefined,
        asset_id: undefined,
        projection_key: "beat:1:4",
        base_revision: 0,
        force_refresh: true,
      },
    });
    expect(dependencies.queueProjection).toHaveBeenCalledWith(
      "project-a",
      "user_eric",
      expect.objectContaining({
        projectionKey: "beat:1:4",
        nodes: [{ id: "projection-node" }],
        edges: [{ id: "projection-edge" }],
      }),
    );
    expect(dependencies.consumeProjectionQueue).toHaveBeenCalledWith(
      "project-a",
      "user_eric",
    );
    expect(dependencies.markProjectionFresh).toHaveBeenCalledWith("beat:1:4");
  });

  it("does not build projection metadata that cannot recover a request", async () => {
    const dependencies = {
      buildProjection: vi.fn(),
      queueProjection: vi.fn(),
      consumeProjectionQueue: vi.fn(),
      removeProjection: vi.fn(),
      markProjectionFresh: vi.fn(),
    };
    const commands = createCanvasProjectionCommands(dependencies);

    await expect(commands.sync({
      projectId: "project-a",
      canvasId: "user_eric",
      metadata: null,
      projectionKey: "beat:1:4",
    })).resolves.toBe(false);
    expect(dependencies.buildProjection).not.toHaveBeenCalled();
    expect(dependencies.queueProjection).not.toHaveBeenCalled();
  });

  it("removes a projection through the runtime port", () => {
    const dependencies = {
      buildProjection: vi.fn(),
      queueProjection: vi.fn(),
      consumeProjectionQueue: vi.fn(),
      removeProjection: vi.fn().mockReturnValue(true),
      markProjectionFresh: vi.fn(),
    };
    const commands = createCanvasProjectionCommands(dependencies);

    expect(commands.remove({
      projectId: "project-a",
      canvasId: "user_eric",
      projectionKey: "beat:1:4",
    })).toBe(true);
    expect(dependencies.removeProjection).toHaveBeenCalledWith(
      "project-a",
      "user_eric",
      "beat:1:4",
    );
  });
});
