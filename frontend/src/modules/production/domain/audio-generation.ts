// Copyright (c) 2026 AI anime

export interface GenerateAudioCommand {
  beatNumbers?: number[];
  mode?: string;
}

export interface AudioBillingQuote {
  beat_numbers: number[];
  quantity: number;
  unit_cost: number;
  cost: number;
  display: string;
  prereq_errors: string[];
}

export interface EpisodeAudioBillingBeat {
  audio_type?: string | null;
  audio_url?: string | null;
  beat_number?: number | null;
  narration_segment?: string | null;
  speaker?: string | null;
}

export function episodeAudioBillingRevision(
  beats: readonly EpisodeAudioBillingBeat[],
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
