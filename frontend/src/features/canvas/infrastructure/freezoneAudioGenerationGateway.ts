// Copyright (c) 2026 AI anime
import {
  submitFreezoneAudioMusic,
  submitFreezoneAudioSpeech,
} from "@/api/ops";

import type { CanvasAudioGenerationSubmissionGateway } from "../application/generateCanvasAudio";

export const freezoneAudioGenerationGateway: CanvasAudioGenerationSubmissionGateway = {
  async submitSpeech(projectId, command) {
    return await submitFreezoneAudioSpeech(projectId, {
      text: command.text,
      emotionPrompt: command.emotionPrompt,
      voiceRef: command.voiceRef,
    });
  },
  async submitMusic(projectId, command) {
    return await submitFreezoneAudioMusic(projectId, {
      prompt: command.prompt,
      musicLengthMs: command.musicLengthMs,
      forceInstrumental: command.forceInstrumental,
      respectSectionsDurations: command.respectSectionsDurations,
    });
  },
};
