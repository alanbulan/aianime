// Copyright (c) 2026 AI anime
import type { RegenerateBeatVideoCommand } from "@/modules/production/domain/video-generation";
import {
  normalizeReferenceVideoDraftForModel,
  normalizeAdvancedVideoDraftForModel,
  sameBeatVideoConfig,
  serializeReferenceVideoConfig,
  type ExactVideoResolution,
  type BeatVideoConfigDraft,
  type VideoResolutionTier,
  type VideoResolution,
} from "@/modules/production/domain/video-config";

interface BeatVideoGenerationInputBase {
  model: string;
  modelSelector?: string;
  beatNumber: number;
}

export interface AdvancedBeatVideoGenerationInput
  extends BeatVideoGenerationInputBase {
  kind: "advanced";
  draft: BeatVideoConfigDraft;
  dirty: boolean;
  supportsSceneOptimize: boolean;
  modeOptions?: readonly BeatVideoConfigDraft["mode"][];
  ratioOptions?: readonly BeatVideoConfigDraft["ratio"][];
  resolutionOptions: readonly VideoResolution[];
  sizeOptions?: readonly string[];
  sourceConfig: BeatVideoConfigDraft;
}

export interface ReferenceBeatVideoGenerationInput
  extends BeatVideoGenerationInputBase {
  kind: "reference";
  draft: BeatVideoConfigDraft;
  ratioOptions: readonly BeatVideoConfigDraft["ratio"][];
  resolutionOptions: readonly VideoResolution[];
  resolutionMaxSeconds?: Readonly<Record<string, number>>;
  sourceConfig: BeatVideoConfigDraft;
}

export interface BasicBeatVideoGenerationInput
  extends BeatVideoGenerationInputBase {
  kind: "basic";
}

export type BeatVideoGenerationInput =
  | AdvancedBeatVideoGenerationInput
  | ReferenceBeatVideoGenerationInput
  | BasicBeatVideoGenerationInput;

export interface PreparedBeatVideoGeneration {
  command: RegenerateBeatVideoCommand;
  draftChanged: boolean;
  normalizedDraft: BeatVideoConfigDraft | null;
  saveDraftBeforeGeneration: boolean;
}

export function prepareBeatVideoGeneration(
  input: BeatVideoGenerationInput,
): PreparedBeatVideoGeneration {
  const baseCommand: RegenerateBeatVideoCommand = {
    beatNum: input.beatNumber,
    model: input.model,
    ...(input.modelSelector ? { modelSelector: input.modelSelector } : {}),
  };

  if (input.kind === "basic") {
    return {
      command: baseCommand,
      draftChanged: false,
      normalizedDraft: null,
      saveDraftBeforeGeneration: false,
    };
  }

  if (input.kind === "advanced") {
    const normalizedDraft = normalizeAdvancedVideoDraftForModel(
      input.draft,
      input.resolutionOptions,
      input.model,
      input.supportsSceneOptimize,
      input.modeOptions,
      input.ratioOptions,
    );
    const draftChanged = !sameBeatVideoConfig(normalizedDraft, input.draft);
    const exactSize = exactVideoSizeForConfig(
      input.sizeOptions,
      normalizedDraft.resolution,
      normalizedDraft.ratio,
    );
    return {
      command: {
        ...baseCommand,
        duration: normalizedDraft.duration,
        mode: normalizedDraft.mode,
        ratio: normalizedDraft.ratio,
        ...(input.resolutionOptions.length
          ? { resolution: exactSize ?? normalizedDraft.resolution }
          : {}),
      },
      draftChanged,
      normalizedDraft,
      saveDraftBeforeGeneration:
        input.dirty ||
        !sameBeatVideoConfig(normalizedDraft, input.sourceConfig),
    };
  }

  const normalizedDraft = normalizeReferenceVideoDraftForModel(
    input.draft,
    input.resolutionOptions,
    input.ratioOptions,
    input.resolutionMaxSeconds,
  );
  return {
    command: {
      ...baseCommand,
      duration: normalizedDraft.duration,
      mode: normalizedDraft.mode,
      ratio: normalizedDraft.ratio,
      resolution: normalizedDraft.resolution,
      videoConfigJson: JSON.stringify(
        serializeReferenceVideoConfig(normalizedDraft, input.sourceConfig),
      ),
    },
    draftChanged: !sameBeatVideoConfig(normalizedDraft, input.draft),
    normalizedDraft,
    saveDraftBeforeGeneration: false,
  };
}

function exactVideoSizeForConfig(
  sizeOptions: readonly string[] | undefined,
  resolution: VideoResolution,
  ratio: BeatVideoConfigDraft["ratio"],
): ExactVideoResolution | undefined {
  const normalizedSizes = (sizeOptions ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is ExactVideoResolution =>
      /^\d{2,5}x\d{2,5}$/.test(value),
    );
  if (!normalizedSizes.length) return undefined;
  if (normalizedSizes.includes(resolution as ExactVideoResolution)) {
    return resolution as ExactVideoResolution;
  }

  const [ratioWidth, ratioHeight] = ratio.split(":").map(Number);
  const targetRatio = ratioWidth / ratioHeight;
  const targetShortEdge = resolution.includes("x")
    ? undefined
    : {
        "480p": 480,
        "720p": 720,
        "768p": 768,
        "1080p": 1080,
      }[resolution as VideoResolutionTier];

  return normalizedSizes.reduce((best, candidate) => {
    const score = exactSizeScore(candidate, targetRatio, targetShortEdge);
    const bestScore = exactSizeScore(best, targetRatio, targetShortEdge);
    return score < bestScore ? candidate : best;
  });
}

function exactSizeScore(
  size: ExactVideoResolution,
  targetRatio: number,
  targetShortEdge: number | undefined,
): number {
  const [width, height] = size.split("x").map(Number);
  const ratioDistance = Math.abs(Math.log(width / height / targetRatio));
  const resolutionDistance = targetShortEdge
    ? Math.abs(Math.min(width, height) - targetShortEdge) / targetShortEdge
    : 0;
  return ratioDistance * 10 + resolutionDistance;
}
