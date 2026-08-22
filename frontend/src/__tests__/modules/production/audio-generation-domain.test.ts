// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { episodeAudioBillingRevision } from "@/modules/production/public";

describe("Production audio generation domain", () => {
  it("builds a stable revision from every field that changes the exact quote", () => {
    expect(
      episodeAudioBillingRevision([
        {
          beat_number: 1,
          audio_type: "dialogue",
          speaker: "Hero_Main",
          audio_url: "/audio/one.mp3",
          narration_segment: "出发。",
        },
        {
          beat_number: 2,
          audio_type: "silence",
          speaker: "",
          audio_url: "",
          narration_segment: "",
        },
      ]),
    ).toBe(
      "1:dialogue:Hero_Main:/audio/one.mp3:出发。,2:silence:::",
    );
  });
});
