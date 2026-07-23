// Copyright (c) 2026 AI anime
import type {
  Episode,
  PipelineEpisodeStatus,
  PipelineStatus,
} from "@/modules/narrative_planning/domain/types";

export interface EpisodeStats {
  totalEpisodes: number;
  totalIdentities: number;
  totalKeyEvents: number;
  totalScenes: number;
  totalProps: number;
}

export function derivePipelineEpisodeStatuses(
  status: PipelineStatus | null | undefined,
): PipelineEpisodeStatus[] {
  if (!status?.current_episode || !status.episode_status) return [];
  return [
    {
      episode: status.current_episode,
      script: Boolean(status.episode_status.script),
      sketch: Boolean(status.episode_status.sketches),
      audio: Boolean(status.episode_status.tts),
      video: Boolean(status.episode_status.video),
      compose: status.next_step === "done",
    },
  ];
}

export function mergeEpisodeIntoList(
  episodes: Episode[],
  updatedEpisode: Pick<Episode, "number"> & Partial<Episode>,
): Episode[] {
  let found = false;
  const next = episodes.map((episode) => {
    if (episode.number !== updatedEpisode.number) return episode;
    found = true;
    return { ...episode, ...updatedEpisode };
  });
  if (!found) next.push(updatedEpisode as Episode);
  return next.sort((a, b) => a.number - b.number);
}

export function deriveEpisodeStats(episodes: Episode[]): EpisodeStats {
  return {
    totalEpisodes: episodes.length,
    totalIdentities: episodes.reduce(
      (sum, episode) => sum + (episode.identity_ids?.length ?? 0),
      0,
    ),
    totalKeyEvents: episodes.reduce(
      (sum, episode) => sum + (episode.key_events?.length ?? 0),
      0,
    ),
    totalScenes: episodes.reduce(
      (sum, episode) => sum + (episode.scene_menu?.length ?? 0),
      0,
    ),
    totalProps: episodes.reduce(
      (sum, episode) => sum + (episode.prop_menu?.length ?? 0),
      0,
    ),
  };
}

export function mergeEpisodeCatalog(
  episodes: Episode[],
  pipelineEpisodes: PipelineEpisodeStatus[],
  fallbackTitle: (episodeNumber: number) => string,
): Episode[] {
  const episodesByNumber = new Map(
    episodes.map((episode) => [episode.number, episode]),
  );
  const episodeNumbers = new Set(episodesByNumber.keys());
  for (const status of pipelineEpisodes) episodeNumbers.add(status.episode);

  return Array.from(episodeNumbers)
    .sort((left, right) => left - right)
    .map(
      (episodeNumber) =>
        episodesByNumber.get(episodeNumber) ?? {
          number: episodeNumber,
          title: fallbackTitle(episodeNumber),
        },
    );
}

export function resolveSelectedEpisode(
  episodes: Episode[],
  selectedEpisodeNumber: number | null,
  fallbackTitle: (episodeNumber: number) => string,
): Episode | null {
  if (selectedEpisodeNumber === null) return null;
  return (
    episodes.find((episode) => episode.number === selectedEpisodeNumber) ?? {
      number: selectedEpisodeNumber,
      title: fallbackTitle(selectedEpisodeNumber),
    }
  );
}
