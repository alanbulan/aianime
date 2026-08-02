// Copyright (c) 2026 AI anime
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { formatRelativeTime } from "@/lib/format-relative-time";
import { resolveMediaUrl } from "@/lib/media-url";
import type { VideoPoolResponse } from "@/modules/production/application/ports";
import { videoModelDisplayLabel } from "@/modules/production/domain/video-config";
import type { BeatStageState } from "@/modules/production/domain/beat-state";

export interface VideoPaneMediaQueries {
  useVideoPool(project: string, episode: number): {
    data?: VideoPoolResponse;
  };
  useVideoPoolSelect(project: string, episode: number): {
    isPending: boolean;
    mutateAsync(command: { beatNum: number; poolId: string }): Promise<unknown>;
  };
}

export interface VideoPaneMediaDependencies {
  useNow(): number;
}

export interface VideoPaneMediaControllerOptions {
  beatNumber: number;
  episode: number;
  project: string;
  state: BeatStageState;
  videoActive: boolean;
  videoModels: ReadonlyArray<{ value: string; label: string }>;
  videoProgress: number;
  videoUrl?: string | null;
  useSeedance2Preview: boolean;
}

export interface VideoPaneMediaCandidate {
  active: boolean;
  modelLabel: string;
  id: string;
  previewSource: string | null;
  timeLabel: string | null;
}

export interface VideoPaneMediaController {
  beatNumber: number;
  candidateCount: number;
  candidates: VideoPaneMediaCandidate[];
  downloadUrl: string | null;
  hasGeneratedVideo: boolean;
  previewSource: string | null;
  selectionPending: boolean;
  state: BeatStageState;
  useSeedance2Preview: boolean;
  videoActive: boolean;
  videoPercent: number;
  selectCandidate(poolId: string): Promise<void>;
}

export function createUseVideoPaneMediaController(
  queries: VideoPaneMediaQueries,
  dependencies: VideoPaneMediaDependencies,
) {
  return function useVideoPaneMediaController(
    options: VideoPaneMediaControllerOptions,
  ): VideoPaneMediaController {
    const { t } = useTranslation();
    const { data: poolResponse } = queries.useVideoPool(
      options.project,
      options.episode,
    );
    const poolSelect = queries.useVideoPoolSelect(
      options.project,
      options.episode,
    );
    const now = dependencies.useNow();
    const modelLabels = useMemo(
      () =>
        new Map(
          options.videoModels.map((model) => [
            model.value,
            model.label,
          ]),
        ),
      [options.videoModels],
    );
    const { candidates, activePoolId } = useMemo(() => {
      const pool = poolResponse?.data ?? null;
      if (!pool) {
        return {
          candidates: [] as VideoPaneMediaCandidate[],
          activePoolId: null as string | null,
        };
      }
      const activeId =
        pool.beat_assignments[String(options.beatNumber)] ?? null;
      const entries = pool.videos
        .filter((entry) => entry.beat_num === options.beatNumber)
        .sort((a, b) => {
          const first = a.generated_at ? Date.parse(a.generated_at) : 0;
          const second = b.generated_at ? Date.parse(b.generated_at) : 0;
          return second - first;
        })
        .map((entry) => {
          const source = resolveMediaUrl(entry.video_url);
          return {
            active: entry.id === activeId,
            modelLabel: videoModelDisplayLabel(
              entry.video_model,
              modelLabels,
            ),
            id: entry.id,
            previewSource: source ? `${source}#t=0.1` : null,
            timeLabel: formatRelativeTime(entry.generated_at ?? null, now),
          };
        });
      return { candidates: entries, activePoolId: activeId };
    }, [modelLabels, now, options.beatNumber, poolResponse]);
    const downloadUrl = options.videoUrl
      ? resolveMediaUrl(options.videoUrl)
      : null;
    const previewSource = downloadUrl ? `${downloadUrl}#t=0.1` : null;

    const selectCandidate = async (poolId: string) => {
      if (poolId === activePoolId) return;
      try {
        await poolSelect.mutateAsync({
          beatNum: options.beatNumber,
          poolId,
        });
        toast.success(
          t("episode.workbench.video.switched", { n: options.beatNumber }),
        );
      } catch {
        toast.error(t("episode.workbench.video.switchFailed"));
      }
    };

    return {
      beatNumber: options.beatNumber,
      candidateCount: candidates.length,
      candidates,
      downloadUrl,
      hasGeneratedVideo: Boolean(downloadUrl) || candidates.length > 0,
      previewSource,
      selectionPending: poolSelect.isPending,
      state: options.state,
      useSeedance2Preview: options.useSeedance2Preview,
      videoActive: options.videoActive,
      videoPercent: Math.max(
        0,
        Math.min(100, Math.round(options.videoProgress * 100)),
      ),
      selectCandidate,
    };
  };
}
