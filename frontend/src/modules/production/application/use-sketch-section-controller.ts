// Copyright (c) 2026 AI anime
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useTaskController } from "@/hooks/use-task-controller";
import { ratioToCss } from "@/lib/aspect-ratio";
import { isNoReferenceMarker } from "@/lib/beat-markers";
import { formatRelativeTime } from "@/lib/format-relative-time";
import { resolveMediaUrl } from "@/lib/media-url";
import { queryKeys } from "@/lib/query-keys";
import { resolveImage } from "@/lib/resolve-image";
import { parseColorValue, splitIdentityId } from "@/lib/sketch-colors";
import type {
  AssetResponse,
  BeatBackgroundAnchors,
  DirectorStageManifest,
  DirectorControlFrameStatus,
} from "@/modules/asset_world/public";
import type {
  Beat,
  DataResponse,
  Episode,
  Script,
} from "@/modules/narrative_planning/public";
import { StalePoolSelectError } from "@/modules/production/application/image-pool-errors";
import type {
  BeatImageUploadResponse,
  ImagePoolSelectResponse,
  ProductionDataResponse,
  ProductionErrorResponse,
  ProductionTaskResponse,
} from "@/modules/production/application/ports";
import type { PoolImage } from "@/modules/production/domain/image-pool";
import type {
  SketchAspectRatio,
  SketchSettingsData,
} from "@/modules/production/domain/image-settings";
import type { RegenerateSketchesCommand } from "@/modules/production/domain/sketch-generation";

const NEW_WINDOW_MS = 10 * 60 * 1000;

interface CreditCostQuery {
  data?: { data: { display?: string | null } };
}

interface SketchSettingsQuery {
  data?: ProductionDataResponse<SketchSettingsData>;
}

interface PoolSelectMutation {
  isPending: boolean;
  mutateAsync(command: {
    beatNum: number;
    force?: boolean;
    poolId: string;
  }): Promise<ImagePoolSelectResponse>;
}

interface RegenerateSketchesMutation {
  isPending: boolean;
  mutateAsync(
    command: RegenerateSketchesCommand,
  ): Promise<ProductionTaskResponse | ProductionErrorResponse>;
}

interface UploadSketchMutation {
  isPending: boolean;
  mutateAsync(command: {
    beatNum: number;
    file: File;
  }): Promise<BeatImageUploadResponse>;
}

interface DirectorControlMutation {
  isPending: boolean;
  mutateAsync(): Promise<ProductionTaskResponse | ProductionErrorResponse>;
}

export interface SketchSectionControllerQueries {
  useBeatBackgroundAnchors(
    project: string,
    episode: number,
    beatNumber: number,
  ): SketchBackgroundAnchorsQuery;
  useBeatDirectorStageManifest(
    project: string,
    episode: number,
    beatNumber: number,
    enabled: boolean,
  ): SketchDirectorStageQuery;
  useCharacters(project: string): SketchCharactersQuery;
  useDirectorControlToSketch(
    project: string,
    episode: number,
    beatNumber: number,
  ): DirectorControlMutation;
  useDirectorControlFrameStatus(
    project: string,
    episode: number,
    beatNumber: number,
  ): SketchDirectorStatusQuery;
  useEpisodeDetail(
    project: string,
    episode: number,
  ): SketchEpisodeQuery;
  usePoolSelect(project: string, episode: number): PoolSelectMutation;
  useRegenerateSketches(
    project: string,
    episode: number,
  ): RegenerateSketchesMutation;
  useSketchSettings(project: string): SketchSettingsQuery;
  useScript(project: string, episode: number): SketchScriptQuery;
  useUpdateBeatBackgroundAnchor(
    project: string,
    episode: number,
    beatNumber: number,
  ): UpdateSketchBackgroundMutation;
  useUploadBeatImage(
    project: string,
    episode: number,
    imageType: "sketch",
  ): UploadSketchMutation;
}

export interface SeenSketchCandidates {
  seenIds: string[] | undefined;
  markSeen(project: string, episode: number, poolId: string): void;
}

