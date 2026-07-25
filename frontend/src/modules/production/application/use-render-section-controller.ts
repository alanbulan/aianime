// Copyright (c) 2026 AI anime
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useTaskController } from "@/hooks/use-task-controller";
import { ratioToCss } from "@/lib/aspect-ratio";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { resolveMediaUrl } from "@/lib/media-url";
import { queryKeys } from "@/lib/query-keys";
import type {
  AssetResponse,
  BeatBackgroundAnchorCropCommand,
  BeatBackgroundAnchorItem,
  BeatBackgroundAnchors,
  BeatBackgroundReference,
  ScenePlatePreview,
} from "@/modules/asset_world/public";
import type { Beat } from "@/modules/narrative_planning/public";
import { StalePoolSelectError } from "@/modules/production/application/image-pool-errors";
import type {
  BeatImageUploadResponse,
  ImagePoolSelectResponse,
  ProductionDataResponse,
  ProductionErrorResponse,
  ProductionTaskResponse,
} from "@/modules/production/application/ports";
import type { PoolImage } from "@/modules/production/domain/image-pool";
import type { RenderSettingsData } from "@/modules/production/domain/image-settings";
import type { RegenerateRenderBeatsCommand } from "@/modules/production/domain/sketch-generation";

const NEW_WINDOW_MS = 10 * 60 * 1000;

interface CreditCostQuery {
  data?: { data: { display?: string | null } };
}

interface RenderSettingsQuery {
  data?: ProductionDataResponse<RenderSettingsData>;
}

interface PoolSelectMutation {
  isPending: boolean;
  mutateAsync(command: {
    beatNum: number;
    force?: boolean;
    poolId: string;
  }): Promise<ImagePoolSelectResponse>;
}

