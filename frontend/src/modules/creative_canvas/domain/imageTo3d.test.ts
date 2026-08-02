// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  resolveCanvasImageTo3dSourceKind,
  sourceFromImageTo3gsResult,
  type CanvasImageTo3dSourceNode,
} from "./imageTo3d";

function node(data: Record<string, unknown>): CanvasImageTo3dSourceNode {
  return { data };
}

describe("image-to-3D domain", () => {
  it("keeps panoramic sources explicit", () => {
    expect(resolveCanvasImageTo3dSourceKind(null, "pano")).toBe("pano");
  });

  it("recognizes reverse-master roles", () => {
    expect(
      resolveCanvasImageTo3dSourceKind(
        node({ output_role: "scene_reverse_master" }),
        "master",
      ),
    ).toBe("reverse");
    expect(
      resolveCanvasImageTo3dSourceKind(
        node({ __freezone_source: { role: "scene_reverse_master" } }),
        "master",
      ),
    ).toBe("reverse");
  });

  it("defaults ordinary images to master", () => {
    expect(resolveCanvasImageTo3dSourceKind(node({}), "master")).toBe(
      "master",
    );
  });

  it("normalizes task results into SOG world sources", () => {
    expect(
      sourceFromImageTo3gsResult(
        { output_url: "/static/demo/world.sog" },
        {
          id: "task-source",
          sourceKind: "pano",
          label: "360 生成世界",
        },
      ),
    ).toMatchObject({
      id: "task-source",
      source_type: "sog",
      source_kind: "pano",
      label: "360 生成世界",
      ply_url: "/static/demo/world.sog",
      url: "/static/demo/world.sog",
      current: true,
    });
  });

  it("prefers a nested SOG artifact and rejects results without world media", () => {
    expect(
      sourceFromImageTo3gsResult(
        {
          output_url: "/static/demo/fallback.ply",
          artifacts: [{ url: "/static/demo/preferred.sog?v=1" }],
        },
        { id: "task-source", sourceKind: "master", label: "正面世界" },
      )?.url,
    ).toBe("/static/demo/preferred.sog?v=1");
    expect(
      sourceFromImageTo3gsResult(
        { status: "completed" },
        { id: "task-source", sourceKind: "master", label: "正面世界" },
      ),
    ).toBeNull();
  });
});
