// Copyright (c) 2026 AI anime
import type { RegenerateBeatVideoCommand } from "@/modules/production/domain/video-generation";
import {
  normalizeGrokVideoDraftForBackend,
  normalizeHappyHorseDraftForBackend,
  normalizeSeedance2DraftForBackend,
  sameSeedance2Config,
  serializeGrokVideoConfig,
  serializeHappyHorseConfig,
  type GrokVideoRatio,
  type HappyHorseRatio,
  type Seedance2ConfigDraft,
  type Seedance2Resolution,
} from "@/modules/production/domain/video-config";

interface BeatVideoGenerationInputBase {
  backend: string;
  beatNumber: number;
}

export interface Seedance2BeatVideoGenerationInput
  extends BeatVideoGenerationInputBase {
  kind: "seedance2";
  draft: Seedance2ConfigDraft;
  dirty: boolean;
  isValueStyle: boolean;
  resolutionOptions: readonly Seedance2Resolution[];
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
    videoBackend: input.backend,
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
    const normalizedDraft = normalizeSeedance2DraftForBackend(
      input.draft,
      input.resolutionOptions,
      input.backend,
      input.isValueStyle,
    );
    const draftChanged = !sameSeedance2Config(normalizedDraft, input.draft);
    return {
      command: baseCommand,
      draftChanged,
      normalizedDraft,
      saveDraftBeforeGeneration:
        input.dirty ||
        !sameSeedance2Config(normalizedDraft, input.sourceConfig),
    };
  }

  if (input.kind === "happyhorse") {
    const normalizedDraft = normalizeHappyHorseDraftForBackend(
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

  const normalizedDraft = normalizeGrokVideoDraftForBackend(
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
