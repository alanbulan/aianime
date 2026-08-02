// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { isCommitCandidateData } from "./canvasCommitEligibility";

const baseCandidate = {
  user_spawned: true,
  slot_target: { kind: "frame", episode: 1, beat: 2 },
};

describe("canvas commit eligibility", () => {
  it.each([
    "imageUrl",
    "videoUrl",
    "audioUrl",
    "fileUrl",
    "modelUrl",
    "plyUrl",
    "url",
  ])("accepts an uncommitted candidate with a %s source", (sourceField) => {
    expect(
      isCommitCandidateData({
        ...baseCandidate,
        [sourceField]: "/media/source",
      }),
    ).toBe(true);
  });

  it.each([
    { ...baseCandidate },
    { ...baseCandidate, imageUrl: "/image.png", preset_managed: true },
    { ...baseCandidate, imageUrl: "/image.png", user_spawned: false },
    {
      ...baseCandidate,
      imageUrl: "/image.png",
      slot_target: { kind: "unknown" },
    },
    {
      ...baseCandidate,
      imageUrl: "/image.png",
      committed_at: "2026-01-01T00:00:00Z",
    },
  ])("rejects an ineligible node shape", (data) => {
    expect(isCommitCandidateData(data)).toBe(false);
  });
});