export interface SketchSectionControllerDependencies {
  cacheBustImage(
    url: string,
    token: string | number | null | undefined,
  ): string;
  downloadFile(url: string, filename: string): void;
  openSketchFreezone(
    project: string,
    episode: number,
    beatNumber: number,
  ): Promise<unknown>;
  useGenerationCreditCost(
    kind: "image_selection",
    value: string | undefined,
    options: {
      imageRole: "sketch";
      modeKey: string;
      surface: "ai_anime";
    },
  ): CreditCostQuery;
  useAssetNavigation(
    project: string,
  ): (kind: "identity" | "prop", id: string) => void;
  useNow(): number;
  useProjectAspectRatio(project: string): {
    spec: { sketchAspect: SketchAspectRatio };
  };
  useSeenSketchCandidates(
    project: string,
    episode: number,
  ): SeenSketchCandidates;
}

export interface SketchBackgroundAnchorsQuery {
  data?: AssetResponse<BeatBackgroundAnchors>;
  isLoading: boolean;
  refetch(): Promise<{
    data?: AssetResponse<BeatBackgroundAnchors>;
    error?: unknown;
  }>;
}

export interface SketchCharactersQuery {
  data?: AssetResponse<Array<{ name: string }>>;
}

export interface SketchDirectorStageQuery {
  data?: AssetResponse<DirectorStageManifest>;
  isLoading: boolean;
}

export interface SketchEpisodeQuery {
  data?: DataResponse<Episode>;
}

export interface SketchScriptQuery {
  data?: DataResponse<Script | null>;
}

export interface UpdateSketchBackgroundMutation {
  isPending: boolean;
  mutateAsync(command: {
    anchorId: string;
  }): Promise<AssetResponse<BeatBackgroundAnchors>>;
}

export interface SketchDirectorStatusQuery {
  data?: AssetResponse<DirectorControlFrameStatus>;
  dataUpdatedAt: number;
  refetch(): Promise<unknown>;
}

export interface SketchSectionControllerOptions {
  assignments: Record<string, string>;
  beat: Beat;
  episode: number;
  images: PoolImage[];
  project: string;
}

export type SketchToolAction = "pose" | "crop";

export interface SketchIdentityBadgeViewModel {
  character: string;
  hex: string;
  identity: string;
  identityId: string;
}

export interface SketchPropBadgeViewModel {
  hex: string | null;
  propId: string;
}

export interface SketchCandidateViewModel {
  id: string;
  isActive: boolean;
  isNew: boolean;
  src: string | null;
  timeLabel: string | null;
}

export interface SketchBackgroundAnchorViewModel {
  current: boolean;
  exists: boolean;
  id: string;
  label: string;
  snapshotToSelectedBackground: boolean;
  url: string | null;
}

export interface SketchTaskViewModel {
  started: boolean;
  stopping: boolean;
}

export interface DirectorCaptureMeta {
  controlFrameBundle?: {
    rel_paths: Record<string, string>;
  } | null;
  controlFrameRelPath?: string | null;
}

export interface SketchSectionController {
  backgroundAnchors: SketchBackgroundAnchorViewModel[];
  backgroundDialogOpen: boolean;
  backgroundLoading: boolean;
  backgroundSaving: boolean;
  beatNumber: number;
  candidates: SketchCandidateViewModel[];
  castedEntries: SketchIdentityBadgeViewModel[];
  cropOpen: boolean;
  directorControlUrl: string | null;
  directorConvertPending: boolean;
  directorTask: SketchTaskViewModel;
  directorWorldManifest: DirectorStageManifest | null;
  directorWorldPending: boolean;
  downloadEnabled: boolean;
  editable: boolean;
  episode: number;
  freezonePending: boolean;
  hasSketch: boolean;
  markedPropEntries: string[];
  poolSelectPending: boolean;
  poseEditorOpen: boolean;
  previewUrl: string | null;
  project: string;
  propEntries: SketchPropBadgeViewModel[];
  regenConfirmOpen: boolean;
  regenPending: boolean;
  regenTask: SketchTaskViewModel;
  sketchActive: boolean;
  sketchAspectRatio: string;
  sketchPercent: number;
  sketchRegenCostDisplay?: string | null;
  stageDialogOpen: boolean;
  stalePromptOpen: boolean;
  uploadPending: boolean;
  commitDirectorCapture(meta: DirectorCaptureMeta): Promise<void>;
  onBackgroundDialogOpenChange(open: boolean): void;
  onChooseBackground(anchorId: string): void;
  onConfirmRegen(): void;
  onConvertDirectorControl(): void;
  onDownload(): void;
  onForceStale(): void;
  onNavigateToAsset(kind: "identity" | "prop", id: string): void;
  onOpenBackgroundDialog(): void;
  onOpenDirectorWorld(): void;
  onOpenFreezone(): void;
  onOpenSketchTool(action: SketchToolAction): void;
  onRegenConfirmOpenChange(open: boolean): void;
  onRequestRegen(): void;
  onSelect(poolId: string): void;
  onStalePromptOpenChange(open: boolean): void;
  onStopDirectorTask(): void;
  onStopRegenTask(): void;
  onUpload(file: File | null | undefined): void;
  setCropOpen(open: boolean): void;
  setPoseEditorOpen(open: boolean): void;
  setStageDialogOpen(open: boolean): void;
}

