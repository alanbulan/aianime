// Copyright (c) 2026 AI anime
import { useMemo } from "react";

import { parseColorValue, splitIdentityId } from "@/lib/sketch-colors";
import type {
  Beat,
  EpisodePropMenuItem,
  Script,
} from "@/modules/narrative_planning/domain/types";

interface CharactersQuery {
  data?: {
    data: Array<{ name: string }>;
  };
}

interface ScriptQuery {
  data?: { data: Script | null };
}

export interface SketchStudioControllerQueries {
  useScript(project: string, episode: number): ScriptQuery;
}

export interface SketchStudioControllerDependencies {
  useCharacters(project: string): CharactersQuery;
}

export interface SketchStudioControllerOptions {
  beats: readonly Beat[];
  episode: number;
  project: string;
  propMenu: readonly EpisodePropMenuItem[];
}

export interface SketchIdentityColorEntry {
  character: string;
  hex: string;
  identity: string;
  identityId: string;
}

export interface SketchPropColorEntry {
  description: string;
  hex: string;
  propId: string;
}

export interface SketchDetectionSummary {
  beatCount: number;
  identityCount: number;
  propCount: number;
}

export interface SketchStudioController {
  detectionSummary: SketchDetectionSummary;
  hasDetectionSummary: boolean;
  identityColors: readonly SketchIdentityColorEntry[];
  propColors: readonly SketchPropColorEntry[];
}

export function createUseSketchStudioController(
  queries: SketchStudioControllerQueries,
  dependencies: SketchStudioControllerDependencies,
) {
  return function useSketchStudioController({
    beats,
    episode,
    project,
    propMenu,
  }: SketchStudioControllerOptions): SketchStudioController {
    const { data: scriptResponse } = queries.useScript(project, episode);
    const { data: charactersResponse } = dependencies.useCharacters(project);

    const characterNames = useMemo(
      () =>
        new Set(
          (charactersResponse?.data ?? []).map((character) => character.name),
        ),
      [charactersResponse?.data],
    );
    const identityColors = useMemo(
      () =>
        Object.entries(scriptResponse?.data?.sketch_colors ?? {})
          .map(([identityId, value]) => {
            const { hex } = parseColorValue(value);
            const { character, identity } = splitIdentityId(
              identityId,
              characterNames,
            );
            return { character, hex, identity, identityId };
          })
          .filter(
            (entry): entry is SketchIdentityColorEntry => entry.hex !== null,
          )
          .sort((left, right) =>
            left.identityId.localeCompare(right.identityId),
          ),
      [characterNames, scriptResponse?.data?.sketch_colors],
    );
    const propColors = useMemo(
      () =>
        propMenu
          .map((prop) => {
            const { hex } = parseColorValue(prop.marker_color ?? "");
            return {
              description: prop.description ?? prop.visual_prompt ?? "",
              hex,
              propId: prop.prop_id,
            };
          })
          .filter(
            (entry): entry is SketchPropColorEntry => entry.hex !== null,
          )
          .sort((left, right) => left.propId.localeCompare(right.propId)),
      [propMenu],
    );
    const detectionSummary = useMemo(() => {
      const identityIds = new Set<string>();
      const propIds = new Set<string>();
      let beatCount = 0;
      for (const beat of beats) {
        const detectedIdentities = beat.detected_identities ?? [];
        const detectedProps = beat.detected_props ?? [];
        if (detectedIdentities.length > 0 || detectedProps.length > 0) {
          beatCount += 1;
        }
        for (const identityId of detectedIdentities) {
          identityIds.add(identityId);
        }
        for (const propId of detectedProps) {
          propIds.add(propId);
        }
      }
      return {
        beatCount,
        identityCount: identityIds.size,
        propCount: propIds.size,
      };
    }, [beats]);

    return {
      detectionSummary,
      hasDetectionSummary:
        detectionSummary.beatCount > 0 ||
        detectionSummary.identityCount > 0 ||
        detectionSummary.propCount > 0,
      identityColors,
      propColors,
    };
  };
}
