// Copyright (c) 2026 AI anime
export interface VideoReferenceAudioDuration {
  readonly url: string;
  readonly durationMs: number | null;
}

export interface VideoReferenceAudioDurationGateway {
  probeDurationMs(url: string): Promise<number | null>;
}

export interface ValidateVideoReferenceAudioDurationParams {
  readonly references: ReadonlyArray<VideoReferenceAudioDuration>;
  readonly maxDurationMs: number;
}

export interface ValidateVideoReferenceAudioDurationResult {
  readonly totalDurationMs: number;
  readonly exceedsLimit: boolean;
}

export async function validateVideoReferenceAudioDuration(
  params: ValidateVideoReferenceAudioDurationParams,
  gateway: VideoReferenceAudioDurationGateway,
): Promise<ValidateVideoReferenceAudioDurationResult> {
  const durations = await Promise.all(
    params.references.map((reference) =>
      typeof reference.durationMs === "number" && reference.durationMs > 0
        ? Promise.resolve(reference.durationMs)
        : gateway.probeDurationMs(reference.url),
    ),
  );
  const totalDurationMs = durations.reduce<number>(
    (total, durationMs) => total + (durationMs ?? 0),
    0,
  );
  return {
    totalDurationMs,
    exceedsLimit: totalDurationMs > params.maxDurationMs,
  };
}
