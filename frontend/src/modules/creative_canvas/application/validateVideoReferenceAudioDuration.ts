// Copyright (c) 2026 AI anime
export type VideoReferenceMediaType = "audio" | "video";

export interface VideoReferenceDuration {
  readonly url: string;
  readonly label?: string;
  readonly durationMs: number | null;
}

export interface VideoReferenceDurationGateway {
  probeDurationMs(
    url: string,
    media: VideoReferenceMediaType,
  ): Promise<number | null>;
}

export interface VideoReferenceDurationLimits {
  readonly minMs?: number;
  readonly maxMs?: number;
  readonly totalMinMs?: number;
  readonly totalMaxMs?: number;
}

export type VideoReferenceDurationRejectionKind =
  | "tooShort"
  | "tooLong"
  | "totalTooShort"
  | "totalTooLong";

export interface VideoReferenceDurationRejection {
  readonly kind: VideoReferenceDurationRejectionKind;
  readonly limitMs: number;
  readonly totalDurationMs: number;
  readonly references: ReadonlyArray<{
    readonly label: string;
    readonly durationMs: number;
  }>;
}

export interface ValidateVideoReferenceDurationParams {
  readonly media: VideoReferenceMediaType;
  readonly references: ReadonlyArray<VideoReferenceDuration>;
  readonly limits: VideoReferenceDurationLimits;
}

export interface ValidateVideoReferenceDurationResult {
  readonly totalDurationMs: number;
  readonly rejection: VideoReferenceDurationRejection | null;
}

export async function validateVideoReferenceDuration(
  params: ValidateVideoReferenceDurationParams,
  gateway: VideoReferenceDurationGateway,
): Promise<ValidateVideoReferenceDurationResult> {
  const durations = await Promise.all(
    params.references.map((reference) =>
      validDuration(reference.durationMs)
        ? Promise.resolve(reference.durationMs)
        : gateway.probeDurationMs(reference.url, params.media),
    ),
  );
  const measured = durations.flatMap((durationMs, index) =>
    validDuration(durationMs)
      ? [
          {
            label:
              params.references[index]?.label?.trim() ||
              params.references[index]?.url ||
              `${params.media}-${index + 1}`,
            durationMs,
          },
        ]
      : [],
  );
  const totalDurationMs = measured.reduce(
    (total, reference) => total + reference.durationMs,
    0,
  );
  const tooShort = validLimit(params.limits.minMs)
    ? measured.filter(
        (reference) => reference.durationMs < params.limits.minMs!,
      )
    : [];
  if (tooShort.length > 0) {
    return rejection(
      "tooShort",
      params.limits.minMs!,
      totalDurationMs,
      tooShort,
    );
  }
  const tooLong = validLimit(params.limits.maxMs)
    ? measured.filter(
        (reference) => reference.durationMs > params.limits.maxMs!,
      )
    : [];
  if (tooLong.length > 0) {
    return rejection(
      "tooLong",
      params.limits.maxMs!,
      totalDurationMs,
      tooLong,
    );
  }
  if (
    validLimit(params.limits.totalMinMs) &&
    measured.length === params.references.length &&
    totalDurationMs < params.limits.totalMinMs!
  ) {
    return rejection(
      "totalTooShort",
      params.limits.totalMinMs!,
      totalDurationMs,
      measured,
    );
  }
  if (
    validLimit(params.limits.totalMaxMs) &&
    totalDurationMs > params.limits.totalMaxMs!
  ) {
    return rejection(
      "totalTooLong",
      params.limits.totalMaxMs!,
      totalDurationMs,
      measured,
    );
  }
  return { totalDurationMs, rejection: null };
}

function rejection(
  kind: VideoReferenceDurationRejectionKind,
  limitMs: number,
  totalDurationMs: number,
  references: VideoReferenceDurationRejection["references"],
): ValidateVideoReferenceDurationResult {
  return {
    totalDurationMs,
    rejection: { kind, limitMs, totalDurationMs, references },
  };
}

function validDuration(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validLimit(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export type VideoReferenceAudioDuration = VideoReferenceDuration;

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
  const result = await validateVideoReferenceDuration(
    {
      media: "audio",
      references: params.references,
      limits: { totalMaxMs: params.maxDurationMs },
    },
    {
      probeDurationMs: (url) => gateway.probeDurationMs(url),
    },
  );
  return {
    totalDurationMs: result.totalDurationMs,
    exceedsLimit: result.rejection?.kind === "totalTooLong",
  };
}
