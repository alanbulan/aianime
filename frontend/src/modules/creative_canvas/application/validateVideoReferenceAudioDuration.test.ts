// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  validateVideoReferenceDuration,
  validateVideoReferenceAudioDuration,
  type VideoReferenceAudioDurationGateway,
  type VideoReferenceDurationGateway,
} from "./validateVideoReferenceAudioDuration";

const MAX_DURATION_MS = 15_200;

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
          maxDurationMs: MAX_DURATION_MS,
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
          maxDurationMs: MAX_DURATION_MS,
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
              durationMs: MAX_DURATION_MS,
            },
          ],
          maxDurationMs: MAX_DURATION_MS,
        },
        durationGateway,
      ),
    ).resolves.toEqual({
      totalDurationMs: MAX_DURATION_MS,
      exceedsLimit: false,
    });
  });
});

describe("validateVideoReferenceDuration", () => {
  const durationGateway: VideoReferenceDurationGateway = {
    probeDurationMs: vi.fn().mockResolvedValue(null),
  };

  it("reports per-item and total duration violations independently", async () => {
    await expect(
      validateVideoReferenceDuration(
        {
          media: "video",
          references: [
            { url: "short.mp4", label: "短片", durationMs: 1_999 },
            { url: "long.mp4", label: "长片", durationMs: 10_001 },
          ],
          limits: {
            minMs: 2_000,
            maxMs: 10_000,
            totalMaxMs: 20_000,
          },
        },
        durationGateway,
      ),
    ).resolves.toMatchObject({
      totalDurationMs: 12_000,
      rejection: {
        kind: "tooShort",
        limitMs: 2_000,
        references: [{ label: "短片", durationMs: 1_999 }],
      },
    });

    await expect(
      validateVideoReferenceDuration(
        {
          media: "audio",
          references: [
            { url: "one.mp3", durationMs: 8_000 },
            { url: "two.mp3", durationMs: 7_201 },
          ],
          limits: { totalMaxMs: 15_200 },
        },
        durationGateway,
      ),
    ).resolves.toMatchObject({
      totalDurationMs: 15_201,
      rejection: { kind: "totalTooLong", limitMs: 15_200 },
    });
  });

  it("does not enforce a total minimum when any duration is unknown", async () => {
    const probingGateway: VideoReferenceDurationGateway = {
      probeDurationMs: vi.fn().mockResolvedValue(null),
    };
    await expect(
      validateVideoReferenceDuration(
        {
          media: "video",
          references: [
            { url: "known.mp4", durationMs: 2_000 },
            { url: "unknown.mp4", durationMs: null },
          ],
          limits: { totalMinMs: 5_000 },
        },
        probingGateway,
      ),
    ).resolves.toEqual({ totalDurationMs: 2_000, rejection: null });
    expect(probingGateway.probeDurationMs).toHaveBeenCalledWith(
      "unknown.mp4",
      "video",
    );
  });
});
