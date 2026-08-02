// Copyright (c) 2026 AI anime
import {
  validateVideoReferenceAudioDuration as validateVideoReferenceAudioDurationUseCase,
  type ValidateVideoReferenceAudioDurationParams,
} from "./application/validateVideoReferenceAudioDuration";
import { browserAudioMetadataGateway } from "./infrastructure/browserAudioMetadata";

export function validateVideoReferenceAudioDuration(
  params: ValidateVideoReferenceAudioDurationParams,
) {
  return validateVideoReferenceAudioDurationUseCase(
    params,
    browserAudioMetadataGateway,
  );
}
