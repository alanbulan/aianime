// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchLibrary = vi.hoisted(() => vi.fn());
const syncLibrary = vi.hoisted(() => vi.fn());
const addItem = vi.hoisted(() => vi.fn());
const deleteItem = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({
  deleteFreezoneVideoCharacterLibraryItem: deleteItem,
  fetchFreezoneVideoCharacterLibrary: fetchLibrary,
  submitFreezoneAddVideoCharacterLibraryItem: addItem,
  syncFreezoneAssetLibraryFromMainline: syncLibrary,
}));

import { freezoneAssetLibraryGateway } from "./freezoneAssetLibraryGateway";

describe("freezoneAssetLibraryGateway", () => {
  beforeEach(() => {
    fetchLibrary.mockReset();
    syncLibrary.mockReset();
    addItem.mockReset();
    deleteItem.mockReset();
  });

  it("normalizes compatible list containers and media URLs", async () => {
    fetchLibrary.mockResolvedValue({
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

    await expect(freezoneAssetLibraryGateway.list("project-1")).resolves.toEqual([
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
  });

  it("normalizes the synchronized mainline library", async () => {
    syncLibrary.mockResolvedValue([
      {
        id: "scene-1",
        name: "Scene",
        source: "scene",
        cover_url: "/static/scene.png",
      },
    ]);

    await expect(
      freezoneAssetLibraryGateway.syncFromMainline("project-1"),
    ).resolves.toEqual([
      {
        id: "scene-1",
        name: "Scene",
        media: "image",
        source: "scene",
        url: "/static/scene.png",
      },
    ]);
  });

  it("maps uploaded media and deletes by item id", async () => {
    addItem.mockResolvedValue({});
    deleteItem.mockResolvedValue({});

    await freezoneAssetLibraryGateway.addUploadedItem("project-1", {
      name: "Clip",
      media: "video",
      url: "/static/clip.mp4",
    });
    await freezoneAssetLibraryGateway.deleteItem("project-1", "video-1");

    expect(addItem).toHaveBeenCalledWith("project-1", {
      name: "Clip",
      media: "video",
      imageUrls: undefined,
      videoUrl: "/static/clip.mp4",
      audioUrl: undefined,
    });
    expect(deleteItem).toHaveBeenCalledWith("project-1", "video-1");
  });
});
