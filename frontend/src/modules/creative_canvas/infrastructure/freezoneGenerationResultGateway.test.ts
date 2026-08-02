// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

import {
  fetchCanvasGenerationResult,
  fetchCanvasGenerationResultUrl,
} from "./freezoneGenerationResultGateway";

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
});

describe("freezoneGenerationResultGateway", () => {
  it("reads a typed result from the encoded task path", async () => {
    const result = { prompt: "cinematic rain" };
    vi.mocked(apiCall).mockResolvedValue(result);

    await expect(
      fetchCanvasGenerationResult<{ prompt: string }>(
        "project/1",
        "freezone/reverse",
        "job/1",
      ),
    ).resolves.toBe(result);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/jobs/freezone%2Freverse/job%2F1/result",
    );
  });

  it("projects the media URL without exposing its transport wrapper", async () => {
    vi.mocked(apiCall).mockResolvedValue({ url: "/audio/result.mp3" });

    await expect(
      fetchCanvasGenerationResultUrl(
        "project/2",
        "freezone_audio_speech",
        "job/2",
      ),
    ).resolves.toBe("/audio/result.mp3");
  });
});
