// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { episodeAudioModelCallCount } from "@/modules/production/public";

describe("Production audio generation domain", () => {
  it("counts only non-manual narration and dialogue model calls", () => {
    expect(
      episodeAudioModelCallCount([
        { beat_number: 1, audio_type: "narration" },
        { beat_number: 2, audio_type: "dialogue", speaker: "Hero_Main" },
        { beat_number: 3, audio_type: "silence" },
        { beat_number: 4, audio_type: "action" },
        {
          beat_number: 5,
          audio_type: "narration",
          is_manual_shot: true,
        },
        { beat_number: 0, audio_type: "narration" },
      ]),
    ).toBe(2);
  });

  it("uses speaker presence to infer dialogue and otherwise defaults to narration", () => {
    expect(
      episodeAudioModelCallCount([
        { beat_number: 1, audio_type: "", speaker: "Hero_Main" },
        { beat_number: 2, audio_type: null, speaker: "" },
      ]),
    ).toBe(2);
  });
});
