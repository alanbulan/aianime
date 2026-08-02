// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { resolveGenerationOutputUrl } from "./generationOutputUrl";

describe("resolveGenerationOutputUrl", () => {
  it("uses the image output field priority", () => {
    expect(
      resolveGenerationOutputUrl(
        {
          output_url: "output.png",
          image_url: "image.png",
          url: "generic.png",
        },
        "image",
      ),
    ).toBe("output.png");
  });

  it("uses the video output field priority", () => {
    expect(
      resolveGenerationOutputUrl(
        {
          video_url: "video.mp4",
          output_url: "output.mp4",
          url: "generic.mp4",
        },
        "video",
      ),
    ).toBe("video.mp4");
  });

  it("uses the audio output field priority", () => {
    expect(
      resolveGenerationOutputUrl(
        {
          audio_url: "audio.wav",
          output_url: "output.wav",
          url: "generic.wav",
        },
        "audio",
      ),
    ).toBe("audio.wav");
  });

  it("falls through empty or non-string values and rejects missing results", () => {
    expect(
      resolveGenerationOutputUrl(
        { video_url: "", output_url: 42, url: "fallback.mp4" },
        "video",
      ),
    ).toBe("fallback.mp4");
    expect(resolveGenerationOutputUrl(null, "image")).toBeNull();
    expect(resolveGenerationOutputUrl({}, "audio")).toBeNull();
  });
});
