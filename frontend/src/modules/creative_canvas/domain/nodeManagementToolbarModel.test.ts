// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { projectNodeManagementToolbar } from "./nodeManagementToolbarModel";

describe("nodeManagementToolbarModel", () => {
  it("projects protected groups to projection removal and sync", () => {
    expect(
      projectNodeManagementToolbar(
        {
          projectionKey: " beat:1:4 ",
          canRemove: true,
          sourceUrl: null,
        },
      ),
    ).toEqual({
      projectionKey: "beat:1:4",
      removalTarget: "projection",
      canCommit: false,
    });
  });

  it("lets ordinary media-bearing nodes delete and commit", () => {
    expect(
      projectNodeManagementToolbar(
        { canRemove: true, sourceUrl: "/source.png" },
      ),
    ).toEqual({
      projectionKey: null,
      removalTarget: "node",
      canCommit: true,
    });
  });

  it("hides removal for generation, video, and audio nodes", () => {
    expect(
      projectNodeManagementToolbar({
        canRemove: false,
        sourceUrl: "/generated.png",
      }),
    ).toMatchObject({ removalTarget: null, canCommit: true });
    expect(
      projectNodeManagementToolbar({
        canRemove: false,
        sourceUrl: "/clip.mp4",
      }),
    ).toMatchObject({ removalTarget: null, canCommit: true });
    expect(
      projectNodeManagementToolbar({ canRemove: false, sourceUrl: null }),
    ).toMatchObject({ removalTarget: null, canCommit: false });
  });
});