export function createUseSketchSectionController(
  queries: SketchSectionControllerQueries,
  dependencies: SketchSectionControllerDependencies,
) {
  return function useSketchSectionController(
    options: SketchSectionControllerOptions,
  ): SketchSectionController {
    const { t } = useTranslation();
    const { spec } = dependencies.useProjectAspectRatio(options.project);
    const navigateToAsset = dependencies.useAssetNavigation(options.project);
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
    const directorStatus = queries.useDirectorControlFrameStatus(
      options.project,
      options.episode,
      options.beat.beat_number,
    );
    const scriptQuery = queries.useScript(options.project, options.episode);
    const charactersQuery = queries.useCharacters(options.project);
    const episodeQuery = queries.useEpisodeDetail(
      options.project,
      options.episode,
    );
    const poolSelect = queries.usePoolSelect(options.project, options.episode);
    const regenerate = queries.useRegenerateSketches(
      options.project,
      options.episode,
    );
    const sketchSettings = queries.useSketchSettings(options.project);
    const singleSketchModeKey =
      spec.sketchAspect === "16:9"
        ? "1x1_16-9_sketch"
        : "1x1_2-3_sketch";
    const sketchRegenCost = dependencies.useGenerationCreditCost(
      "image_selection",
      sketchSettings.data?.data.sketch_image_selection,
      {
        surface: "ai_anime",
        imageRole: "sketch",
        modeKey: singleSketchModeKey,
      },
    );
    const uploadSketch = queries.useUploadBeatImage(
      options.project,
      options.episode,
      "sketch",
    );
    const directorConvert = queries.useDirectorControlToSketch(
      options.project,
      options.episode,
      options.beat.beat_number,
    );
    // sketch_regen is persisted by the scope returned from the mutation;
    // passing beatNum here would prevent the SSE controller from resuming it.
    const regenTask = useTaskController({
      key: {
        taskType: "sketch_regen",
        project: options.project,
        episode: options.episode,
      },
      invalidateKeys: [
        queryKeys.grids(options.project, options.episode),
        queryKeys.beats(options.project, options.episode),
      ],
    });
    const directorTask = useTaskController({
      key: {
        taskType: "sketch_generation",
        project: options.project,
        episode: options.episode,
      },
      invalidateKeys: [
        queryKeys.grids(options.project, options.episode),
        queryKeys.beats(options.project, options.episode),
      ],
    });
    const [stalePrompt, setStalePrompt] = useState<{
      message: string;
      nextAction?: SketchToolAction;
      poolId: string;
    } | null>(null);
    const [regenConfirmOpen, setRegenConfirmOpen] = useState(false);
    const [poseEditorOpen, setPoseEditorOpen] = useState(false);
    const [cropOpen, setCropOpen] = useState(false);
    const [stageDialogOpen, setStageDialogOpen] = useState(false);
    const [backgroundDialogOpen, setBackgroundDialogOpen] = useState(false);
    const [backgroundDialogData, setBackgroundDialogData] =
      useState<BeatBackgroundAnchors | null>(null);
    const [freezonePending, setFreezonePending] = useState(false);
    const directorWorld = queries.useBeatDirectorStageManifest(
      options.project,
      options.episode,
      options.beat.beat_number,
      stageDialogOpen,
    );
    const now = dependencies.useNow();
    const seenCandidates = dependencies.useSeenSketchCandidates(
      options.project,
      options.episode,
    );

    const resolved = resolveImage(
      options.images,
      options.assignments,
      options.beat.beat_number,
      "sketch",
      options.beat.sketch_url ?? null,
    );
    const resolvedDownloadUrl = resolved.url
      ? resolveMediaUrl(resolved.url)
      : null;
    const sketchActive = directorTask.started || regenTask.started;
    const sketchStream = directorTask.started
      ? directorTask.stream
      : regenTask.stream;
    const sketchPercent = Math.max(
      0,
      Math.min(100, Math.round((sketchStream?.progress ?? 0) * 100)),
    );
    const candidates = options.images
      .filter((image) => image.type === "sketch" && image.cell_url)
      .sort((first, second) => {
        const firstTime = first.generated_at
          ? Date.parse(first.generated_at)
          : 0;
        const secondTime = second.generated_at
          ? Date.parse(second.generated_at)
          : 0;
        return secondTime - firstTime;
      });
    const currentPoolId =
      options.assignments[String(options.beat.beat_number)] ?? null;
    const selectedPoolImage = currentPoolId
      ? options.images.find(
          (image) =>
            image.id === currentPoolId && image.type === "sketch",
        ) ?? null
      : null;
    const hasSketch = Boolean(resolved.url);
    const castedEntries = useMemo(() => {
      const characterNames = new Set(
        (charactersQuery.data?.ok === true
          ? charactersQuery.data.data
          : []
        ).map((character) => character.name),
      );
      return (options.beat.detected_identities ?? [])
        .filter((identityId) => !isNoReferenceMarker(identityId))
        .map((identityId) => {
          const { hex } = parseColorValue(
            (scriptQuery.data?.data?.sketch_colors ?? {})[identityId] ?? "",
          );
          if (!hex) return null;
          const { character, identity } = splitIdentityId(
            identityId,
            characterNames,
          );
          return { identityId, hex, character, identity };
        })
        .filter(
          (entry): entry is SketchIdentityBadgeViewModel => entry !== null,
        );
    }, [
      options.beat.detected_identities,
      charactersQuery.data,
      scriptQuery.data,
    ]);
    const propEntries = useMemo(() => {
      const propById = new Map(
        (episodeQuery.data?.data.prop_menu ?? []).map((prop) => [
          prop.prop_id,
          prop,
        ]),
      );
      // No-reference markers are workflow sentinels, not renderable prop ids.
      return (options.beat.detected_props ?? [])
        .filter((propId) => !isNoReferenceMarker(propId))
        .map((propId) => {
          const prop = propById.get(propId);
          const { hex } = parseColorValue(prop?.marker_color ?? "");
          return { propId, hex };
        });
    }, [episodeQuery.data, options.beat.detected_props]);
    const markedPropEntries = useMemo(() => {
      const detected = new Set(options.beat.detected_props ?? []);
      return extractMarkedProps(options.beat.visual_description ?? "").filter(
        (propId) =>
          !detected.has(propId) && !isNoReferenceMarker(propId),
      );
    }, [
      options.beat.detected_props,
      options.beat.visual_description,
    ]);
    const directorControl =
      directorStatus.data?.ok === true
        ? directorStatus.data.data
        : null;
    const resolvedDirectorControlUrl =
      directorControl?.ready && directorControl.url
        ? resolveMediaUrl(directorControl.url)
        : null;
    const directorControlUrl = resolvedDirectorControlUrl
      ? dependencies.cacheBustImage(
          resolvedDirectorControlUrl,
          directorStatus.dataUpdatedAt,
        )
      : null;
    const backgroundData =
      backgroundAnchors.data?.ok === true
        ? backgroundAnchors.data.data
        : null;
    const visibleBackgroundData = backgroundDialogData ?? backgroundData;
    const candidateItems = candidates.map((image) => {
      const generatedAtMs = image.generated_at
        ? Date.parse(image.generated_at)
        : Number.NaN;
      const isActive = currentPoolId === image.id;
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
    const backgroundAnchorItems = (
      visibleBackgroundData?.anchors ?? []
    ).map((anchor) => ({
      current: anchor.current,
      exists: anchor.exists,
      id: anchor.id,
      label: anchor.label,
      snapshotToSelectedBackground: Boolean(
        anchor.snapshotToSelectedBackground,
      ),
      url: anchor.url ? resolveMediaUrl(anchor.url) : null,
    }));

    const openSketchTool = (action: SketchToolAction) => {
      if (action === "pose") {
        setPoseEditorOpen(true);
        return;
      }
      setCropOpen(true);
    };

    const promotePoolSketch = async (
      poolId: string,
      nextAction?: SketchToolAction,
    ) => {
      seenCandidates.markSeen(options.project, options.episode, poolId);
      try {
        await poolSelect.mutateAsync({
          beatNum: options.beat.beat_number,
          poolId,
        });
        toast.success(t("episode.workbench.sketch.switched"));
        if (nextAction) openSketchTool(nextAction);
      } catch (error) {
        if (error instanceof StalePoolSelectError) {
          setStalePrompt({
            poolId,
            message: error.message,
            nextAction,
          });
          return;
        }
        toast.error(
          error instanceof Error
            ? error.message
            : t("episode.workbench.sketch.switchFailed"),
        );
      }
    };

    const handleOpenSketchTool = async (action: SketchToolAction) => {
      if (options.beat.sketch_url) {
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
      const { nextAction, poolId } = stalePrompt;
      setStalePrompt(null);
      seenCandidates.markSeen(options.project, options.episode, poolId);
      try {
        await poolSelect.mutateAsync({
          beatNum: options.beat.beat_number,
          poolId,
          force: true,
        });
        toast.success(t("episode.workbench.sketch.forcedUse"));
        if (nextAction) openSketchTool(nextAction);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("episode.workbench.sketch.forceFailed"),
        );
      }
    };

    const handleRegen = async () => {
      try {
        const response = await regenerate.mutateAsync({
          beatIndices: [options.beat.beat_number],
          modeKey: singleSketchModeKey,
        });
        if (!response.ok) {
          toast.error(
            response.error || t("episode.workbench.sketch.regenFailed"),
          );
          return;
        }
        regenTask.start({ scope: response.scope });
        toast.success(t("episode.workbench.sketch.regenStarted"));
      } catch {
        toast.error(t("episode.workbench.sketch.regenFailed"));
      }
    };

    const handleUpload = async (file: File | null | undefined) => {
      if (!file) return;
      try {
        const response = await uploadSketch.mutateAsync({
          beatNum: options.beat.beat_number,
          file,
        });
        if (!response.ok) {
          toast.error(response.error || t("common.error"));
          return;
        }
        toast.success(t("episode.workbench.sketch.switched"));
      } catch {
        toast.error(t("common.error"));
      }
    };

    const handleConvertDirectorControl = async () => {
      try {
        const response = await directorConvert.mutateAsync();
        if (!response.ok) {
          toast.error(
            response.error ||
              t("episode.workbench.sketch.convertDirectorFailed"),
          );
          return;
        }
        directorTask.start({ scope: response.scope });
        toast.success(
          t("episode.workbench.sketch.convertDirectorStarted"),
        );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("episode.workbench.sketch.convertDirectorFailed"),
        );
      }
    };

    const handleOpenBackgroundDialog = async () => {
      try {
        const refreshed = await backgroundAnchors.refetch();
        if (refreshed.error instanceof Error) {
          toast.error(
            refreshed.error.message ||
              t("episode.workbench.sketch.chooseBackgroundFailed"),
          );
          return;
        }
        const nextData =
          refreshed.data?.ok === true
            ? refreshed.data.data
            : backgroundData;
        if (!nextData?.canChoose) {
          toast.error(
            nextData?.error ||
              t("episode.workbench.sketch.chooseBackgroundFailed"),
          );
          return;
        }
        setBackgroundDialogData(nextData);
        setBackgroundDialogOpen(true);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("episode.workbench.sketch.chooseBackgroundFailed"),
        );
      }
    };

    const handleChooseBackground = async (anchorId: string) => {
      try {
        const response =
          await updateBackgroundAnchor.mutateAsync({ anchorId });
        if (!response.ok) {
          toast.error(
            response.error ||
              t("episode.workbench.sketch.chooseBackgroundFailed"),
          );
          return;
        }
        toast.success(t("episode.workbench.sketch.chooseBackgroundSaved"));
        setBackgroundDialogData(response.data);
        setBackgroundDialogOpen(false);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("episode.workbench.sketch.chooseBackgroundFailed"),
        );
      }
    };

    const handleOpenFreezone = async () => {
      setFreezonePending(true);
      try {
        await dependencies.openSketchFreezone(
          options.project,
          options.episode,
          options.beat.beat_number,
        );
        toast.success(t("episode.workbench.sketch.freezoneOpened"));
      } catch {
        toast.error(t("episode.workbench.sketch.freezoneOpenFailed"));
      } finally {
        setFreezonePending(false);
      }
    };

    const commitDirectorCapture = async (meta: DirectorCaptureMeta) => {
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
      await directorStatus.refetch();
      setStageDialogOpen(false);
    };

    return {
      backgroundAnchors: backgroundAnchorItems,
      backgroundDialogOpen,
      backgroundLoading: backgroundAnchors.isLoading,
      backgroundSaving: updateBackgroundAnchor.isPending,
      beatNumber: options.beat.beat_number,
      candidates: candidateItems,
      castedEntries,
      cropOpen,
      directorControlUrl,
      directorConvertPending: directorConvert.isPending,
      directorTask: {
        started: directorTask.started,
        stopping: directorTask.stopping,
      },
      directorWorldManifest:
        directorWorld.data?.ok === true ? directorWorld.data.data : null,
      directorWorldPending: stageDialogOpen && directorWorld.isLoading,
      downloadEnabled: Boolean(resolvedDownloadUrl),
      editable: Boolean(options.beat.sketch_url || selectedPoolImage),
      episode: options.episode,
      freezonePending,
      hasSketch,
      markedPropEntries,
      poolSelectPending: poolSelect.isPending,
      poseEditorOpen,
      previewUrl: resolved.url ?? null,
      project: options.project,
      propEntries,
      regenConfirmOpen,
      regenPending: regenerate.isPending,
      regenTask: {
        started: regenTask.started,
        stopping: regenTask.stopping,
      },
      sketchActive,
      sketchAspectRatio: ratioToCss(spec.sketchAspect),
      sketchPercent,
      sketchRegenCostDisplay: sketchRegenCost.data?.data.display,
      stageDialogOpen,
      stalePromptOpen: stalePrompt !== null,
      uploadPending: uploadSketch.isPending,
      commitDirectorCapture,
      onBackgroundDialogOpenChange: (open) => {
        setBackgroundDialogOpen(open);
        if (!open) setBackgroundDialogData(null);
      },
      onChooseBackground: (anchorId) => {
        void handleChooseBackground(anchorId);
      },
      onConfirmRegen: () => {
        setRegenConfirmOpen(false);
        void handleRegen();
      },
      onConvertDirectorControl: () => {
        void handleConvertDirectorControl();
      },
      onDownload: () => {
        if (!resolvedDownloadUrl) return;
        dependencies.downloadFile(
          resolvedDownloadUrl,
          `beat_${options.beat.beat_number}_sketch.png`,
        );
      },
      onForceStale: () => {
        void handleStaleForce();
      },
      onNavigateToAsset: navigateToAsset,
      onOpenBackgroundDialog: () => {
        void handleOpenBackgroundDialog();
      },
      onOpenDirectorWorld: () => setStageDialogOpen(true),
      onOpenFreezone: () => {
        void handleOpenFreezone();
      },
      onOpenSketchTool: (action) => {
        void handleOpenSketchTool(action);
      },
      onRegenConfirmOpenChange: setRegenConfirmOpen,
      onRequestRegen: () => setRegenConfirmOpen(true),
      onSelect: (poolId) => {
        void promotePoolSketch(poolId);
      },
      onStalePromptOpenChange: (open) => {
        if (!open) setStalePrompt(null);
      },
      onStopDirectorTask: () => {
        void directorTask.stop();
      },
      onStopRegenTask: () => {
        void regenTask.stop();
      },
      onUpload: (file) => {
        void handleUpload(file);
      },
      setCropOpen,
      setPoseEditorOpen,
      setStageDialogOpen,
    };
  };
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
