// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const submitFreezoneAudioMusic = vi.hoisted(() => vi.fn());
const submitFreezoneAudioSpeech = vi.hoisted(() => vi.fn());

vi.mock("@/api/ops", () => ({
  submitFreezoneAudioMusic,
  submitFreezoneAudioSpeech,
}));

import { freezoneAudioGenerationGateway } from "./freezoneAudioGenerationGateway";

beforeEach(() => {
  submitFreezoneAudioMusic.mockReset();
  submitFreezoneAudioSpeech.mockReset();
});

describe("freezoneAudioGenerationGateway", () => {
  it("maps a speech command to the Freezone client", async () => {
    const task = { task_key: "speech-task", task_type: "speech", job_id: "1" };
    submitFreezoneAudioSpeech.mockResolvedValue(task);

    await expect(
      freezoneAudioGenerationGateway.submitSpeech("project-1", {
        text: "Line",
        emotionPrompt: "calm",
        voiceRef: { scope: "identity", identityId: "identity-1" },
      }),
    ).resolves.toBe(task);
    expect(submitFreezoneAudioSpeech).toHaveBeenCalledWith("project-1", {
      text: "Line",
      emotionPrompt: "calm",
      voiceRef: { scope: "identity", identityId: "identity-1" },
    });
  });

  it("maps a music command to the Freezone client", async () => {
    const task = { task_key: "music-task", task_type: "music", job_id: "2" };
    submitFreezoneAudioMusic.mockResolvedValue(task);

    await expect(
      freezoneAudioGenerationGateway.submitMusic("project-2", {
        prompt: "Score",
        musicLengthMs: 30_000,
        forceInstrumental: false,
        respectSectionsDurations: true,
      }),
    ).resolves.toBe(task);
    expect(submitFreezoneAudioMusic).toHaveBeenCalledWith("project-2", {
      prompt: "Score",
      musicLengthMs: 30_000,
      forceInstrumental: false,
      respectSectionsDurations: true,
    });
  });
});
