// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  resolveDroppedVideoFile,
  type DroppedVideoDataTransfer,
  type DroppedVideoFileItem,
} from "./resolveDroppedVideoFile";

function videoFile(name = "clip.mp4", type = "video/mp4"): File {
  return new File(["video"], name, { type });
}

function fileItem(file: File | null, kind = "file"): DroppedVideoFileItem {
  return {
    kind,
    getAsFile: () => file,
  };
}

describe("resolveDroppedVideoFile", () => {
  it("returns the first direct video file", () => {
    const file = videoFile();

    expect(resolveDroppedVideoFile({ files: [file] })).toBe(file);
  });

  it("accepts an extension-only MXF file", () => {
    const file = videoFile("source.MXF", "");

    expect(resolveDroppedVideoFile({ files: [file] })).toBe(file);
  });

  it("falls back to file items when the direct file is not a video", () => {
    const image = new File(["image"], "poster.png", { type: "image/png" });
    const video = videoFile("fallback.mov", "video/quicktime");
    const transfer: DroppedVideoDataTransfer = {
      files: [image],
      items: [fileItem(null, "string"), fileItem(video)],
    };

    expect(resolveDroppedVideoFile(transfer)).toBe(video);
  });

  it("returns null for non-video and empty transfers", () => {
    const text = new File(["text"], "notes.txt", { type: "text/plain" });

    expect(
      resolveDroppedVideoFile({
        files: [text],
        items: [fileItem(null), fileItem(text)],
      }),
    ).toBeNull();
    expect(resolveDroppedVideoFile({})).toBeNull();
  });
});
