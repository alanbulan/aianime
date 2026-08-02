// Copyright (c) 2026 AI anime
export interface VideoStoryRow {
  readonly shotNumber?: number | string | null;
  readonly startTime?: string | null;
  readonly endTime?: string | null;
  readonly duration?: string | null;
  readonly visualDescription?: string | null;
  readonly narrative?: string | null;
  readonly shotSize?: string | null;
  readonly cameraAngle?: string | null;
  readonly cameraMovement?: string | null;
  readonly focalAndDof?: string | null;
  readonly lighting?: string | null;
  readonly backgroundMusic?: string | null;
  readonly voiceAndSfx?: string | null;
  readonly imagePrompt?: string | null;
  readonly videoMotionPrompt?: string | null;
  readonly keyframeUrl?: string | null;
  readonly raw?: Record<string, unknown>;
}
