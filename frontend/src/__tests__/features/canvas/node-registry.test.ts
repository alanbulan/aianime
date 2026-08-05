// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

;
import {
  canvasNodeDefinitions,
  getMenuNodeDefinitions,
} from "@/features/canvas/domain/nodeRegistry";

import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
describe("canvas node registry", () => {
  it("creates standalone shot context nodes from the menu with local schema data", () => {
    const definition = canvasNodeDefinitions[CANVAS_NODE_TYPES.beatContext];
    const data = definition.createDefaultData() as Record<string, unknown>;

    expect(getMenuNodeDefinitions().map((item) => item.type)).toContain(
      CANVAS_NODE_TYPES.beatContext,
    );
    expect(definition.menuLabelKey).toBe("node.menu.beatContext");
    expect(data).toMatchObject({
      context_scope: "standalone",
      beat_context: {
        schema: "beat_context.v1",
        source: "standalone",
        title: "自定义镜头上下文",
        visual_description: "",
        narration_segment: "",
        scene_id: "",
        detected_identities: [],
        detected_props: [],
        sketch_colors: {},
        prop_marker_colors: {},
      },
      snapshot: {
        visualDescription: "",
        narrationSegment: "",
        sceneId: "",
        detectedIdentities: [],
        detectedProps: [],
        sketchColors: {},
        propMarkerColors: {},
      },
      syncStatus: "fresh",
    });
    expect(data).not.toHaveProperty("mainline_context");
  });
});
