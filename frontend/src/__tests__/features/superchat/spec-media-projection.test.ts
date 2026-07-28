// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  extractKeyframeVideoPreviewItems,
  extractPendingKeyframeVideoItem,
  extractUnifiedMediaItems,
} from "@/features/superchat/spec-media-projection";
import type { UiSpec } from "@/features/superchat/spec-extract";

describe("SuperChat spec media projection", () => {
  it("rejects non-media spec types", () => {
    expect(
      extractUnifiedMediaItems({
        type: "form",
        root: "root",
        elements: {
          root: { type: "Card", children: ["image"] },
          image: { type: "Image", props: { src: "/image.png" } },
        },
      }),
    ).toEqual([]);
  });

  it("orders root children first and projects supported media fields", () => {
    const spec: UiSpec = {
      type: "media_bundle",
      root: "root",
      elements: {
        root: { type: "Grid", children: ["video", "image", 42] },
        image: {
          type: "Image",
          props: {
            src: " /image.png ",
            overlayTitle: " Hero ",
            overlayDescription: " Portrait ",
            poster: "/image-poster.png",
          },
        },
        video: {
          type: "Video",
          props: {
            url: "/video.mp4",
            caption: "Trailer",
            description: "Preview",
            thumbnail: "/video-poster.jpg",
          },
        },
        audio: {
          type: "Audio",
          props: { src: "/audio.mp3" },
        },
        missing_source: { type: "Image", props: { title: "Missing" } },
        unsupported: { type: "Document", props: { src: "/story.txt" } },
      },
    };

    expect(extractUnifiedMediaItems(spec)).toEqual([
      {
        id: "video",
        kind: "video",
        title: "Trailer",
        description: "Preview",
        src: "/video.mp4",
        poster: "/video-poster.jpg",
      },
      {
        id: "image",
        kind: "image",
        title: "Hero",
        description: "Portrait",
        src: "/image.png",
        poster: "/image-poster.png",
      },
      {
        id: "audio",
        kind: "audio",
        title: "audio",
        description: "",
        src: "/audio.mp3",
        poster: "",
      },
    ]);
  });

  it("extracts playable Video elements for keyframe previews", () => {
    const spec: UiSpec = {
      type: "keyframe_video",
      root: "root",
      elements: {
        root: { type: "Card" },
        video: {
          type: "Video",
          props: {
            url: "/video.mp4",
            caption: "Beat 1",
            overlayDescription: "Opening",
            poster: "/poster.jpg",
          },
        },
        empty_video: { type: "Video", props: { caption: "Pending" } },
        image: { type: "Image", props: { src: "/image.png" } },
      },
    };

    expect(extractKeyframeVideoPreviewItems(spec)).toEqual([
      {
        id: "video",
        title: "Beat 1",
        description: "Opening",
        poster: "/poster.jpg",
        videoSrc: "/video.mp4",
      },
    ]);
  });

  it("projects pending status and clamps numeric progress", () => {
    const spec: UiSpec = {
      type: "keyframe_video",
      root: "root",
      elements: {
        root: {
          type: "Card",
          props: { title: " Episode 1 ", description: " Rendering " },
        },
        status: { type: "Badge", props: { label: " Queued " } },
        ignored_status: { type: "Badge", props: { label: "Later" } },
        progress: { type: "Progress", props: { value: "125" } },
      },
    };

    expect(extractPendingKeyframeVideoItem(spec)).toEqual({
      id: "pending",
      title: "Episode 1",
      description: "Rendering",
      status: "Queued",
      progress: 100,
    });
  });

  it("returns no pending item without title, status, or valid progress", () => {
    expect(
      extractPendingKeyframeVideoItem({
        root: "root",
        elements: {
          root: { type: "Card", props: {} },
          progress: { type: "Progress", props: { value: "unknown" } },
        },
      }),
    ).toBeNull();
  });
});
