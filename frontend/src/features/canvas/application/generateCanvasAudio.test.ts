// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { AudioNodeData } from "../domain/canvasNodes";
import type { CanvasTaskResultGateway } from "./ports";
import {
  buildCanvasAudioPrompt,
  deriveAudioText,
  generateCanvasAudio,
  type CanvasAudioGenerationSubmissionGateway,
} from "./generateCanvasAudio";

function audioData(patch: Partial<AudioNodeData> = {}): AudioNodeData {
  return {
    audioUrl: null,
    ...patch,
  };
}

function dependencies() {
  const submissionGateway: CanvasAudioGenerationSubmissionGateway = {
    submitSpeech: vi.fn(),
    submitMusic: vi.fn(),
  };
  const taskGateway: CanvasTaskResultGateway = {
    awaitCompletion: vi.fn().mockResolvedValue({ result: null }),
    fetchResultUrl: vi.fn().mockResolvedValue("/audio/result.mp3"),
  };
  return {
    submissionGateway,
    taskGateway,
    onTaskSubmitted: vi.fn(),
  };
}

describe("Canvas audio generation", () => {
  it("derives legacy text segments and joins upstream text", () => {
    const data = audioData({
      segments: [
        { type: "text", value: "Line one" },
        { type: "pause", durationSec: 1 },
        { type: "text", value: " line two " },
      ],
    });

    expect(deriveAudioText(data)).toBe("Line one line two ");
    expect(buildCanvasAudioPrompt(data, " Context ")).toBe(
      "Context\n\nLine one line two",
    );
    expect(
      buildCanvasAudioPrompt(audioData({ text: " Own text " }), ""),
    ).toBe("Own text");
  });

  it("submits speech with normalized defaults before awaiting its result", async () => {
    const deps = dependencies();
    const task = {
      task_key: "speech-task",
      task_type: "freezone_audio_speech",
      job_id: "speech-job",
    };
    vi.mocked(deps.submissionGateway.submitSpeech).mockResolvedValue(task);

    await expect(
      generateCanvasAudio(
        {
          kind: "speech",
          projectId: "project-1",
          prompt: "Speak",
          emotionPrompt: "  calm  ",
          voiceRef: null,
        },
        deps,
      ),
    ).resolves.toEqual({ task, audioUrl: "/audio/result.mp3" });
    expect(deps.submissionGateway.submitSpeech).toHaveBeenCalledWith(
      "project-1",
      {
        text: "Speak",
        emotionPrompt: "calm",
        voiceRef: { scope: "project_narrator" },
      },
    );
    expect(deps.onTaskSubmitted).toHaveBeenCalledWith(task);
    expect(deps.taskGateway.awaitCompletion).toHaveBeenCalledWith(
      "speech-task",
      "project-1",
    );
    expect(deps.taskGateway.fetchResultUrl).toHaveBeenCalledWith(
      "project-1",
      "freezone_audio_speech",
      "speech-job",
    );
  });

  it("submits music with defaults and ignores an invalid persisted duration", async () => {
    const deps = dependencies();
    const task = {
      task_key: "music-task",
      task_type: "freezone_audio_eleven_music",
      job_id: "music-job",
    };
    vi.mocked(deps.submissionGateway.submitMusic).mockResolvedValue(task);

    await generateCanvasAudio(
      {
        kind: "music",
        projectId: "project-2",
        prompt: "Ambient score",
        musicLengthMs: "invalid",
      },
      deps,
    );

    expect(deps.submissionGateway.submitMusic).toHaveBeenCalledWith(
      "project-2",
      {
        prompt: "Ambient score",
        forceInstrumental: true,
        respectSectionsDurations: true,
      },
    );
    expect(deps.taskGateway.fetchResultUrl).toHaveBeenCalledWith(
      "project-2",
      "freezone_audio_eleven_music",
      "music-job",
    );
  });
});
