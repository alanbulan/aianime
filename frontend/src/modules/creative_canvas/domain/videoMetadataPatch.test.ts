// Copyright (c) 2026 AI anime

import { describe, expect, it } from "vitest";

import { buildVideoMetadataPatch } from "./videoMetadataPatch";

describe("buildVideoMetadataPatch", () => {
  it("writes all changed video metadata fields", () => {
    expect(
      buildVideoMetadataPatch(
        { widthPx: null, heightPx: null, durationMs: null },
        { widthPx: 1920, heightPx: 1080, durationMs: 12_345 },
      ),
    ).toEqual({ widthPx: 1920, heightPx: 1080, durationMs: 12_345 });
  });

  it("writes only fields that differ from persisted metadata", () => {
    expect(
      buildVideoMetadataPatch(
        { widthPx: 1920, heightPx: 720, durationMs: 12_345 },
        { widthPx: 1920, heightPx: 1080, durationMs: 12_345 },
      ),
    ).toEqual({ heightPx: 1080 });
  });

  it("returns an empty patch when metadata is unchanged", () => {
    expect(
      buildVideoMetadataPatch(
        { widthPx: 1280, heightPx: 720, durationMs: 5000 },
        { widthPx: 1280, heightPx: 720, durationMs: 5000 },
      ),
    ).toEqual({});
  });

  it("does not persist partial metadata without both dimensions", () => {
    expect(
      buildVideoMetadataPatch(
        { widthPx: null, heightPx: null, durationMs: null },
        { widthPx: 0, heightPx: 720, durationMs: 5000 },
      ),
    ).toEqual({});
    expect(
      buildVideoMetadataPatch(
        { widthPx: null, heightPx: null, durationMs: null },
        { widthPx: 1280, heightPx: 0, durationMs: 5000 },
      ),
    ).toEqual({});
  });
});
