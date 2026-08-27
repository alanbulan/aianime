// Copyright (c) 2026 AI anime
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useTaskController } from "@/modules/task_execution/public";
import { ratioToCss } from "@/shared/aspect-ratio";
import { formatGeneratedAgeLabel } from "@/lib/format-relative-time";
import { resolveMediaUrl } from "@/lib/media-url";
import { queryKeys } from "@/lib/query-keys";
import type {
  AssetResponse,
  BeatBackgroundAnchorCropCommand,
  BeatBackgroundAnchorItem,
  BeatBackgroundAnchors,
  BeatBackgroundReference,
  DirectorStageManifest,
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
import {
  imagePoolModelSource,
  type PoolImage,
} from "@/modules/production/domain/image-pool";
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

interface PoolDeleteMutation {
  isPending: boolean;
  mutateAsync(command: { poolId: string }): Promise<unknown>;
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
  useBeatBackgroundAnchors(
    project: string,
    episode: number,
    beatNumber: number,
  ): RenderBackgroundAnchorsQuery;
  useBeatDirectorStageManifest(
    project: string,
    episode: number,
    beatNumber: number,
    enabled: boolean,
  ): RenderDirectorStageQuery;
  useCropBeatBackgroundAnchor(
    project: string,
    episode: number,
    beatNumber: number,
  ): CropRenderBackgroundMutation;
  useDirectorControlFrameStatus(
    project: string,
    episode: number,
    beatNumber: number,
  ): RenderDirectorStatusQuery;
  usePoolDelete(project: string, episode: number): PoolDeleteMutation;
  usePoolSelect(project: string, episode: number): PoolSelectMutation;
  useRegenerateRenderBeats(
    project: string,
    episode: number,
  ): RegenerateRenderMutation;
  useRenderSettings(project: string): RenderSettingsQuery;
  useScenePlatePreview(
    project: string,
    sceneId: string,
    variantId: string,
    timeOfDay: string,
  ): ScenePlatePreviewQuery;
  useUpdateBeatBackgroundAnchor(
    project: string,
    episode: number,
    beatNumber: number,
  ): UpdateRenderBackgroundMutation;
  useUploadBeatBackgroundAnchor(
    project: string,
    episode: number,
    beatNumber: number,
  ): UploadRenderBackgroundMutation;
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
      modeKey: "1x1_2-3" | "1x1_16-9";
      surface: "ai_anime";
    },
  ): CreditCostQuery;
  useNow(): number;
  useProjectAspectRatio(project: string): {
    spec: { ratioValue: number; renderAspect: string };
  };
  useSeenRenderCandidates(
    project: string,
    episode: number,
  ): SeenRenderCandidates;
}