interface RegenerateRenderMutation {
  isPending: boolean;
  mutateAsync(
    command: RegenerateRenderBeatsCommand,
  ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
}

interface UploadRenderMutation {
  isPending: boolean;
  mutateAsync(command: {
    beatNum: number;
    file: File;
  }): Promise<BeatImageUploadResponse>;
}

export interface RenderSectionControllerQueries {
  usePoolSelect(project: string, episode: number): PoolSelectMutation;
  useRegenerateRenderBeats(
    project: string,
    episode: number,
  ): RegenerateRenderMutation;
  useRenderSettings(project: string): RenderSettingsQuery;
  useUploadBeatImage(
    project: string,
    episode: number,
    imageType: "render",
  ): UploadRenderMutation;
}

export interface SeenRenderCandidates {
  seenIds: string[] | undefined;
  markSeen(project: string, episode: number, poolId: string): void;
}

export interface RenderSectionControllerDependencies {
  downloadFile(url: string, filename: string): void;
  openRenderFreezone(
    project: string,
    episode: number,
    beatNumber: number,
  ): Promise<unknown>;
  useGenerationCreditCost(
    kind: "image_selection",
    value: string | undefined,
    options: {
      imageRole: "render";
      modeKey: "1x1_2-3";
      surface: "ai_anime";
    },
  ): CreditCostQuery;
  useNow(): number;
  useRefreshDirectorControlFrame(
    project: string,
    episode: number,
    beatNumber: number,
  ): () => Promise<unknown>;
  useSeenRenderCandidates(
    project: string,
    episode: number,
  ): SeenRenderCandidates;
}

export interface RenderBackgroundAnchorsQuery {
  data?: AssetResponse<BeatBackgroundAnchors>;
  isLoading: boolean;
}

export interface UpdateRenderBackgroundMutation {
  isPending: boolean;
  mutateAsync(command: {
    anchorId: string;
  }): Promise<AssetResponse<BeatBackgroundAnchors>>;
}

export interface CropRenderBackgroundMutation {
  mutateAsync(
    command: BeatBackgroundAnchorCropCommand,
  ): Promise<AssetResponse<BeatBackgroundAnchors>>;
}

export interface UploadRenderBackgroundMutation {
  isPending: boolean;
  mutateAsync(command: {
    file: File;
  }): Promise<AssetResponse<BeatBackgroundAnchors>>;
}

export interface ScenePlatePreviewQuery {
  data?: AssetResponse<ScenePlatePreview>;
}

export interface RenderSectionControllerOptions {
  assignments: Record<string, string>;
  backgroundAnchors: RenderBackgroundAnchorsQuery;
  beat: Beat;
  cropBackgroundAnchor: CropRenderBackgroundMutation;
  episode: number;
  images: PoolImage[];
  project: string;
  renderAspect: string;
  renderCropRatio: number;
  scenePlatePreview: ScenePlatePreviewQuery;
  updateBackgroundAnchor: UpdateRenderBackgroundMutation;
  uploadBackgroundAnchor: UploadRenderBackgroundMutation;
}

export interface RenderCandidateViewModel {
  id: string;
  isActive: boolean;
  isNew: boolean;
  src: string | null;
  timeLabel: string | null;
}

export interface RenderBackgroundReferenceViewModel {
  anchor: BeatBackgroundAnchorItem | null;
  sourceId: string | null;
  reference: BeatBackgroundReference | null;
  renderInput: BeatBackgroundReference | null;
  cropAspectLabel: string;
  cropAspectRatio: number;
  anchors: BeatBackgroundAnchorItem[];
  canChoose: boolean;
  loading: boolean;
  choosing: boolean;
  uploading: boolean;
  croppingAnchorId: string | null;
  onOpenDirectorWorld(): void;
  onChoose(anchorId: string): void;
  onCrop(
    anchorId: string,
    crop: { x: number; y: number; width: number; height: number },
  ): void;
  onUpload(file: File | null | undefined): void;
}

export interface RenderDirectorCaptureMeta {
  controlFrameBundle?: {
    rel_paths: Record<string, string>;
  } | null;
  controlFrameRelPath?: string | null;
}

export interface RenderSectionController {
  background: RenderBackgroundReferenceViewModel;
  beatNumber: number;
  candidates: RenderCandidateViewModel[];
  directorWorldOpen: boolean;
  downloadEnabled: boolean;
  freezonePending: boolean;
  poolSelectPending: boolean;
  previewUrl: string | null;
  regenConfirmOpen: boolean;
  regenPending: boolean;
  regenTaskStarted: boolean;
  regenTaskStopping: boolean;
  relight: { enabled: boolean; timeOfDay: string } | null;
  renderActive: boolean;
  renderAspectRatio: string;
  renderPercent: number;
  renderRegenCostDisplay?: string | null;
  stalePromptOpen: boolean;
  uploadPending: boolean;
  commitDirectorCapture(meta: RenderDirectorCaptureMeta): Promise<void>;
  onConfirmRegen(): void;
  onDownload(): void;
  onForceStale(): void;
  onOpenFreezone(): void;
  onRegenConfirmOpenChange(open: boolean): void;
  onRequestRegen(): void;
  onSelect(poolId: string): void;
  onStalePromptOpenChange(open: boolean): void;
  onStopRegenTask(): void;
  onUpload(file: File | null | undefined): void;
  setDirectorWorldOpen(open: boolean): void;
}

export function createUseRenderSectionController(
  queries: RenderSectionControllerQueries,
  dependencies: RenderSectionControllerDependencies,
) {
  return function useRenderSectionController(
    options: RenderSectionControllerOptions,
  ): RenderSectionController {
    const { t } = useTranslation();
    const poolSelect = queries.usePoolSelect(options.project, options.episode);
    const regenerate = queries.useRegenerateRenderBeats(
      options.project,
      options.episode,
    );
    const renderSettings = queries.useRenderSettings(options.project);
    const renderRegenCost = dependencies.useGenerationCreditCost(
      "image_selection",
      renderSettings.data?.data.render_image_selection,
      {
        surface: "ai_anime",
        imageRole: "render",
        modeKey: "1x1_2-3",
      },
    );
    const uploadRender = queries.useUploadBeatImage(
      options.project,
      options.episode,
      "render",
    );
    // selected_regen is persisted by its returned scope. Adding beatNum here
    // would prevent the SSE controller from resuming the persisted task row.
    const regenTask = useTaskController({
      key: {
        taskType: "selected_regen",
        project: options.project,
        episode: options.episode,
      },
      invalidateKeys: [
        queryKeys.grids(options.project, options.episode),
        queryKeys.beats(options.project, options.episode),
      ],
    });
    const refreshDirectorControlFrame =
      dependencies.useRefreshDirectorControlFrame(
        options.project,
        options.episode,
        options.beat.beat_number,
      );
    const seenCandidates = dependencies.useSeenRenderCandidates(
      options.project,
      options.episode,
    );
    const now = dependencies.useNow();
    const [stalePrompt, setStalePrompt] = useState<{
      message: string;
      poolId: string;
    } | null>(null);
    const [regenConfirmOpen, setRegenConfirmOpen] = useState(false);
    const [freezonePending, setFreezonePending] = useState(false);
    const [croppingAnchorId, setCroppingAnchorId] =
      useState<string | null>(null);
    const [directorWorldOpen, setDirectorWorldOpen] = useState(false);

    const candidates = options.images
      .filter(
        (image) =>
          image.type === "render" &&
          image.original_beat === options.beat.beat_number &&
          image.cell_url,
      )
      .sort((first, second) => {
        const firstTime = first.generated_at
          ? Date.parse(first.generated_at)
          : 0;
        const secondTime = second.generated_at
          ? Date.parse(second.generated_at)
          : 0;
        return secondTime - firstTime;
      });
    const currentAssignment =
      options.assignments[String(options.beat.beat_number)] ?? null;
    const assignedRender = currentAssignment
      ? options.images.find((image) =>
          isRenderAssignmentMatch(image, currentAssignment),
        ) ?? null
      : null;
    const detailRender = assignedRender ?? candidates[0] ?? null;
    const previewUrl =
      options.beat.frame_url ?? detailRender?.cell_url ?? null;
    const renderPercent = Math.max(
      0,
      Math.min(
        100,
        Math.round((regenTask.stream?.progress ?? 0) * 100),
      ),
    );
    const candidateItems = candidates.map((image) => {
      const isActive =
        currentAssignment !== null &&
        isRenderAssignmentMatch(image, currentAssignment);
      const generatedAtMs = image.generated_at
        ? Date.parse(image.generated_at)
        : Number.NaN;
      const isSeen = Boolean(seenCandidates.seenIds?.includes(image.id));
      return {
        id: image.id,
        isActive,
        isNew:
          !Number.isNaN(generatedAtMs) &&
          now - generatedAtMs < NEW_WINDOW_MS &&
          !isSeen &&
          !isActive,
        src: image.cell_url ? resolveMediaUrl(image.cell_url) : null,
        timeLabel: formatRelativeTime(image.generated_at, now),
      };
    });
    const backgroundData =
      options.backgroundAnchors.data?.ok === true
        ? options.backgroundAnchors.data.data
        : null;
    const currentBackgroundSource =
      backgroundData?.currentSource ?? backgroundData?.currentAnchor ?? null;
    const currentBackground =
      backgroundData?.anchors.find(
        (anchor) => anchor.id === currentBackgroundSource,
      ) ??
      backgroundData?.anchors.find((anchor) => anchor.current) ??
      backgroundData?.anchors.find((anchor) => anchor.exists) ??
      null;
    const currentBackgroundReference =
      backgroundData?.displayReference ??
      backgroundData?.currentReference ??
      null;
    const scenePlate =
      options.scenePlatePreview.data?.ok === true
        ? options.scenePlatePreview.data.data.render
        : null;

    const handleSelect = async (poolId: string) => {
      seenCandidates.markSeen(options.project, options.episode, poolId);
      try {
        await poolSelect.mutateAsync({
          beatNum: options.beat.beat_number,
          poolId,
        });
        toast.success(t("episode.workbench.render.switched"));
      } catch (error) {
        if (error instanceof StalePoolSelectError) {
          setStalePrompt({ poolId, message: error.message });
          return;
        }
        toast.error(
          error instanceof Error
            ? error.message
            : t("episode.workbench.render.switchFailed"),
        );
      }
    };

    const handleStaleForce = async () => {
      if (!stalePrompt) return;
      const poolId = stalePrompt.poolId;
      setStalePrompt(null);
      seenCandidates.markSeen(options.project, options.episode, poolId);
      try {
        await poolSelect.mutateAsync({
          beatNum: options.beat.beat_number,
          poolId,
          force: true,
        });
        toast.success(t("episode.workbench.render.forcedUse"));
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("episode.workbench.render.forceFailed"),
        );
      }
    };

    const handleRegen = async () => {
      try {
        const anchorId = currentBackgroundSource || "master";
        const backgroundResponse =
          await options.updateBackgroundAnchor.mutateAsync({ anchorId });
        if (!backgroundResponse.ok) {
          toast.error(
            backgroundResponse.error ||
              t("episode.workbench.render.backgroundSaveFailed"),
          );
          return;
        }
        const response = await regenerate.mutateAsync({
          beatIndices: [options.beat.beat_number],
          modeKey: "1x1_2-3",
        });
        if (!response.ok) {
          toast.error(
            response.error || t("episode.workbench.render.regenFailed"),
          );
          return;
        }
        regenTask.start({ scope: response.scope });
        toast.success(t("episode.workbench.render.regenStarted"));
      } catch {
        toast.error(t("episode.workbench.render.regenFailed"));
      }
    };

    const handleUpload = async (file: File | null | undefined) => {
      if (!file) return;
      try {
        const response = await uploadRender.mutateAsync({
          beatNum: options.beat.beat_number,
          file,
        });
        if (!response.ok) {
          toast.error(response.error || t("common.error"));
          return;
        }
        toast.success(t("episode.workbench.render.switched"));
      } catch {
        toast.error(t("common.error"));
      }
    };

    const handleChooseBackground = async (anchorId: string) => {
      try {
        const response =
          await options.updateBackgroundAnchor.mutateAsync({ anchorId });
        if (!response.ok) {
          toast.error(
            response.error ||
              t("episode.workbench.render.backgroundSaveFailed"),
          );
          return;
        }
        toast.success(t("episode.workbench.render.backgroundSaved"));
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("episode.workbench.render.backgroundSaveFailed"),
        );
      }
    };

