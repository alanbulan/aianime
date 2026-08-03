// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  collectCanvasBeatContextEpisodeReferences,
  type CanvasBeatContextReferenceNodeLike,
} from "./canvasBeatContextReferences";

function beatContextNode(
  data: { projectId?: string; episode?: number },
): CanvasBeatContextReferenceNodeLike {
  return {
    type: "beatContextNode",
    data,
  };
}

describe("collectCanvasBeatContextEpisodeReferences", () => {
  it("uses node project overrides, defaults, deduplication, and stable ordering", () => {
    expect(collectCanvasBeatContextEpisodeReferences([
      beatContextNode({ projectId: "project-b", episode: 2 }),
      beatContextNode({ episode: 3 }),
      beatContextNode({ projectId: "project-b", episode: 2 }),
      beatContextNode({ projectId: "project-a", episode: 1 }),
    ], "project-default")).toEqual([
      { projectId: "project-a", episode: 1 },
      { projectId: "project-b", episode: 2 },
      { projectId: "project-default", episode: 3 },
    ]);
  });

  it("ignores unrelated nodes and incomplete references", () => {
    expect(collectCanvasBeatContextEpisodeReferences([
      { type: "uploadNode", data: {} },
      beatContextNode({ episode: 1 }),
      beatContextNode({ projectId: "project-1" }),
      beatContextNode({ projectId: "project-1", episode: 0 }),
    ], null)).toEqual([]);
  });
});
