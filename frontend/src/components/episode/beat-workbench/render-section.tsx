// Copyright (c) 2026 AI anime
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useGenerationCreditCost } from "@/lib/queries/generation-credit-cost";
import {
  useBeatBackgroundAnchors,
  useBeatDirectorStageManifest,
  useCropBeatBackgroundAnchor,
  useScenePlatePreview,
  useUpdateBeatBackgroundAnchor,
  useUploadBeatBackgroundAnchor,
} from "@/modules/asset_world/public";
import {
  ThreeDDirectorDialog,
  type ThreeDDirectorCaptureMeta,
} from "@/features/viewer-kit/three-d/ThreeDDirectorDialog";
import { openPresetProjectionInMyCanvas } from "@/features/freezone/openPresetProjection";
import {
  RenderSectionView,
  StalePoolSelectError,
  type PoolImage,
  usePoolSelect,
  useRegenerateRenderBeats,
  useRenderSettings,
  useUploadBeatImage,
} from "@/modules/production/public";
import { ratioToCss } from "@/lib/aspect-ratio";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { resolveMediaUrl } from "@/lib/media-url";
import { queryKeys } from "@/lib/query-keys";
import { useNow } from "@/hooks/use-now";
import { useTaskController } from "@/hooks/use-task-controller";
import { useProjectAspectRatio } from "@/stores/aspect-ratio-store";
import { useSeenPoolStore } from "@/stores/seen-pool-store";
import type { Beat } from "@/modules/narrative_planning/public";

const NEW_WINDOW_MS = 10 * 60 * 1000;

interface RenderSectionProps {
  beat: Beat;
  project: string;
  episode: number;
  images: PoolImage[];
  assignments: Record<string, string>;
  onPreview?: (url: string) => void;
}

