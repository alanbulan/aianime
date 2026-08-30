// Copyright (c) 2026 AI anime
import type { RegenerateBeatVideoCommand } from "@/modules/production/domain/video-generation";
import {
  normalizeGrokVideoDraftForModel,
  normalizeHappyHorseDraftForModel,
  normalizeSeedance2DraftForModel,
  sameSeedance2Config,
  serializeGrokVideoConfig,
  serializeHappyHorseConfig,
  type GrokVideoRatio,
  type HappyHorseRatio,
  type ExactVideoResolution,
  type Seedance2ConfigDraft,
  type Seedance2Resolution,
  type VideoResolution,
} from "@/modules/production/domain/video-config";

interface BeatVideoGenerationInputBase {
  model: string;
  modelSelector?: string;
  beatNumber: number;
}

export interface Seedance2BeatVideoGenerationInput
  extends BeatVideoGenerationInputBase {
  kind: "seedance2";
  draft: Seedance2ConfigDraft;
  dirty: boolean;
  isValueStyle: boolean;
  modeOptions?: readonly Seedance2ConfigDraft["mode"][];
  ratioOptions?: readonly Seedance2ConfigDraft["ratio"][];
  resolutionOptions: readonly VideoResolution[];
  sizeOptions?: readonly string[];
  sourceConfig: Seedance2ConfigDraft;
}

export interface HappyHorseBeatVideoGenerationInput
  extends BeatVideoGenerationInputBase {
  kind: "happyhorse";
  draft: Seedance2ConfigDraft;
  ratioOptions: readonly HappyHorseRatio[];
  resolutionOptions: readonly Seedance2Resolution[];
  sourceConfig: Seedance2ConfigDraft;
}

export interface GrokBeatVideoGenerationInput
  extends BeatVideoGenerationInputBase {
  kind: "grok";
  draft: Seedance2ConfigDraft;
  ratioOptions: readonly GrokVideoRatio[];
  resolutionOptions: readonly Seedance2Resolution[];
  sourceConfig: Seedance2ConfigDraft;
}

export interface LegacyBeatVideoGenerationInput
  extends BeatVideoGenerationInputBase {
  kind: "legacy";
  seedance15?: {
    duration: number;
    resolution: Seedance2Resolution;
  };
}

export type BeatVideoGenerationInput =
  | Seedance2BeatVideoGenerationInput
  | HappyHorseBeatVideoGenerationInput
  | GrokBeatVideoGenerationInput
  | LegacyBeatVideoGenerationInput;

export interface PreparedBeatVideoGeneration {
  command: RegenerateBeatVideoCommand;
  draftChanged: boolean;
  normalizedDraft: Seedance2ConfigDraft | null;
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

  if (input.kind === "legacy") {
    return {
      command: input.seedance15
        ? {
            ...baseCommand,
            duration: input.seedance15.duration,
            resolution: input.seedance15.resolution,
          }
        : baseCommand,
      draftChanged: false,
      normalizedDraft: null,
      saveDraftBeforeGeneration: false,
    };
  }

  if (input.kind === "seedance2") {
    const normalizedDraft = normalizeSeedance2DraftForModel(
      input.draft,
      input.resolutionOptions,
      input.model,
      input.isValueStyle,
      input.modeOptions,
      input.ratioOptions,
    );
    const draftChanged = !sameSeedance2Config(normalizedDraft, input.draft);
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
        !sameSeedance2Config(normalizedDraft, input.sourceConfig),
    };
  }

  if (input.kind === "happyhorse") {
    const normalizedDraft = normalizeHappyHorseDraftForModel(
      input.draft,
      input.resolutionOptions,
      input.ratioOptions,
    );
    return {
      command: {
        ...baseCommand,
        duration: normalizedDraft.duration,
        mode: normalizedDraft.mode,
        ratio: normalizedDraft.ratio,
        resolution: normalizedDraft.resolution,
        seedance2ConfigJson: JSON.stringify(
          serializeHappyHorseConfig(normalizedDraft, input.sourceConfig),
        ),
      },
      draftChanged: !sameSeedance2Config(normalizedDraft, input.draft),
      normalizedDraft,
      saveDraftBeforeGeneration: false,
    };
  }

  const normalizedDraft = normalizeGrokVideoDraftForModel(
    input.draft,
    input.resolutionOptions,
    input.ratioOptions,
  );
  return {
    command: {
      ...baseCommand,
      duration: normalizedDraft.duration,
      mode: normalizedDraft.mode,
      ratio: normalizedDraft.ratio,
      resolution: normalizedDraft.resolution,
      seedance2ConfigJson: JSON.stringify(
        serializeGrokVideoConfig(normalizedDraft, input.sourceConfig),
      ),
    },
    draftChanged: !sameSeedance2Config(normalizedDraft, input.draft),
    normalizedDraft,
    saveDraftBeforeGeneration: false,
  };
}

function exactVideoSizeForConfig(
  sizeOptions: readonly string[] | undefined,
  resolution: VideoResolution,
  ratio: Seedance2ConfigDraft["ratio"],
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
      }[resolution as Seedance2Resolution];

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
