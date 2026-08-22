// Copyright (c) 2026 AI anime
import { apiCall } from "@/shared/api/client";

import type {
  CanvasAudioGenerationSubmissionGateway,
  CanvasAudioGenerationTaskRef,
} from "../application/generateCanvasAudio";

export const freezoneAudioGenerationGateway: CanvasAudioGenerationSubmissionGateway = {
  async submitSpeech(projectId, command) {
    return await apiCall<CanvasAudioGenerationTaskRef>(
      `projects/${encodeURIComponent(projectId)}/freezone/audio/speech`,
      {
        method: "POST",
        json: {
          text: command.text,
          emotion_prompt: command.emotionPrompt ?? "",
          voice_ref: {
            scope: command.voiceRef.scope,
            character_name: command.voiceRef.characterName ?? "",
            identity_id: command.voiceRef.identityId ?? "",
            slot: command.voiceRef.slot ?? "",
            voice_id: command.voiceRef.voiceId ?? "",
          },
          target_episode: undefined,
          target_beat: undefined,
        },
      },
    );
  },
  async submitMusic(projectId, command) {
    return await apiCall<CanvasAudioGenerationTaskRef>(
      `projects/${encodeURIComponent(projectId)}/freezone/audio/eleven-music`,
      {
        method: "POST",
        json: {
          input: command.prompt,
          music_length_ms: command.musicLengthMs,
          force_instrumental: command.forceInstrumental,
          respect_sections_durations: command.respectSectionsDurations,
          target_episode: undefined,
          target_beat: undefined,
        },
      },
    );
  },
};
