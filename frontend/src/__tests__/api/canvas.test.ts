// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";
import {
  buildProjectionFromPreset,
  getProjectionStatuses,
} from "@/api/canvas";

vi.mock("@/shared/api/client", () => ({
  apiCall: vi.fn(),
}));

describe("canvas projection api", () => {
  beforeEach(() => {
    vi.mocked(apiCall).mockReset();
  });

  it("builds a preset projection graph without a target canvas", async () => {
    vi.mocked(apiCall).mockResolvedValueOnce({
      projection_key: "beat:1:4",
      facts_signature: "sig",
      nodes: [],
      edges: [],
      metadata: {},
    });

    await buildProjectionFromPreset("project-a", {
      scope: "beat",
      episode: 1,
      beat: 4,
      projection_key: "beat:1:4",
      base_revision: 0,
    });

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project-a/freezone/projections:build-from-preset",
      {
        method: "POST",
        json: {
          scope: "beat",
          episode: 1,
          beat: 4,
          projection_key: "beat:1:4",
          base_revision: 0,
        },
      },
    );
  });

  it("posts projection status request to a canvas", async () => {
    vi.mocked(apiCall).mockResolvedValueOnce({
      canvas_id: "user_eric",
      revision: 8,
      projections: [
        {
          projection_key: "beat:1:4",
          stale: true,
          stored_facts_signature: "old",
          current_facts_signature: "new",
        },
      ],
    });

    const result = await getProjectionStatuses("project-a", "user_eric", ["beat:1:4"]);

    expect(result.projections[0].stale).toBe(true);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project-a/freezone/canvases/user_eric/projections:status",
      {
        method: "POST",
        json: { projection_keys: ["beat:1:4"] },
      },
    );
  });

});