export function RenderSection({
  beat,
  project,
  episode,
  images,
  assignments,
  onPreview,
}: RenderSectionProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { spec: aspectSpec } = useProjectAspectRatio(project);
  const poolSelect = usePoolSelect(project, episode);
  const regenerate = useRegenerateRenderBeats(project, episode);
  const renderSettings = useRenderSettings(project);
  const renderSceneId =
    beat.scene_ref?.scene_id?.trim() || beat.location?.trim() || "";
  const renderVariantId = beat.scene_ref?.variant_id?.trim() || "";
  const scenePlatePreview = useScenePlatePreview(
    project,
    renderSceneId,
    renderVariantId,
    beat.time_of_day ?? "",
  );
  const renderPlatePreview =
    scenePlatePreview.data?.ok === true
      ? scenePlatePreview.data.data.render
      : null;
  const renderRegenCost = useGenerationCreditCost(
    "image_selection",
    renderSettings.data?.data.render_image_selection,
    { surface: "ai_anime", imageRole: "render", modeKey: "1x1_2-3" },
  );
  const uploadRender = useUploadBeatImage(project, episode, "render");
  const backgroundAnchors = useBeatBackgroundAnchors(
    project,
    episode,
    beat.beat_number,
  );
  const [directorWorldOpen, setDirectorWorldOpen] = useState(false);
  const stageManifest = useBeatDirectorStageManifest(
    project,
    episode,
    beat.beat_number,
    directorWorldOpen,
  );
  const updateBackgroundAnchor = useUpdateBeatBackgroundAnchor(
    project,
    episode,
    beat.beat_number,
  );
  const cropBackgroundAnchor = useCropBeatBackgroundAnchor(
    project,
    episode,
    beat.beat_number,
  );
  const uploadBackgroundAnchor = useUploadBeatBackgroundAnchor(
    project,
    episode,
    beat.beat_number,
  );
  // BE's `selected_regen` task row uses `scope=selection_scope(mode_key,
  // beats)` with beat_num=None. Passing `beatNum` here made the SSE filter
  // miss the row entirely. Scope is supplied at start() via the mutation
  // response.
  const regenTask = useTaskController({
    key: {
      taskType: "selected_regen",
      project,
      episode,
    },
    invalidateKeys: [
      queryKeys.grids(project, episode),
      queryKeys.beats(project, episode),
    ],
  });
  const [stalePrompt, setStalePrompt] = useState<{
    poolId: string;
    message: string;
  } | null>(null);
  const [regenConfirm, setRegenConfirm] = useState(false);
  const [freezonePending, setFreezonePending] = useState(false);
  const [croppingAnchorId, setCroppingAnchorId] = useState<string | null>(null);
  const now = useNow();
  const markSeen = useSeenPoolStore((state) => state.markSeen);
  const seenSet = useSeenPoolStore(
    (state) => state.seen[`${project}:${episode}`],
  );

  const candidates = images
    .filter(
      (image) =>
        image.type === "render" &&
        image.original_beat === beat.beat_number &&
        image.cell_url,
    )
    .sort((a, b) => {
      const aTime = a.generated_at ? Date.parse(a.generated_at) : 0;
      const bTime = b.generated_at ? Date.parse(b.generated_at) : 0;
      return bTime - aTime;
    });
  const currentAssignment = assignments[String(beat.beat_number)] ?? null;
  const assignedRender = currentAssignment
    ? images.find((image) =>
        isRenderAssignmentMatch(image, currentAssignment),
      ) ?? null
    : null;
  const detailRender = assignedRender ?? candidates[0] ?? null;
  const previewUrl = beat.frame_url ?? detailRender?.cell_url ?? null;
  const renderActive = regenTask.started;
  const renderPercent = Math.max(
    0,
    Math.min(
      100,
      Math.round((regenTask.stream?.progress ?? 0) * 100),
    ),
  );
  const candidateViews = candidates.map((image) => {
    const isActive =
      currentAssignment !== null &&
      isRenderAssignmentMatch(image, currentAssignment);
    const generatedAtMs = image.generated_at
      ? Date.parse(image.generated_at)
      : Number.NaN;
    const withinNewWindow =
      !Number.isNaN(generatedAtMs) && now - generatedAtMs < NEW_WINDOW_MS;
    const isSeen = !!seenSet && seenSet.includes(image.id);
    return {
      id: image.id,
      src: image.cell_url ? resolveMediaUrl(image.cell_url) : null,
      isActive,
      isNew: withinNewWindow && !isSeen && !isActive,
      timeLabel: formatRelativeTime(image.generated_at, now),
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

  const handleSelect = async (poolId: string) => {
    markSeen(project, episode, poolId);
    try {
      await poolSelect.mutateAsync({ beatNum: beat.beat_number, poolId });
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
    markSeen(project, episode, poolId);
    try {
      await poolSelect.mutateAsync({
        beatNum: beat.beat_number,
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
      const backgroundResponse = await updateBackgroundAnchor.mutateAsync({
        anchorId,
      });
      if (!backgroundResponse.ok) {
        toast.error(
          backgroundResponse.error ||
            t("episode.workbench.render.backgroundSaveFailed"),
        );
        return;
      }
      const response = await regenerate.mutateAsync({
        beatIndices: [beat.beat_number],
        modeKey: "1x1_2-3",
      });
      if (response.ok === false) {
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

  const handleDownload = () => {
    if (!detailRender?.cell_url) return;
    const url = resolveMediaUrl(detailRender.cell_url);
    if (!url) return;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `beat_${beat.beat_number}_render.png`;
    anchor.click();
  };

  const handleUpload = async (file: File | null | undefined) => {
    if (!file) return;
    try {
      const response = await uploadRender.mutateAsync({
        beatNum: beat.beat_number,
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
      const response = await updateBackgroundAnchor.mutateAsync({ anchorId });
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

  const handleUploadBackground = async (file: File | null | undefined) => {
    if (!file) return;
    try {
      const response = await uploadBackgroundAnchor.mutateAsync({ file });
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

  const handleDirectorWorldCombinedCapture = async (
    _blob: Blob,
    meta: ThreeDDirectorCaptureMeta,
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
    await queryClient.invalidateQueries({
      queryKey: queryKeys.directorControlFrame(
        project,
        episode,
        beat.beat_number,
      ),
    });
    setDirectorWorldOpen(false);
  };

  const handleOpenRenderFreezone = async () => {
    setFreezonePending(true);
    try {
      await openPresetProjectionInMyCanvas(project, {
        scope: "beat",
        episode,
        beat: beat.beat_number,
        primary_slot: "frame",
      });
      toast.success(t("episode.workbench.render.freezoneOpened"));
    } catch {
      toast.error(t("episode.workbench.render.freezoneOpenFailed"));
    } finally {
      setFreezonePending(false);
    }
  };

  return (
    <RenderSectionView
      background={{
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
        onChoose: handleChooseBackground,
        onCrop: handleCropBackground,
        onUpload: handleUploadBackground,
        onOpenDirectorWorld: () => setDirectorWorldOpen(true),
      }}
      beatNumber={beat.beat_number}
      candidates={candidateViews}
      downloadEnabled={detailRender !== null}
      extraDialogs={
        <ThreeDDirectorDialog
          open={directorWorldOpen}
          onOpenChange={setDirectorWorldOpen}
          manifest={stageManifest.data?.ok ? stageManifest.data.data : null}
          title={t("episode.workbench.render.backgroundOpen360")}
          description={t(
            "episode.workbench.render.backgroundDirectorWorldDescription",
          )}
          viewerPurpose="beat"
          autoCommitDirectorCombined
          onSubmitDirectorCombined={handleDirectorWorldCombinedCapture}
        />
      }
      freezonePending={freezonePending}
      poolSelectPending={poolSelect.isPending}
      previewUrl={previewUrl}
      regenConfirmOpen={regenConfirm}
      regenPending={regenerate.isPending}
      regenTaskStarted={regenTask.started}
      regenTaskStopping={regenTask.stopping}
      relight={
        renderPlatePreview
          ? {
              enabled: renderPlatePreview.relight,
              timeOfDay: beat.time_of_day ?? "",
            }
          : null
      }
      renderActive={renderActive}
      renderAspectRatio={ratioToCss(aspectSpec.renderAspect)}
      renderPercent={renderPercent}
      renderRegenCostDisplay={renderRegenCost.data?.data.display}
      stalePromptOpen={stalePrompt !== null}
      uploadPending={uploadRender.isPending}
      onConfirmRegen={() => {
        setRegenConfirm(false);
        return handleRegen();
      }}
      onDownload={handleDownload}
      onForceStale={handleStaleForce}
      onOpenFreezone={handleOpenRenderFreezone}
      onPreview={onPreview}
      onRegenConfirmOpenChange={setRegenConfirm}
      onRequestRegen={() => setRegenConfirm(true)}
      onSelect={handleSelect}
      onStalePromptOpenChange={(open) => {
        if (!open) setStalePrompt(null);
      }}
      onStopRegenTask={() => regenTask.stop()}
      onUpload={handleUpload}
    />
  );
}

function isRenderAssignmentMatch(image: PoolImage, assignment: string) {
  return (
    image.type === "render" &&
    (image.id === assignment ||
      image.cell_path === assignment ||
      image.grid_path === assignment)
  );
}
