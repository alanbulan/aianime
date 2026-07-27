// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall, apiRequest } from "@/shared/api/client";

const requestJson = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/client", () => ({
  apiCall: vi.fn(),
  apiRequest: vi.fn(() => ({ json: requestJson })),
}));

import { freezoneAudioVoiceCatalogGateway } from "./freezoneAudioVoiceCatalogGateway";

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
  vi.mocked(apiRequest).mockClear();
  requestJson.mockReset();
});

describe("freezoneAudioVoiceCatalogGateway", () => {
  it("maps audio reference transport fields to the Canvas DTO", async () => {
    vi.mocked(apiCall).mockResolvedValue({
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
      freezoneAudioVoiceCatalogGateway.listReferences("project/1"),
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
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/audio/references",
    );
  });

  it("uploads a custom voice without exposing its transport DTO", async () => {
    const file = new File(["voice"], "voice.wav", { type: "audio/wav" });
    requestJson.mockResolvedValue({ ok: true, data: { voice_id: "voice-1" } });

    await expect(
      freezoneAudioVoiceCatalogGateway.createVoice(
        "project/2",
        file,
        " Voice ",
      ),
    ).resolves.toBeUndefined();
    expect(apiRequest).toHaveBeenCalledWith(
      "projects/project%2F2/freezone/audio/voices",
      expect.objectContaining({ method: "POST", timeout: false }),
    );
    const requestBody = vi.mocked(apiRequest).mock.calls[0]?.[1]
      ?.body as FormData;
    const uploadedFile = requestBody.get("file");
    expect(uploadedFile).toBeInstanceOf(File);
    if (!(uploadedFile instanceof File)) {
      throw new Error("voice upload did not include a file");
    }
    expect(uploadedFile.name).toBe("voice.wav");
    expect(uploadedFile.type).toBe("audio/wav");
    await expect(uploadedFile.text()).resolves.toBe("voice");
    expect(requestBody.get("name")).toBe("Voice");
  });

  it("surfaces a custom voice upload error", async () => {
    requestJson.mockResolvedValue({ ok: false, error: "voice rejected" });

    await expect(
      freezoneAudioVoiceCatalogGateway.createVoice(
        "project-2",
        new Blob(["voice"], { type: "audio/wav" }),
      ),
    ).rejects.toThrow("voice rejected");
  });
});
