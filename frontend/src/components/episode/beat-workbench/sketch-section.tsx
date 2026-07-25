// Copyright (c) 2026 AI anime
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { isNoReferenceMarker } from "@/lib/beat-markers";
import { useGenerationCreditCost } from "@/lib/queries/generation-credit-cost";
import {
  ThreeDDirectorDialog,
  type ThreeDDirectorCaptureMeta,
} from "@/features/viewer-kit/three-d/ThreeDDirectorDialog";
import { openPresetProjectionInMyCanvas } from "@/features/freezone/openPresetProjection";
import {
  useBeatBackgroundAnchors,
  useBeatDirectorStageManifest,
  useCharacters,
  useDirectorControlFrameStatus,
  useUpdateBeatBackgroundAnchor,
  type BeatBackgroundAnchors,
} from "@/modules/asset_world/public";
import {
  useEpisodeDetail,
  useScript,
  type Beat,
} from "@/modules/narrative_planning/public";
import {
  StalePoolSelectError,
  SketchSectionView,
  type PoolImage,
  type SketchToolAction,
  useDirectorControlToSketch,
  usePoolSelect,
  useRegenerateSketches,
  useSketchSettings,
  useUploadBeatImage,
} from "@/modules/production/public";
import { parseColorValue, splitIdentityId } from "@/lib/sketch-colors";
import { resolveMediaUrl } from "@/lib/media-url";
import { withImageCacheBust } from "@/features/canvas/application/imageData";
import { ratioToCss } from "@/lib/aspect-ratio";
import { useProjectAspectRatio } from "@/stores/aspect-ratio-store";
import { resolveImage } from "@/lib/resolve-image";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { useNow } from "@/hooks/use-now";
import { useNavigateToAsset } from "@/hooks/use-assets-deep-link";
import { useTaskController } from "@/hooks/use-task-controller";
import { queryKeys } from "@/lib/query-keys";
import { useSeenPoolStore } from "@/stores/seen-pool-store";
import { SketchPoseEditorDialog } from "./sketch-pose-editor-dialog";
import { SketchCropDialog } from "./sketch-crop-dialog";

const NEW_WINDOW_MS = 10 * 60 * 1000;

interface SketchSectionProps {
  beat: Beat;
  project: string;
  episode: number;
  images: PoolImage[];
  assignments: Record<string, string>;
  onPreview?: (url: string) => void;
}

