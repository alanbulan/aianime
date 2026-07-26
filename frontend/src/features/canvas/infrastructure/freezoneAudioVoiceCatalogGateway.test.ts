// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const createFreezoneAudioVoice = vi.hoisted(() => vi.fn());
const fetchFreezoneAudioReferences = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({
  createFreezoneAudioVoice,
  fetchFreezoneAudioReferences,
}));

import { freezoneAudioVoiceCatalogGateway } from "./freezoneAudioVoiceCatalogGateway";

beforeEach(() => {
  createFreezoneAudioVoice.mockReset();
  fetchFreezoneAudioReferences.mockReset();
});

describe("freezoneAudioVoiceCatalogGateway", () => {
  it("maps audio reference transport fields to the Canvas DTO", async () => {
    fetchFreezoneAudioReferences.mockResolvedValue({
      available: [
        {
          scope: "identity_resolved",
          character_name: "Lin",
          identity_id: "identity-1",
          slot: "youth",
          voice_id: null,
          label: "Lin Youth",
          language: "zh-CN",
          sex: "female",
          preview_url: "/voice/lin.wav",
        },
      ],
    });

    await expect(
      freezoneAudioVoiceCatalogGateway.listReferences("project-1"),
    ).resolves.toEqual([
      {
        ref: {
          scope: "identity_resolved",
          characterName: "Lin",
          identityId: "identity-1",
          slot: "youth",
        },
        label: "Lin Youth",
        language: "zh-CN",
        gender: "female",
        previewUrl: "/voice/lin.wav",
      },
    ]);
    expect(fetchFreezoneAudioReferences).toHaveBeenCalledWith("project-1");
  });

  it("delegates custom voice creation without exposing its transport DTO", async () => {
    const file = new File(["voice"], "voice.wav", { type: "audio/wav" });
    createFreezoneAudioVoice.mockResolvedValue({ voice_id: "voice-1" });

    await expect(
      freezoneAudioVoiceCatalogGateway.createVoice(
        "project-2",
        file,
        "Voice",
      ),
    ).resolves.toBeUndefined();
    expect(createFreezoneAudioVoice).toHaveBeenCalledWith(
      "project-2",
      file,
      "Voice",
    );
  });
});
