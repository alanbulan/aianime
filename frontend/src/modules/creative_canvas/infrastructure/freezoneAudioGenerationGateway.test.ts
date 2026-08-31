// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";

vi.mock("@/shared/api/client", () => ({ apiCall: vi.fn() }));

import { freezoneAudioGenerationGateway } from "./freezoneAudioGenerationGateway";

beforeEach(() => {
  vi.mocked(apiCall).mockReset();
});

describe("freezoneAudioGenerationGateway", () => {
  it("posts a speech command to the encoded endpoint", async () => {
    const task = { task_key: "speech-task", task_type: "speech", job_id: "1" };
    vi.mocked(apiCall).mockResolvedValue(task);

    await expect(
      freezoneAudioGenerationGateway.submitSpeech("project/1", {
        text: "Line",
        emotionPrompt: "calm",
        voiceRef: { scope: "identity", identityId: "identity-1" },
      }),
    ).resolves.toBe(task);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F1/freezone/audio/speech",
      {
        method: "POST",
        json: {
          text: "Line",
          emotion_prompt: "calm",
          mode: "VOICE_CLONE",
          voice: "",
          model_selector: "",
          voice_ref: {
            scope: "identity",
            character_name: "",
            identity_id: "identity-1",
            slot: "",
            voice_id: "",
          },
          target_episode: undefined,
          target_beat: undefined,
        },
      },
    );
  });

  it("posts a model preset as SPEECH without a reference audio contract", async () => {
    const task = { task_key: "speech-task", task_type: "speech", job_id: "2" };
    vi.mocked(apiCall).mockResolvedValue(task);

    await freezoneAudioGenerationGateway.submitSpeech("project", {
      text: "Preview line",
      emotionPrompt: "calm",
      voiceRef: {
        scope: "model_preset",
        modelId: "MOSS_TTSD_V0_5",
        voiceId: "alex",
      },
    });

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project/freezone/audio/speech",
      {
        method: "POST",
        json: expect.objectContaining({
          mode: "SPEECH",
          voice: "alex",
          emotion_prompt: "",
          voice_ref: undefined,
        }),
      },
    );
  });

  it("posts a music command to the encoded endpoint", async () => {
    const task = { task_key: "music-task", task_type: "music", job_id: "2" };
    vi.mocked(apiCall).mockResolvedValue(task);

    await expect(
      freezoneAudioGenerationGateway.submitMusic("project/2", {
        prompt: "Score",
        musicLengthMs: 30_000,
        forceInstrumental: false,
        respectSectionsDurations: true,
      }),
    ).resolves.toBe(task);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F2/freezone/audio/music",
      {
        method: "POST",
        json: {
          input: "Score",
          music_length_ms: 30_000,
          force_instrumental: false,
          respect_sections_durations: true,
          target_episode: undefined,
          target_beat: undefined,
        },
      },
    );
  });
});
