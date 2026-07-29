// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { buildBeatContextNodeRefreshPatch } from "./beatContextRefreshProjection";

describe("beatContextRefreshProjection", () => {
  it("preserves local time of day when sync response omits the field", () => {
    const patch = buildBeatContextNodeRefreshPatch(
      "demo",
      {
        episode: 1,
        beat: 3,
        label: "EP1 / Beat 3",
        visual_description: "全景镜头，兰州拉面馆内。",
        narration_segment: "",
        scene_id: "兰州拉面馆",
        detected_identities: [],
        detected_props: [],
        sketch_colors: {},
        prop_marker_colors: {},
        assets: [],
      },
      {
        snapshot: { timeOfDay: "夜晚" },
        beat_edit_fields: { time_of_day: "夜晚" },
      },
    );

    expect(patch.snapshot?.timeOfDay).toBe("夜晚");
    expect(patch.beat_edit_fields?.time_of_day).toBe("夜晚");
  });
});
