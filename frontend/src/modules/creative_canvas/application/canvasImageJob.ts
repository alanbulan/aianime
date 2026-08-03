// Copyright (c) 2026 AI anime

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

export interface CanvasImageJobStatus {
  readonly job_id: string;
  readonly status:
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "not_found";
  readonly result?: string | null;
  readonly error?: string | null;
}

export interface CanvasImageJobGateway {
  generateImage(
    scope: CanvasImageJobScope,
    payload: CanvasImageJobPayload,
  ): Promise<string>;
  submitGenerateImageJob(
    scope: CanvasImageJobScope,
    payload: CanvasImageJobPayload,
  ): Promise<string>;
  getGenerateImageJob(jobId: string): Promise<CanvasImageJobStatus>;
}
