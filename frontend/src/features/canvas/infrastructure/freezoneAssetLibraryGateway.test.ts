// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

import { freezoneAssetLibraryGateway } from "./freezoneAssetLibraryGateway";

describe("freezoneAssetLibraryGateway", () => {
  beforeEach(() => {
    vi.mocked(apiCall).mockReset();
  });

  it("normalizes compatible list containers and media URLs", async () => {
    vi.mocked(apiCall).mockResolvedValue({
      items: [
        {
          id: 7,
          name: "Character",
          source: "character",
          imageUrls: ["/static/character.png"],
        },
        {
          item_id: "video-1",
          name: "Clip",
          media: "video",
          video_url: "/static/clip.mp4",
        },
        {
          itemId: "audio-1",
          name: "Voice",
          media: "audio",
          audio_url: "/static/voice.mp3",
        },
        { id: "missing-url", name: "Ignored" },
      ],
    });

    await expect(
      freezoneAssetLibraryGateway.list("project/1"),
    ).resolves.toEqual([
      {
        id: "7",
        name: "Character",
        media: "image",
        source: "character",
        url: "/static/character.png",
      },
      {
        id: "video-1",
        name: "Clip",
        media: "video",
        source: "upload",
        url: "/static/clip.mp4",
      },
      {
        id: "audio-1",
        name: "Voice",
        media: "audio",
        source: "upload",
        url: "/static/voice.mp3",
      },
    ]);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/video/character-library",
    );
  });

  it("normalizes the synchronized mainline library", async () => {
    vi.mocked(apiCall).mockResolvedValue([
      {
        id: "scene-1",
        name: "Scene",
        source: "scene",
        cover_url: "/static/scene.png",
      },
    ]);

    await expect(
      freezoneAssetLibraryGateway.syncFromMainline("project/1"),
    ).resolves.toEqual([
      {
        id: "scene-1",
        name: "Scene",
        media: "image",
        source: "scene",
        url: "/static/scene.png",
      },
    ]);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/video/asset-library/sync-from-mainline",
      { method: "POST" },
    );
  });

  it("maps uploaded media and deletes by item id", async () => {
    vi.mocked(apiCall).mockResolvedValue({});

    await freezoneAssetLibraryGateway.addUploadedItem("project/1", {
      name: "Clip",
      media: "video",
      url: "/static/clip.mp4",
    });
    await freezoneAssetLibraryGateway.deleteItem("project/1", "video/1");

    expect(apiCall).toHaveBeenNthCalledWith(
      1,
      "projects/project%2F1/freezone/video/character-library",
      {
        method: "POST",
        json: {
          name: "Clip",
          media: "video",
          video_url: "/static/clip.mp4",
        },
      },
    );
    expect(apiCall).toHaveBeenNthCalledWith(
      2,
      "projects/project%2F1/freezone/video/character-library/video%2F1",
      { method: "DELETE" },
    );
  });
});
