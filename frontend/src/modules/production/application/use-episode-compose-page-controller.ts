// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type {
  TaskControllerHandle,
  UseTaskControllerOptions,
} from "@/modules/task_execution/public";
import { orientationForAspectRatio } from "@/shared/aspect-ratio";
import { queryKeys } from "@/lib/query-keys";
import type { Beat, DataResponse, Episode } from "@/modules/narrative_planning/public";
import type { ProjectConfig } from "@/modules/project_workspace/public";
import type { ProductionTaskResponse, ProductionVideoGateway } from "@/modules/production/application/ports";
import type { EpisodeCounts } from "@/modules/production/domain/beat-state";
import {
  episodeResolutionFor,
  episodeResolutionTier,
  formatEpisodeDuration,
  type ComposeEpisodeCommand,
  type EpisodeExportKind,
  type EpisodeResolution,
} from "@/modules/production/domain/episode-compose";

interface ComposeMutation {
  isPending: boolean;
  mutateAsync(command: ComposeEpisodeCommand): Promise<ProductionTaskResponse>;
}

interface ProjectMutation {
  mutateAsync(config: Partial<ProjectConfig>): Promise<unknown>;
}

export interface EpisodeComposePageQueries {
  useComposeEpisode(project: string, episode: number): ComposeMutation;
  useEpisodeBeats(
    project: string,
    episode: number,
  ): { data?: DataResponse<Beat[]>; isLoading: boolean };
  useEpisodeDetail(
    project: string,
    episode: number,
  ): { data?: DataResponse<Episode> };
  useFinalVideo(
    project: string,
    episode: number,
  ): {
    data?: { data: { exists: boolean; video_url?: string } };
  };
  useProject(project: string): { data?: ProjectConfig };
  useUpdateProject(project: string): ProjectMutation;
}

export interface EpisodeComposePageControllerDependencies {
  downloadFile(blob: Blob, filename: string): void;
  exportEpisode: ProductionVideoGateway["exportEpisode"];
  useBeatStates(
    project: string,
    episode: number,
  ): { counts: EpisodeCounts };
  useTaskController(
    options: UseTaskControllerOptions,
  ): TaskControllerHandle;
}

export interface EpisodeComposePageControllerOptions {
  episode: number;
  onOpenBeat(beatNumber: number): void;
  project: string;
}

export function createUseEpisodeComposePageController(
  queries: EpisodeComposePageQueries,
  dependencies: EpisodeComposePageControllerDependencies,
) {
  return function useEpisodeComposePageController(
    options: EpisodeComposePageControllerOptions,
  ) {
    const { episode, project } = options;
    const { t } = useTranslation();
    const composeEpisode = queries.useComposeEpisode(project, episode);
    const { counts } = dependencies.useBeatStates(project, episode);
    const beatsQuery = queries.useEpisodeBeats(project, episode);
    const episodeQuery = queries.useEpisodeDetail(project, episode);
    const projectQuery = queries.useProject(project);
    const updateProject = queries.useUpdateProject(project);
    const finalVideoQuery = queries.useFinalVideo(project, episode);
    const projectConfig = projectQuery.data;
    const orientation =
      orientationForAspectRatio(projectConfig?.aspect_ratio) ?? "portrait";

    const [addSubtitles, setAddSubtitles] = useState(true);
    const [resolution, setResolution] =
      useState<EpisodeResolution>("720x1280");
    const [resultUrl, setResultUrl] = useState<string | null>(null);
    const [composeConfirm, setComposeConfirm] = useState(false);

    useEffect(() => {
      setResolution(
        episodeResolutionFor(
          episodeResolutionTier(projectConfig?.video_resolution),
          orientation,
        ),
      );
    }, [orientation, projectConfig?.video_resolution]);

    useEffect(() => {
      setAddSubtitles(projectConfig?.add_subtitles ?? true);
    }, [projectConfig?.add_subtitles]);

    const persistComposePreferences = useCallback(
      (updates: Partial<ProjectConfig>) => {
        void updateProject
          .mutateAsync(updates)
          .catch(() => toast.error(t("common.error")));
      },
      [t, updateProject],
    );

    const handleResolutionChange = useCallback(
      (value: string | null) => {
        const next = episodeResolutionFor(
          episodeResolutionTier(value),
          orientation,
        );
        setResolution(next);
        persistComposePreferences({ video_resolution: next });
      },
      [orientation, persistComposePreferences],
    );

    const handleAddSubtitlesChange = useCallback(() => {
      const next = !addSubtitles;
      setAddSubtitles(next);
      persistComposePreferences({ add_subtitles: next });
    }, [addSubtitles, persistComposePreferences]);

    const outputFilename = `ep${String(episode).padStart(3, "0")}_final.mp4`;
    const beats = beatsQuery.data?.data ?? [];
    const totalDurationSeconds = beats.reduce(
      (total, beat) => total + (beat.estimated_duration ?? 0),
      0,
    );
    const durationLabel = formatEpisodeDuration(totalDurationSeconds);
    const rawTitle = episodeQuery.data?.data?.title?.trim();
    const displayTitle =
      rawTitle && rawTitle.length > 0
        ? rawTitle
        : t("episode.compose.episodeHeader", { n: episode });

    const task = dependencies.useTaskController({
      key: {
        taskType: "compose_episode",
        project,
        episode,
      },
      invalidateKeys: [
        queryKeys.pipelineStatus(project),
        queryKeys.videoPool(project, episode),
        queryKeys.beats(project, episode),
        queryKeys.finalVideo(project, episode),
      ],
      onComplete: (result) => {
        const response = result as { video_url?: string; url?: string } | null;
        const url = response?.video_url ?? response?.url;
        if (url) setResultUrl(url);
      },
    });

    const isComposing = task.started || composeEpisode.isPending;
    const hydratedUrl = finalVideoQuery.data?.data?.exists
      ? finalVideoQuery.data.data.video_url
      : null;

    useEffect(() => {
      if (isComposing || resultUrl || !hydratedUrl) return;
      setResultUrl(hydratedUrl);
    }, [hydratedUrl, isComposing, resultUrl]);

    const handleCompose = async () => {
      try {
        setResultUrl(null);
        const response = await composeEpisode.mutateAsync({
          addSubtitles,
          addBgm: false,
          resolution,
        });
        task.start({ scope: response.scope, taskId: response.task_id });
      } catch {
        toast.error(t("common.error"));
      }
    };

    const downloadExport = async (
      kind: EpisodeExportKind,
      filename: string,
    ) => {
      try {
        const blob = await dependencies.exportEpisode(project, episode, kind);
        dependencies.downloadFile(blob, filename);
      } catch {
        toast.error(t("common.error"));
      }
    };

    return {
      addSubtitles,
      beatsEmpty: !beatsQuery.isLoading && beats.length === 0,
      beatsLoading: beatsQuery.isLoading,
      canCompose: counts.compose.ready,
      composeConfirm,
      counts,
      displayTitle,
      durationLabel,
      handleAddSubtitlesChange,
      handleCompose,
      handleDownloadVideo: () =>
        downloadExport("video", `${project}_${outputFilename}`),
      handleExport: (kind: Exclude<EpisodeExportKind, "video">) =>
        downloadExport(kind, `${project}_ep${episode}.${kind}`),
      handleResolutionChange,
      isComposing,
      onOpenBeat: options.onOpenBeat,
      orientation,
      outputFilename,
      resolution,
      resultUrl,
      setComposeConfirm,
      task,
      totalBeats: counts.video.total,
    };
  };
}

export type EpisodeComposePageController = ReturnType<
  ReturnType<typeof createUseEpisodeComposePageController>
>;
