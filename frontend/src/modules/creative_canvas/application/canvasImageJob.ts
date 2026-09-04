// Copyright (c) 2026 AI anime
import type { CanvasGenerationTaskRef } from "./completeCanvasMediaGenerationTask";

export interface CanvasImageJobPayload {
  readonly prompt: string;
  readonly model: string;
  /** Registry model id used when restoring a persisted generation. */
  readonly modelId?: string;
  /** Generation mode used when restoring a persisted generation. */
  readonly generationMode?: string;
  readonly size: string;
  readonly aspectRatio: string;
  readonly referenceImages?: string[];
  readonly extraParams?: Record<string, unknown>;
  readonly capabilityId?: string;
  readonly nodeId?: string;
  readonly capabilityParams?: Record<string, unknown>;
  readonly capabilityInputs?: Record<
    string,
    {
      readonly nodeId?: string;
      readonly role?: string;
      readonly sourceUrl?: string;
      readonly assetKind?: string;
    }
  >;
}

export interface CanvasImageJobScope {
  readonly projectId: string;
  readonly canvasId: string;
}

export interface CanvasImageJobGateway {
  submitGenerateImageJob(
    scope: CanvasImageJobScope,
    payload: CanvasImageJobPayload,
  ): Promise<CanvasGenerationTaskRef>;
}