    const handleCropBackground = async (
      anchorId: string,
      crop: { x: number; y: number; width: number; height: number },
    ) => {
      setCroppingAnchorId(anchorId);
      try {
        const response = await options.cropBackgroundAnchor.mutateAsync({
          anchorId,
          crop,
        });
        if (!response.ok) {
          toast.error(
            response.error ||
              t("episode.workbench.render.backgroundSaveFailed"),
          );
          return;
        }
        toast.success(t("episode.workbench.render.backgroundSaved"));
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("episode.workbench.render.backgroundSaveFailed"),
        );
      } finally {
        setCroppingAnchorId(null);
      }
    };

    const handleUploadBackground = async (
      file: File | null | undefined,
    ) => {
      if (!file) return;
      try {
        const response =
          await options.uploadBackgroundAnchor.mutateAsync({ file });
        if (!response.ok) {
          toast.error(
            response.error ||
              t("episode.workbench.render.backgroundUploadFailed"),
          );
          return;
        }
        toast.success(t("episode.workbench.render.backgroundUploaded"));
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("episode.workbench.render.backgroundUploadFailed"),
        );
      }
    };

    const handleOpenFreezone = async () => {
      setFreezonePending(true);
      try {
        await dependencies.openRenderFreezone(
          options.project,
          options.episode,
          options.beat.beat_number,
        );
        toast.success(t("episode.workbench.render.freezoneOpened"));
      } catch {
        toast.error(t("episode.workbench.render.freezoneOpenFailed"));
      } finally {
        setFreezonePending(false);
      }
    };

    const commitDirectorCapture = async (
      meta: RenderDirectorCaptureMeta,
    ) => {
      const bundle = meta.controlFrameBundle;
      if (!bundle) {
        toast.error(t("viewer.threeD.directorControlBundleMissing"));
        return;
      }
      toast.success(
        t("viewer.threeD.directorControlCommitted", {
          path: meta.controlFrameRelPath ?? bundle.rel_paths.combined,
        }),
      );
      await refreshDirectorControlFrame();
      setDirectorWorldOpen(false);
    };

    return {
      background: {
        anchor: currentBackground,
        sourceId: currentBackgroundSource,
        reference: currentBackgroundReference,
        renderInput: backgroundData?.renderInput ?? null,
        cropAspectLabel: options.renderAspect,
        cropAspectRatio: options.renderCropRatio,
        anchors: backgroundData?.anchors ?? [],
        canChoose: backgroundData?.canChoose ?? false,
        loading: options.backgroundAnchors.isLoading,
        choosing: options.updateBackgroundAnchor.isPending,
        uploading: options.uploadBackgroundAnchor.isPending,
        croppingAnchorId,
        onChoose: (anchorId) => {
          void handleChooseBackground(anchorId);
        },
        onCrop: (anchorId, crop) => {
          void handleCropBackground(anchorId, crop);
        },
        onUpload: (file) => {
          void handleUploadBackground(file);
        },
        onOpenDirectorWorld: () => setDirectorWorldOpen(true),
      },
      beatNumber: options.beat.beat_number,
      candidates: candidateItems,
      directorWorldOpen,
      downloadEnabled: detailRender !== null,
      freezonePending,
      poolSelectPending: poolSelect.isPending,
      previewUrl,
      regenConfirmOpen,
      regenPending: regenerate.isPending,
      regenTaskStarted: regenTask.started,
      regenTaskStopping: regenTask.stopping,
      relight: scenePlate
        ? {
            enabled: scenePlate.relight,
            timeOfDay: options.beat.time_of_day ?? "",
          }
        : null,
      renderActive: regenTask.started,
      renderAspectRatio: ratioToCss(options.renderAspect),
      renderPercent,
      renderRegenCostDisplay: renderRegenCost.data?.data.display,
      stalePromptOpen: stalePrompt !== null,
      uploadPending: uploadRender.isPending,
      commitDirectorCapture,
      onConfirmRegen: () => {
        setRegenConfirmOpen(false);
        void handleRegen();
      },
      onDownload: () => {
        if (!detailRender?.cell_url) return;
        const url = resolveMediaUrl(detailRender.cell_url);
        if (!url) return;
        dependencies.downloadFile(
          url,
          `beat_${options.beat.beat_number}_render.png`,
        );
      },
      onForceStale: () => {
        void handleStaleForce();
      },
      onOpenFreezone: () => {
        void handleOpenFreezone();
      },
      onRegenConfirmOpenChange: setRegenConfirmOpen,
      onRequestRegen: () => setRegenConfirmOpen(true),
      onSelect: (poolId) => {
        void handleSelect(poolId);
      },
      onStalePromptOpenChange: (open) => {
        if (!open) setStalePrompt(null);
      },
      onStopRegenTask: () => {
        void regenTask.stop();
      },
      onUpload: (file) => {
        void handleUpload(file);
      },
      setDirectorWorldOpen,
    };
  };
}

function isRenderAssignmentMatch(image: PoolImage, assignment: string) {
  return (
    image.type === "render" &&
    (image.id === assignment ||
      image.cell_path === assignment ||
      image.grid_path === assignment)
  );
}
