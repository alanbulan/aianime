// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import type { CanvasNode } from "./canvasNodes";
import { resolveCanvasImageTo3dSourceKind } from "./imageTo3d";

function node(data: Record<string, unknown>): CanvasNode {
  return { id: "source", data } as CanvasNode;
}

describe("resolveCanvasImageTo3dSourceKind", () => {
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
});
