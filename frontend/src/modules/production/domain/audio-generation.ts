// Copyright (c) 2026 AI anime

export interface GenerateAudioCommand {
  beatNumbers?: number[];
  mode?: string;
}

export interface EpisodeAudioCostBeat {
  audio_type?: string | null;
  beat_number?: number | null;
  is_manual_shot?: boolean | null;
  speaker?: string | null;
}

export function episodeAudioModelCallCount(
  beats: readonly EpisodeAudioCostBeat[],
): number {
  return beats.reduce((count, beat) => {
    const beatNumber = Number(beat.beat_number || 0);
    if (beatNumber <= 0 || beat.is_manual_shot) return count;

    const audioType = normalizedAudioType(beat);
    if (audioType !== "narration" && audioType !== "dialogue") return count;

    return count + 1;
  }, 0);
}

function normalizedAudioType(beat: EpisodeAudioCostBeat): string {
  const audioType = String(beat.audio_type || "").trim();
  if (audioType === "action") return "silence";
  if (audioType) return audioType;
  if (String(beat.speaker || "").trim()) return "dialogue";
  return "narration";
}
