// Copyright (c) 2026 AI anime
import {
  validateVideoReferenceDuration as validateVideoReferenceDurationUseCase,
  validateVideoReferenceAudioDuration as validateVideoReferenceAudioDurationUseCase,
  type ValidateVideoReferenceDurationParams,
  type ValidateVideoReferenceAudioDurationParams,
} from "./application/validateVideoReferenceAudioDuration";
import {
  browserAudioMetadataGateway,
  browserReferenceDurationGateway,
} from "./infrastructure/browserAudioMetadata";

export function validateVideoReferenceDuration(
  params: ValidateVideoReferenceDurationParams,
) {
  return validateVideoReferenceDurationUseCase(
    params,
    browserReferenceDurationGateway,
  );
}

export function validateVideoReferenceAudioDuration(
  params: ValidateVideoReferenceAudioDurationParams,
) {
  return validateVideoReferenceAudioDurationUseCase(
    params,
    browserAudioMetadataGateway,
  );
}