export function SketchSection({
  beat,
  project,
  episode,
  images,
  assignments,
  onPreview,
}: SketchSectionProps) {
  const { t } = useTranslation();
  const { spec } = useProjectAspectRatio(project);
  const navigateToAsset = useNavigateToAsset(project);
  const poolSelect = usePoolSelect(project, episode);
  const regenerate = useRegenerateSketches(project, episode);
  const sketchSettings = useSketchSettings(project);
  const singleSketchModeKey =
    spec.sketchAspect === "16:9" ? "1x1_16-9_sketch" : "1x1_2-3_sketch";
  const sketchRegenCost = useGenerationCreditCost(
    "image_selection",
    sketchSettings.data?.data.sketch_image_selection,
    { surface: "ai_anime", imageRole: "sketch", modeKey: singleSketchModeKey },
  );
  const uploadSketch = useUploadBeatImage(project, episode, "sketch");
  const [stageDialogOpen, setStageDialogOpen] = useState(false);
  const stageManifest = useBeatDirectorStageManifest(
    project,
    episode,
    beat.beat_number,
    stageDialogOpen,
  );
  const backgroundAnchors = useBeatBackgroundAnchors(project, episode, beat.beat_number);
  const updateBackgroundAnchor = useUpdateBeatBackgroundAnchor(project, episode, beat.beat_number);
  const directorStatus = useDirectorControlFrameStatus(project, episode, beat.beat_number);
  const directorConvert = useDirectorControlToSketch(project, episode, beat.beat_number);
  const { data: scriptRes } = useScript(project, episode);
  const { data: charsRes } = useCharacters(project);
  const { data: episodeRes } = useEpisodeDetail(project, episode);
  // BE's `sketch_regen` task row uses `scope=selection_scope(mode_key,
  // beats)` with beat_num=None. Earlier comment here was wrong — we had
  // been passing `beatNum`, but the BE never set it, so the SSE filter
  // missed the row and the stream fell into a "Task not found" reconnect
  // loop. Scope now flows through `start({ scope })` from the mutation
  // response.
  const regenTask = useTaskController({
    key: {
      taskType: "sketch_regen",
      project,
      episode,
    },
    invalidateKeys: [
      queryKeys.grids(project, episode),
      queryKeys.beats(project, episode),
    ],
  });
  const directorTask = useTaskController({
    key: {
      taskType: "sketch_generation",
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
    nextAction?: SketchToolAction;
  } | null>(null);
  const [regenConfirm, setRegenConfirm] = useState(false);
  const [poseEditorOpen, setPoseEditorOpen] = useState(false);
  const [cropOpen, setCropOpen] = useState(false);
  const [backgroundDialogOpen, setBackgroundDialogOpen] = useState(false);
  const [backgroundDialogData, setBackgroundDialogData] =
    useState<BeatBackgroundAnchors | null>(null);
  const [freezonePending, setFreezonePending] = useState(false);
  const now = useNow();
  const markSeen = useSeenPoolStore((s) => s.markSeen);
  const seenSet = useSeenPoolStore((s) => s.seen[`${project}:${episode}`]);

  const resolved = resolveImage(images, assignments, beat.beat_number, "sketch", beat.sketch_url ?? null);
  const resolvedDownloadUrl = resolved.url ? resolveMediaUrl(resolved.url) : null;
  // Live loading state for the preview card: either the director generation or
  // a regen run drives the overlay. Progress from the active task's SSE stream
  // (0–1) is surfaced as a percentage; it survives refresh because both
  // controllers reconcile against the persisted task row.
  const sketchActive = directorTask.started || regenTask.started;
  const sketchStream = directorTask.started ? directorTask.stream : regenTask.stream;
  const sketchPercent = Math.max(
    0,
    Math.min(100, Math.round((sketchStream?.progress ?? 0) * 100)),
  );
  const candidates = images
    .filter((i) => i.type === "sketch" && i.cell_url)
    .sort((a, b) => {
      const ta = a.generated_at ? Date.parse(a.generated_at) : 0;
      const tb = b.generated_at ? Date.parse(b.generated_at) : 0;
      return tb - ta;
    });

  const currentPoolId = assignments[String(beat.beat_number)] ?? null;
  const selectedPoolImage = currentPoolId
    ? images.find((img) => img.id === currentPoolId && img.type === "sketch") ?? null
    : null;
  const hasSketch = Boolean(resolved.url);

  const castedEntries = useMemo(() => {
    const sketchColors = scriptRes?.data?.sketch_colors ?? {};
    const characterNames = new Set((charsRes?.data ?? []).map((c) => c.name));
    return (beat.detected_identities ?? [])
      .filter((identityId) => !isNoReferenceMarker(identityId))
      .map((identityId) => {
        const { hex } = parseColorValue(sketchColors[identityId] ?? "");
        if (!hex) return null;
        const { character, identity } = splitIdentityId(identityId, characterNames);
        return { identityId, hex, character, identity };
      })
      .filter((e): e is { identityId: string; hex: string; character: string; identity: string } => e !== null);
  }, [beat.detected_identities, scriptRes, charsRes]);
  const propEntries = useMemo(() => {
    const propById = new Map(
      (episodeRes?.data?.prop_menu ?? []).map((prop) => [prop.prop_id, prop]),
    );
    // __NO_PROP__ 是「本镜无道具」的哨兵，不是道具 id —— 过滤掉，否则会当成一个
    // 名叫 __NO_PROP__ 的道具渲染成 chip。
    return (beat.detected_props ?? [])
      .filter((propId) => !isNoReferenceMarker(propId))
      .map((propId) => {
        const prop = propById.get(propId);
        const { hex } = parseColorValue(prop?.marker_color ?? "");
        return { propId, hex };
      });
  }, [beat.detected_props, episodeRes]);
  const markedPropEntries = useMemo(() => {
    const detected = new Set(beat.detected_props ?? []);
    return extractMarkedProps(beat.visual_description ?? "").filter(
      (propId) => !detected.has(propId) && !isNoReferenceMarker(propId),
    );
  }, [beat.detected_props, beat.visual_description]);
  const directorControl =
    directorStatus.data?.ok === true ? directorStatus.data.data : null;
  const resolvedDirectorControlUrl =
    directorControl?.ready && directorControl.url
      ? resolveMediaUrl(directorControl.url)
      : null;
  const directorControlUrl = resolvedDirectorControlUrl
    ? withImageCacheBust(resolvedDirectorControlUrl, directorStatus.dataUpdatedAt)
    : null;
  const backgroundData =
    backgroundAnchors.data?.ok === true ? backgroundAnchors.data.data : null;
  const visibleBackgroundData = backgroundDialogData ?? backgroundData;
  const candidateItems = candidates.map((image) => {
    const generatedAtMs = image.generated_at
      ? Date.parse(image.generated_at)
      : Number.NaN;
    const isActive = currentPoolId === image.id;
    const isSeen = Boolean(seenSet?.includes(image.id));
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
  const backgroundAnchorItems = (visibleBackgroundData?.anchors ?? []).map(
    (anchor) => ({
      current: anchor.current,
      exists: anchor.exists,
      id: anchor.id,
      label: anchor.label,
      snapshotToSelectedBackground: Boolean(
        anchor.snapshotToSelectedBackground,
      ),
      url: anchor.url ? resolveMediaUrl(anchor.url) : null,
    }),
  );

  const openSketchTool = (action: SketchToolAction) => {
    if (action === "pose") {
      setPoseEditorOpen(true);
      return;
    }
    setCropOpen(true);
  };

  const promotePoolSketch = async (poolId: string, nextAction?: SketchToolAction) => {
    markSeen(project, episode, poolId);
    try {
      await poolSelect.mutateAsync({ beatNum: beat.beat_number, poolId });
      toast.success(t("episode.workbench.sketch.switched"));
      if (nextAction) openSketchTool(nextAction);
    } catch (err) {
      if (err instanceof StalePoolSelectError) {
        setStalePrompt({ poolId, message: err.message, nextAction });
        return;
      }
      toast.error(err instanceof Error ? err.message : t("episode.workbench.sketch.switchFailed"));
    }
  };

  const handleSelect = async (poolId: string) => {
    await promotePoolSketch(poolId);
  };

  const handleOpenSketchTool = async (action: SketchToolAction) => {
    if (beat.sketch_url) {
      openSketchTool(action);
      return;
    }
    const poolId = selectedPoolImage?.id;
    if (!poolId) {
      toast.error(t("episode.beat.noSketch"));
      return;
    }
    await promotePoolSketch(poolId, action);
  };

  const handleStaleForce = async () => {
    if (!stalePrompt) return;
    const poolId = stalePrompt.poolId;
    const nextAction = stalePrompt.nextAction;
    setStalePrompt(null);
    markSeen(project, episode, poolId);
    try {
      await poolSelect.mutateAsync({ beatNum: beat.beat_number, poolId, force: true });
      toast.success(t("episode.workbench.sketch.forcedUse"));
      if (nextAction) openSketchTool(nextAction);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("episode.workbench.sketch.forceFailed"));
    }
  };

  const handleRegen = async () => {
    try {
      const res = await regenerate.mutateAsync({
        beatIndices: [beat.beat_number],
        modeKey: singleSketchModeKey,
      });
      if (res.ok === false) {
        toast.error(res.error || t("episode.workbench.sketch.regenFailed"));
        return;
      }
      regenTask.start({ scope: res.scope });
      toast.success(t("episode.workbench.sketch.regenStarted"));
    } catch {
      toast.error(t("episode.workbench.sketch.regenFailed"));
    }
  };

  const handleDownload = () => {
    if (!resolvedDownloadUrl) return;
    const a = document.createElement("a");
    a.href = resolvedDownloadUrl;
    a.download = `beat_${beat.beat_number}_sketch.png`;
    a.click();
  };

  const handleUpload = async (file: File | null | undefined) => {
    if (!file) return;
    try {
      const res = await uploadSketch.mutateAsync({ beatNum: beat.beat_number, file });
      if (!res.ok) {
        toast.error(res.error || t("common.error"));
        return;
      }
      toast.success(t("episode.workbench.sketch.switched"));
    } catch {
      toast.error(t("common.error"));
    }
  };

  const handleConvertDirectorControl = async () => {
    try {
      const res = await directorConvert.mutateAsync();
      if (!res.ok) {
        toast.error(res.error || t("episode.workbench.sketch.convertDirectorFailed"));
        return;
      }
      directorTask.start({ scope: res.scope });
      toast.success(t("episode.workbench.sketch.convertDirectorStarted"));
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("episode.workbench.sketch.convertDirectorFailed"),
      );
    }
  };

  const handleOpenDirectorWorld = () => {
    setStageDialogOpen(true);
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
    toast.success(t("viewer.threeD.directorControlCommitted", {
      path: meta.controlFrameRelPath ?? bundle.rel_paths.combined,
    }));
    await directorStatus.refetch();
    setStageDialogOpen(false);
  };

  const handleOpenBackgroundDialog = async () => {
    try {
      const refreshed = await backgroundAnchors.refetch();
      if (refreshed.error instanceof Error) {
        toast.error(refreshed.error.message || t("episode.workbench.sketch.chooseBackgroundFailed"));
        return;
      }
      const nextData =
        refreshed.data?.ok === true ? refreshed.data.data : backgroundData;
      if (!nextData?.canChoose) {
        toast.error(nextData?.error || t("episode.workbench.sketch.chooseBackgroundFailed"));
        return;
      }
      setBackgroundDialogData(nextData);
      setBackgroundDialogOpen(true);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("episode.workbench.sketch.chooseBackgroundFailed"),
      );
    }
  };

  const handleChooseBackground = async (anchorId: string) => {
    try {
      const res = await updateBackgroundAnchor.mutateAsync({ anchorId });
      if (!res.ok) {
        toast.error(res.error || t("episode.workbench.sketch.chooseBackgroundFailed"));
        return;
      }
      toast.success(t("episode.workbench.sketch.chooseBackgroundSaved"));
      if (res.data) setBackgroundDialogData(res.data);
      setBackgroundDialogOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("episode.workbench.sketch.chooseBackgroundFailed"),
      );
    }
  };

  const handleOpenSketchFreezone = async () => {
    setFreezonePending(true);
    try {
      await openPresetProjectionInMyCanvas(project, {
        scope: "beat",
        episode,
        beat: beat.beat_number,
        primary_slot: "sketch",
      });
      toast.success(t("episode.workbench.sketch.freezoneOpened"));
    } catch {
      toast.error(t("episode.workbench.sketch.freezoneOpenFailed"));
    } finally {
      setFreezonePending(false);
    }
  };

  return (
    <SketchSectionView
      backgroundAnchors={backgroundAnchorItems}
      backgroundDialogOpen={backgroundDialogOpen}
      backgroundLoading={backgroundAnchors.isLoading}
      backgroundSaving={updateBackgroundAnchor.isPending}
      beatNumber={beat.beat_number}
      candidates={candidateItems}
      castedEntries={castedEntries}
      directorControlUrl={directorControlUrl}
      directorConvertPending={directorConvert.isPending}
      directorTask={directorTask}
      directorWorldPending={stageDialogOpen && stageManifest.isLoading}
      downloadEnabled={Boolean(resolvedDownloadUrl)}
      editable={Boolean(beat.sketch_url || selectedPoolImage)}
      extraDialogs={
        <>
          <SketchPoseEditorDialog
            open={poseEditorOpen}
            onOpenChange={setPoseEditorOpen}
            project={project}
            episode={episode}
            beatNum={beat.beat_number}
          />
          <SketchCropDialog
            open={cropOpen}
            onOpenChange={setCropOpen}
            project={project}
            episode={episode}
            beatNum={beat.beat_number}
          />
          <ThreeDDirectorDialog
            open={stageDialogOpen}
            onOpenChange={setStageDialogOpen}
            manifest={stageManifest.data?.ok ? stageManifest.data.data : null}
            title={`${t("viewer.threeD.beatDirectorWorld")} ${beat.beat_number}`}
            description={t("viewer.threeD.beatDirectorWorldDescription")}
            viewerPurpose="beat"
            autoCommitDirectorCombined
            onSubmitDirectorCombined={handleDirectorWorldCombinedCapture}
          />
        </>
      }
      freezonePending={freezonePending}
      hasSketch={hasSketch}
      markedPropEntries={markedPropEntries}
      poolSelectPending={poolSelect.isPending}
      previewUrl={resolved.url ?? null}
      propEntries={propEntries}
      regenConfirmOpen={regenConfirm}
      regenPending={regenerate.isPending}
      regenTask={regenTask}
      sketchActive={sketchActive}
      sketchAspectRatio={ratioToCss(spec.sketchAspect)}
      sketchPercent={sketchPercent}
      sketchRegenCostDisplay={sketchRegenCost.data?.data.display}
      stalePromptOpen={stalePrompt !== null}
      uploadPending={uploadSketch.isPending}
      onBackgroundDialogOpenChange={(open) => {
        setBackgroundDialogOpen(open);
        if (!open) setBackgroundDialogData(null);
      }}
      onChooseBackground={(anchorId) => void handleChooseBackground(anchorId)}
      onConfirmRegen={() => {
        setRegenConfirm(false);
        void handleRegen();
      }}
      onConvertDirectorControl={() => void handleConvertDirectorControl()}
      onDownload={handleDownload}
      onForceStale={() => void handleStaleForce()}
      onNavigateToAsset={navigateToAsset}
      onOpenBackgroundDialog={() => void handleOpenBackgroundDialog()}
      onOpenDirectorWorld={handleOpenDirectorWorld}
      onOpenFreezone={() => void handleOpenSketchFreezone()}
      onOpenSketchTool={(action) => void handleOpenSketchTool(action)}
      onPreview={onPreview}
      onRegenConfirmOpenChange={setRegenConfirm}
      onRequestRegen={() => setRegenConfirm(true)}
      onSelect={(poolId) => void handleSelect(poolId)}
      onStalePromptOpenChange={(open) => {
        if (!open) setStalePrompt(null);
      }}
      onStopDirectorTask={() => void directorTask.stop()}
      onStopRegenTask={() => void regenTask.stop()}
      onUpload={(file) => void handleUpload(file)}
    />
  );
}

function extractMarkedProps(visualDescription: string): string[] {
  const props: string[] = [];
  const seen = new Set<string>();
  for (const match of visualDescription.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const propId = (match[1] ?? "").trim();
    if (!propId || seen.has(propId)) continue;
    seen.add(propId);
    props.push(propId);
  }
  return props;
}
