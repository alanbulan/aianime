// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  SEEDANCE_2_MAX_REFERENCE_AUDIO_DURATION_MS,
  validateVideoReferenceAudioDuration,
  type VideoReferenceAudioDurationGateway,
} from "./validateVideoReferenceAudioDuration";

function gateway(): VideoReferenceAudioDurationGateway {
  return { probeDurationMs: vi.fn().mockResolvedValue(null) };
}

describe("validateVideoReferenceAudioDuration", () => {
  it("reuses known positive durations and detects an over-limit total", async () => {
    const durationGateway = gateway();

    await expect(
      validateVideoReferenceAudioDuration(
        {
          references: [
            { url: "one.mp3", durationMs: 8_000 },
            { url: "two.mp3", durationMs: 7_201 },
          ],
        },
        durationGateway,
      ),
    ).resolves.toEqual({ totalDurationMs: 15_201, exceedsLimit: true });
    expect(durationGateway.probeDurationMs).not.toHaveBeenCalled();
  });

  it("probes missing durations and treats unavailable metadata as zero", async () => {
    const durationGateway = gateway();
    vi.mocked(durationGateway.probeDurationMs)
      .mockResolvedValueOnce(4_500)
      .mockResolvedValueOnce(null);

    await expect(
      validateVideoReferenceAudioDuration(
        {
          references: [
            { url: "known.mp3", durationMs: 3_000 },
            { url: "probe.mp3", durationMs: null },
            { url: "missing.mp3", durationMs: 0 },
          ],
        },
        durationGateway,
      ),
    ).resolves.toEqual({ totalDurationMs: 7_500, exceedsLimit: false });
    expect(durationGateway.probeDurationMs).toHaveBeenNthCalledWith(
      1,
      "probe.mp3",
    );
    expect(durationGateway.probeDurationMs).toHaveBeenNthCalledWith(
      2,
      "missing.mp3",
    );
  });

  it("allows a total exactly at the backend limit", async () => {
    const durationGateway = gateway();

    await expect(
      validateVideoReferenceAudioDuration(
        {
          references: [
            {
              url: "boundary.mp3",
              durationMs: SEEDANCE_2_MAX_REFERENCE_AUDIO_DURATION_MS,
            },
          ],
        },
        durationGateway,
      ),
    ).resolves.toEqual({
      totalDurationMs: SEEDANCE_2_MAX_REFERENCE_AUDIO_DURATION_MS,
      exceedsLimit: false,
    });
  });
});
