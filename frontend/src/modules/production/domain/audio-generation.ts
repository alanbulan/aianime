// Copyright (c) 2026 AI anime

export interface GenerateAudioCommand {
  beatNumbers?: number[];
  mode?: string;
}

export interface AudioGenerationPlan {
  beat_numbers: number[];
  prereq_errors: string[];
}

export interface EpisodeAudioPlanBeat {
  audio_type?: string | null;
  audio_url?: string | null;
  beat_number?: number | null;
  narration_segment?: string | null;
  speaker?: string | null;
}

export function episodeAudioPlanRevision(
  beats: readonly EpisodeAudioPlanBeat[],
): string {
  return beats
    .map((beat) =>
      [
        beat.beat_number,
        beat.audio_type,
        beat.speaker,
        beat.audio_url,
        beat.narration_segment,
      ].join(":"),
    )
    .join(",");
}
