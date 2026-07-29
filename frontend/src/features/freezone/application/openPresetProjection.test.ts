// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import { personalCanvasIdForUsername } from "../domain/canvasIdentity";
import {
  createOpenPresetProjection,
  type OpenPresetProjectionDependencies,
} from "./openPresetProjection";

function createDependencies({
  username = "Alice",
  pathname = "/projects/project-a/episodes/2/script",
}: {
  username?: string | null;
  pathname?: string | null;
} = {}) {
  const currentPathname = vi.fn(() => pathname);
  const openCanvas = vi.fn();
  const buildProjection = vi.fn().mockResolvedValue({
    projection_key: "beat:2:3",
    facts_signature: "facts-1",
    nodes: [{ id: "projection-node" }],
    edges: [],
    metadata: null,
  });
  const publishProjection = vi.fn();
  const dependencies: OpenPresetProjectionDependencies = {
    currentUsername: () => username,
    createNavigation: () => ({ currentPathname, openCanvas }),
    buildProjection,
    publishProjection,
  };
  return {
    dependencies,
    currentPathname,
    openCanvas,
    buildProjection,
    publishProjection,
  };
}

describe("createOpenPresetProjection", () => {
  it("normalizes, builds, publishes, and opens the personal canvas", async () => {
    const {
      dependencies,
      openCanvas,
      buildProjection,
      publishProjection,
    } = createDependencies({ username: "  Alice  " });
    const openPresetProjection = createOpenPresetProjection(dependencies);

    const canvasId = await openPresetProjection("project-a", {
      scope: "beat",
      episode: 2,
      beat: 3,
      primary_slot: "sketch",
    });

    expect(canvasId).toBe(personalCanvasIdForUsername("Alice"));
    expect(buildProjection).toHaveBeenCalledWith("project-a", {
      scope: "beat",
      episode: 2,
      beat: 3,
      primary_slot: "render",
      projection_key: "beat:2:3",
      base_revision: 0,
    });
    expect(publishProjection).toHaveBeenCalledWith(
      "project-a",
      canvasId,
      expect.objectContaining({
        projectionKey: "beat:2:3",
        nodes: [{ id: "projection-node" }],
        edges: [],
        metadata: expect.objectContaining({
          projections: expect.objectContaining({
            "beat:2:3": expect.objectContaining({
              facts_signature: "facts-1",
              request: expect.objectContaining({ primary_slot: "render" }),
            }),
          }),
        }),
      }),
    );
    expect(openCanvas).toHaveBeenCalledWith(
      "project-a",
      canvasId,
      "/projects/project-a/episodes/2/script",
    );
  });

  it("does not navigate when the pathname changes while the build is pending", async () => {
    let resolveProjection!: (value: {
      projection_key: string;
      facts_signature: string;
      nodes: unknown[];
      edges: unknown[];
      metadata: null;
    }) => void;
    let pathname = "/projects/project-a/freezone";
    const buildProjection = vi.fn(
      () =>
        new Promise<{
          projection_key: string;
          facts_signature: string;
          nodes: unknown[];
          edges: unknown[];
          metadata: null;
        }>((resolve) => {
          resolveProjection = resolve;
        }),
    );
    const openCanvas = vi.fn();
    const publishProjection = vi.fn();
    const openPresetProjection = createOpenPresetProjection({
      currentUsername: () => "Alice",
      createNavigation: () => ({
        currentPathname: () => pathname,
        openCanvas,
      }),
      buildProjection,
      publishProjection,
    });

    const pending = openPresetProjection("project-a", {
      scope: "beat",
      episode: 2,
      beat: 3,
    });
    await vi.waitFor(() => expect(buildProjection).toHaveBeenCalledTimes(1));
    pathname = "/projects/project-a/episodes";
    resolveProjection({
      projection_key: "beat:2:3",
      facts_signature: "facts-1",
      nodes: [],
      edges: [],
      metadata: null,
    });

    await expect(pending).resolves.toBe(personalCanvasIdForUsername("Alice"));
    expect(publishProjection).toHaveBeenCalledTimes(1);
    expect(openCanvas).not.toHaveBeenCalled();
  });

  it("rejects a missing current user before building a projection", async () => {
    const { dependencies, buildProjection, publishProjection, openCanvas } =
      createDependencies({ username: "   " });
    const openPresetProjection = createOpenPresetProjection(dependencies);

    await expect(
      openPresetProjection("project-a", {
        scope: "episode",
        episode: 2,
      }),
    ).rejects.toThrow("Missing current user");
    expect(buildProjection).not.toHaveBeenCalled();
    expect(publishProjection).not.toHaveBeenCalled();
    expect(openCanvas).not.toHaveBeenCalled();
  });
});