export interface RenderBackgroundAnchorsQuery {
  data?: AssetResponse<BeatBackgroundAnchors>;
  isLoading: boolean;
  refetch(): Promise<{
    data?: AssetResponse<BeatBackgroundAnchors>;
    error?: unknown;
  }>;
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

export interface RenderDirectorStageQuery {
  data?: AssetResponse<DirectorStageManifest>;
  refetch(): Promise<{
    data?: AssetResponse<DirectorStageManifest>;
    error?: unknown;
  }>;
}

export interface RenderDirectorStatusQuery {
  refetch(): Promise<unknown>;
}

export interface RenderSectionControllerOptions {
  assignments: Record<string, string>;
  beat: Beat;
  episode: number;
  images: PoolImage[];
  project: string;
}

export interface RenderCandidateViewModel {
  id: string;
  isActive: boolean;
  isNew: boolean;
  modelLabel: string;
  modelTooltip: string;
  src: string | null;
  timeLabel: string | null;
  timeTooltip: string | null;
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
  directorWorldManifest: DirectorStageManifest | null;
  directorWorldOpen: boolean;
  downloadEnabled: boolean;
  freezonePending: boolean;
  poolDeletePending: boolean;
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
  onDelete(poolId: string): Promise<void>;
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
    const { spec: aspectSpec } =
      dependencies.useProjectAspectRatio(options.project);
    const currentAssignment =
      options.assignments[String(options.beat.beat_number)] ?? null;
    const currentSketch = currentAssignment
      ? options.images.find((image) =>
          isSketchAssignmentMatch(image, currentAssignment),
        ) ?? null
      : null;
    const latestSketch = options.images
      .filter(
        (image) =>
          image.type === "sketch" &&
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
      })[0] ?? null;
    const sourceSketchAspect = useImageAspectRatio(
      options.beat.sketch_url ||
        currentSketch?.cell_url ||
        latestSketch?.cell_url ||
        null,
    );
    const singleRenderModeKey =
      (sourceSketchAspect ?? aspectSpec.renderAspect) === "16:9"
        ? "1x1_16-9"
        : "1x1_2-3";
    const renderSceneId =
      options.beat.scene_ref?.scene_id?.trim() ||
      options.beat.location?.trim() ||
      "";
    const renderVariantId =
      options.beat.scene_ref?.variant_id?.trim() || "";
    const scenePlatePreview = queries.useScenePlatePreview(
      options.project,
      renderSceneId,
      renderVariantId,
      options.beat.time_of_day ?? "",
    );
    const backgroundAnchors = queries.useBeatBackgroundAnchors(
      options.project,
      options.episode,
      options.beat.beat_number,
    );
    const updateBackgroundAnchor = queries.useUpdateBeatBackgroundAnchor(
      options.project,
      options.episode,
      options.beat.beat_number,
    );
    const cropBackgroundAnchor = queries.useCropBeatBackgroundAnchor(
      options.project,
      options.episode,
      options.beat.beat_number,
    );
    const uploadBackgroundAnchor = queries.useUploadBeatBackgroundAnchor(
      options.project,
      options.episode,
      options.beat.beat_number,
    );
    const directorControlStatus = queries.useDirectorControlFrameStatus(
      options.project,
      options.episode,
      options.beat.beat_number,
    );
    const poolSelect = queries.usePoolSelect(options.project, options.episode);
    const poolDelete = queries.usePoolDelete(options.project, options.episode);
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
        modeKey: singleRenderModeKey,
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
    const [directorWorldOpening, setDirectorWorldOpening] = useState(false);
    const directorWorld = queries.useBeatDirectorStageManifest(
      options.project,
      options.episode,
      options.beat.beat_number,
      directorWorldOpen,
    );

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
      const generatedAge = formatGeneratedAgeLabel(image.generated_at, t, now);
      const modelSource = imagePoolModelSource(image);
      const fallbackModelLabel =
        image.mode === "upload"
          ? t("episode.workbench.media.uploadedModel")
          : t("episode.workbench.media.legacyModel");
      return {
        id: image.id,
        isActive,
        isNew:
          !Number.isNaN(generatedAtMs) &&
          now - generatedAtMs < NEW_WINDOW_MS &&
          !isSeen &&
          !isActive,
        modelLabel: modelSource?.label ?? fallbackModelLabel,
        modelTooltip: modelSource?.tooltip ?? fallbackModelLabel,
        src: image.cell_url ? resolveMediaUrl(image.cell_url) : null,
        timeLabel: generatedAge?.label ?? null,
        timeTooltip: generatedAge?.tooltip ?? null,
      };
    });
    const backgroundData =
      backgroundAnchors.data?.ok === true
        ? backgroundAnchors.data.data
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
      scenePlatePreview.data?.ok === true
        ? scenePlatePreview.data.data.render
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

    const handleDelete = async (poolId: string) => {
      try {
        await poolDelete.mutateAsync({ poolId });
        toast.success(t("episode.workbench.media.deleteSuccess"));
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("episode.workbench.media.deleteFailed"),
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
          await updateBackgroundAnchor.mutateAsync({ anchorId });
        if (!backgroundResponse.ok) {
          toast.error(
            backgroundResponse.error ||
              t("episode.workbench.render.backgroundSaveFailed"),
          );
          return;
        }
        const response = await regenerate.mutateAsync({
          beatIndices: [options.beat.beat_number],
          modeKey: singleRenderModeKey,
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
          await updateBackgroundAnchor.mutateAsync({ anchorId });
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
        const response = await cropBackgroundAnchor.mutateAsync({
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
          await uploadBackgroundAnchor.mutateAsync({ file });
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

    const handleOpenDirectorWorld = async () => {
      if (directorWorldOpening) return;
      setDirectorWorldOpening(true);
      try {
        const result = await directorWorld.refetch();
        if (result.error) {
          toast.error(
            result.error instanceof Error
              ? result.error.message
              : t("common.error"),
          );
          return;
        }
        if (result.data?.ok !== true) {
          toast.error(result.data?.error ?? t("common.error"));
          return;
        }
        setDirectorWorldOpen(true);
      } finally {
        setDirectorWorldOpening(false);
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
      await Promise.all([
        directorControlStatus.refetch(),
        backgroundAnchors.refetch(),
      ]);
      setDirectorWorldOpen(false);
    };

    return {
      background: {
        anchor: currentBackground,
        sourceId: currentBackgroundSource,
        reference: currentBackgroundReference,
        renderInput: backgroundData?.renderInput ?? null,
        cropAspectLabel: aspectSpec.renderAspect,
        cropAspectRatio: aspectSpec.ratioValue,
        anchors: backgroundData?.anchors ?? [],
        canChoose: backgroundData?.canChoose ?? false,
        loading: backgroundAnchors.isLoading,
        choosing: updateBackgroundAnchor.isPending,
        uploading: uploadBackgroundAnchor.isPending,
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
        onOpenDirectorWorld: () => {
          void handleOpenDirectorWorld();
        },
      },
      beatNumber: options.beat.beat_number,
      candidates: candidateItems,
      directorWorldManifest:
        directorWorld.data?.ok === true ? directorWorld.data.data : null,
      directorWorldOpen,
      downloadEnabled: detailRender !== null,
      freezonePending,
      poolDeletePending: poolDelete.isPending,
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
      renderAspectRatio: ratioToCss(aspectSpec.renderAspect),
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
      onDelete: handleDelete,
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

function isSketchAssignmentMatch(image: PoolImage, assignment: string): boolean {
  return (
    image.type === "sketch" &&
    (image.id === assignment ||
      image.cell_path === assignment ||
      image.grid_path === assignment)
  );
}

function useImageAspectRatio(url: string | null): "2:3" | "16:9" | null {
  const [aspect, setAspect] = useState<"2:3" | "16:9" | null>(null);

  useEffect(() => {
    setAspect(null);
    const resolvedUrl = url ? resolveMediaUrl(url) : null;
    if (!resolvedUrl) return;
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
      const ratio = image.naturalWidth / image.naturalHeight;
      setAspect(
        Math.abs(ratio - 16 / 9) < Math.abs(ratio - 2 / 3)
          ? "16:9"
          : "2:3",
      );
    };
    image.src = resolvedUrl;
    return () => {
      active = false;
      image.onload = null;
    };
  }, [url]);

  return aspect;
}
