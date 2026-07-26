// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  classifyVideoReferenceItems,
  videoReferenceCapsForMode,
  type VideoReferenceItem,
} from "./videoReferenceLimits";

function image(nodeId: string): VideoReferenceItem {
  return { kind: "image", nodeId, imageUrl: `${nodeId}.png` };
}

function video(nodeId: string): VideoReferenceItem {
  return { kind: "video", nodeId, videoUrl: `${nodeId}.mp4` };
}

function audio(nodeId: string): VideoReferenceItem {
  return { kind: "audio", nodeId, audioUrl: `${nodeId}.wav` };
}

describe("videoReferenceLimits", () => {
  it("defines caps only for all-reference and first/last-frame modes", () => {
    expect(videoReferenceCapsForMode("allReference")).toEqual({
      image: 9,
      video: 3,
      audio: 3,
    });
    expect(videoReferenceCapsForMode("firstLastFrame")).toEqual({
      image: 2,
      video: 0,
      audio: 0,
    });
    expect(videoReferenceCapsForMode("textToVideo")).toBeNull();
    expect(videoReferenceCapsForMode("imageReference")).toBeNull();
  });

  it("numbers mixed references by media kind and marks all-reference overflow", () => {
    const items = [
      image("image-1"),
      video("video-1"),
      audio("audio-1"),
      ...Array.from({ length: 9 }, (_, index) => image(`image-${index + 2}`)),
      video("video-2"),
      video("video-3"),
      video("video-4"),
      audio("audio-2"),
      audio("audio-3"),
      audio("audio-4"),
    ];
    const entries = classifyVideoReferenceItems(items, "allReference");

    expect(
      entries.filter((entry) => entry.item.kind === "image").map((entry) => [
        entry.typeIndex,
        entry.withinCap,
      ]),
    ).toEqual([
      [1, true],
      [2, true],
      [3, true],
      [4, true],
      [5, true],
      [6, true],
      [7, true],
      [8, true],
      [9, true],
      [10, false],
    ]);
    expect(
      entries.filter((entry) => entry.item.kind === "video").map((entry) =>
        entry.withinCap,
      ),
    ).toEqual([true, true, true, false]);
    expect(
      entries.filter((entry) => entry.item.kind === "audio").map((entry) =>
        entry.withinCap,
      ),
    ).toEqual([true, true, true, false]);
  });

  it("rejects non-image first/last references and leaves uncapped modes enabled", () => {
    const items = [
      image("image-1"),
      video("video-1"),
      image("image-2"),
      audio("audio-1"),
      image("image-3"),
    ];

    expect(
      classifyVideoReferenceItems(items, "firstLastFrame").map((entry) => ({
        index: entry.typeIndex,
        withinCap: entry.withinCap,
      })),
    ).toEqual([
      { index: 1, withinCap: true },
      { index: 1, withinCap: false },
      { index: 2, withinCap: true },
      { index: 1, withinCap: false },
      { index: 3, withinCap: false },
    ]);
    expect(
      classifyVideoReferenceItems(items, "imageReference").every(
        (entry) => entry.withinCap,
      ),
    ).toBe(true);
  });
});
