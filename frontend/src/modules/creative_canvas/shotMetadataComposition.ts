// Copyright (c) 2026 AI anime
import {
  mergeShotMetadata,
  parseInlineShotBlock,
  renderShotMetadataForPrompt,
} from "./domain/shotMetadata";
import { zustandShotMetadataStateGateway } from "./infrastructure/zustandShotMetadataStore";

export const shotMetadataState = zustandShotMetadataStateGateway;

export interface CurrentShotMetadataPrompt {
  cleanedPrompt: string;
  suffix: string;
}

export function resolveCurrentShotMetadataPrompt(
  prompt: string,
): CurrentShotMetadataPrompt {
  const { cleaned, override } = parseInlineShotBlock(prompt);
  const merged = mergeShotMetadata(
    shotMetadataState.getShot(),
    override,
  );
  return {
    cleanedPrompt: cleaned,
    suffix: renderShotMetadataForPrompt(merged),
  };
}
