// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { resolveAudioReferenceDisplayName } from "./audioReferenceDisplayName";

const BASE_URL = "https://app.example.test";

describe("resolveAudioReferenceDisplayName", () => {
  it("prefers and trims the explicit display name", () => {
    expect(
      resolveAudioReferenceDisplayName(
        { displayName: "  narration.wav  ", audioUrl: "not a URL" },
        BASE_URL,
      ),
    ).toBe("narration.wav");
  });

  it("decodes the last path segment of a relative audio URL", () => {
    expect(
      resolveAudioReferenceDisplayName(
        { audioUrl: "/static/audio/%E6%97%81%E7%99%BD.wav?version=2" },
        BASE_URL,
      ),
    ).toBe("旁白.wav");
  });

  it("reads the last path segment from an absolute URL", () => {
    expect(
      resolveAudioReferenceDisplayName(
        { displayName: " ", audioUrl: "https://cdn.example.test/a/voice.mp3#t=1" },
        BASE_URL,
      ),
    ).toBe("voice.mp3");
  });

  it("returns null for an empty path or malformed encoding", () => {
    expect(
      resolveAudioReferenceDisplayName({ audioUrl: "" }, BASE_URL),
    ).toBeNull();
    expect(
      resolveAudioReferenceDisplayName({ audioUrl: "/audio/%E0%A4%A" }, BASE_URL),
    ).toBeNull();
    expect(
      resolveAudioReferenceDisplayName({ audioUrl: "/audio/file.wav" }, "invalid"),
    ).toBeNull();
  });
});
