// Copyright (c) 2026 AI anime
import { useMemo } from "react";
import type {
  Beat,
  DataResponse,
} from "@/modules/narrative_planning/public";
import {
  deriveBeatStates,
  deriveEpisodeCounts,
  type BeatStates,
  type EpisodeCounts,
} from "@/modules/production/domain/beat-state";
import type { TaskState } from "@/modules/task_execution/public";

export interface UseBeatStatesResult {
  states: BeatStates;
  counts: EpisodeCounts;
  loading: boolean;
}

export interface BeatStateQueries {
  useEpisodeBeats(
    project: string,
    episode: number,
  ): { data?: DataResponse<Beat[]>; isLoading: boolean };
  useProject(project: string): {
    data?: { spine_template?: string | null };
  };
  useTasks(filter: { project: string; episode: number }): {
    data?: { data: TaskState[] };
    isLoading: boolean;
  };
}

export function createUseBeatStates(queries: BeatStateQueries) {
  return function useBeatStates(
    project: string,
    episode: number,
  ): UseBeatStatesResult {
    const beatsQuery = queries.useEpisodeBeats(project, episode);
    const tasksQuery = queries.useTasks({ project, episode });
    const projectQuery = queries.useProject(project);
    const requireAudio = projectQuery.data?.spine_template !== "drama";

    return useMemo(() => {
      const beats = beatsQuery.data?.data ?? [];
      const states = deriveBeatStates(beats, tasksQuery.data?.data ?? []);
      return {
        states,
        counts: deriveEpisodeCounts(states, beats.length, requireAudio),
        loading: beatsQuery.isLoading || tasksQuery.isLoading,
      };
    }, [
      beatsQuery.data,
      beatsQuery.isLoading,
      episode,
      project,
      requireAudio,
      tasksQuery.data,
      tasksQuery.isLoading,
    ]);
  };
}
