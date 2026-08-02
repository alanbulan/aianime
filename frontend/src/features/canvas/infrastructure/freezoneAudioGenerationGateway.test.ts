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
        model: "audio-speech-1",
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
          model: "audio-speech-1",
          text: "Line",
          emotion_prompt: "calm",
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

  it("posts a music command to the encoded endpoint", async () => {
    const task = { task_key: "music-task", task_type: "music", job_id: "2" };
    vi.mocked(apiCall).mockResolvedValue(task);

    await expect(
      freezoneAudioGenerationGateway.submitMusic("project/2", {
        model: "audio-music-1",
        prompt: "Score",
        musicLengthMs: 30_000,
        forceInstrumental: false,
        respectSectionsDurations: true,
      }),
    ).resolves.toBe(task);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2F2/freezone/audio/eleven-music",
      {
        method: "POST",
        json: {
          model: "audio-music-1",
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
