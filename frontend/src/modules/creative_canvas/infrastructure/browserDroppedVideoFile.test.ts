// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  resolveBrowserDroppedVideoFile,
  type DroppedVideoDataTransfer,
  type DroppedVideoFileItem,
} from "./browserDroppedVideoFile";

function videoFile(name = "clip.mp4", type = "video/mp4"): File {
  return new File(["video"], name, { type });
}

function fileItem(file: File | null, kind = "file"): DroppedVideoFileItem {
  return {
    kind,
    getAsFile: () => file,
  };
}

describe("resolveBrowserDroppedVideoFile", () => {
  it("returns the first direct video file", () => {
    const file = videoFile();

    expect(resolveBrowserDroppedVideoFile({ files: [file] })).toBe(file);
  });

  it("accepts an extension-only MXF file", () => {
    const file = videoFile("source.MXF", "");

    expect(resolveBrowserDroppedVideoFile({ files: [file] })).toBe(file);
  });

  it("falls back to file items when the direct file is not a video", () => {
    const image = new File(["image"], "poster.png", { type: "image/png" });
    const video = videoFile("fallback.mov", "video/quicktime");
    const transfer: DroppedVideoDataTransfer = {
      files: [image],
      items: [fileItem(null, "string"), fileItem(video)],
    };

    expect(resolveBrowserDroppedVideoFile(transfer)).toBe(video);
  });

  it("returns null for non-video and empty transfers", () => {
    const text = new File(["text"], "notes.txt", { type: "text/plain" });

    expect(
      resolveBrowserDroppedVideoFile({
        files: [text],
        items: [fileItem(null), fileItem(text)],
      }),
    ).toBeNull();
    expect(resolveBrowserDroppedVideoFile({})).toBeNull();
  });
});
