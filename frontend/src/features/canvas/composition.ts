// Copyright (c) 2026 AI anime
import { readUrl } from '@/lib/url-params';
import { embedStoryboardImageMetadata } from '@/commands/image';
import { getSceneDirectorStageManifest } from '@/api/viewerManifests';

import { canvasEventBus } from './application/canvasServices';
import {
  completeVideoGenerationTask as completeVideoGenerationTaskUseCase,
  type CompleteVideoGenerationTaskParams,
} from './application/completeVideoGenerationTask';
import {
  composeVideoClip as composeVideoClipUseCase,
  type ComposeVideoClipParams,
} from './application/composeVideoClip';
import {
  eraseVideoSubtitles as eraseVideoSubtitlesUseCase,
  type EraseVideoSubtitlesParams,
} from './application/eraseVideoSubtitles';
import {
  generateCanvasReversePrompt as generateCanvasReversePromptUseCase,
  type GenerateCanvasReversePromptParams,
} from './application/generateCanvasReversePrompt';
import {
  generateCanvasScene360 as generateCanvasScene360UseCase,
  type GenerateCanvasScene360Params,
} from './application/generateCanvasScene360';
import {
  generateCanvasMultiAngle as generateCanvasMultiAngleUseCase,
  type GenerateCanvasMultiAngleParams,
} from './application/generateCanvasMultiAngle';
import {
  generateCanvasRelight as generateCanvasRelightUseCase,
  type GenerateCanvasRelightParams,
} from './application/generateCanvasRelight';
import {
  generateCanvasStoryScript as generateCanvasStoryScriptUseCase,
  type GenerateCanvasStoryScriptParams,
} from './application/generateCanvasStoryScript';
import type { CanvasGenerationTaskRef } from './application/ports';
import {
  translateCanvasText as translateCanvasTextUseCase,
  type TranslateCanvasTextParams,
} from './application/translateCanvasText';
import {
  submitVideoGeneration as submitVideoGenerationUseCase,
  type SubmitVideoGenerationParams,
} from './application/submitVideoGeneration';
import {
  hydrateAssetDragPayload as hydrateAssetDragPayloadUseCase,
  type CanvasSceneDirectorManifestGateway,
} from './application/assetDragHydration';
import {
  queryCanvasGenerationHistory,
  queryNodeGenerationHistory,
  type GetCanvasGenerationHistoryParams,
  type GetNodeGenerationHistoryParams,
} from './application/generationHistory';
import {
  migratePastedNodeAssets as migratePastedNodeAssetsUseCase,
  type MigratePastedNodeAssetsParams,
} from './application/crossProjectAssets';
import {
  detectAspectRatio as detectAspectRatioUseCase,
  prepareNodeImage as prepareNodeImageUseCase,
  prepareNodeImageFromFile as prepareNodeImageFromFileUseCase,
} from './application/imagePreparation';
import {
  pollExportImageGeneration as pollExportImageGenerationUseCase,
  type PollExportImageGenerationParams,
} from './application/pollExportImageGeneration';
import { CanvasToolProcessor } from './application/toolProcessor';
import {
  regenerateExportImageNode as regenerateExportImageNodeUseCase,
  type RegenerateExportImageNodeParams,
} from './application/regenerateExportNode';
import {
  resumeNodeGeneration as resumeNodeGenerationUseCase,
  type ResumeNodeGenerationParams,
} from './application/resumeGeneration';
import {
  stageSelectedBackgroundOutputForSkill as stageSelectedBackgroundOutputForSkillUseCase,
  uploadAndAutoCommitSelectedBackgroundCandidate as uploadAndAutoCommitSelectedBackgroundCandidateUseCase,
  type SelectedBackgroundTarget,
  type StageSelectedBackgroundOptions,
  type UploadSelectedBackgroundCandidateOptions,
} from './application/selectedBackgroundSlot';
import {
  uploadLocalImageToBackend as uploadLocalImageToBackendUseCase,
} from './application/uploadToolOutput';
import {
  uploadCanvasAsset as uploadCanvasAssetUseCase,
  type UploadCanvasAssetOptions,
} from './application/uploadCanvasAsset';
import {
  validateVideoReferenceAudioDuration as validateVideoReferenceAudioDurationUseCase,
  type ValidateVideoReferenceAudioDurationParams,
} from './application/validateVideoReferenceAudioDuration';
import { browserAudioMetadataGateway } from './infrastructure/browserAudioMetadata';
import { clearBrowserClipboard } from './infrastructure/browserClipboardGateway';
import { browserGenerationRuntimeGateway } from './infrastructure/browserGenerationRuntimeGateway';
import { browserImageRuntimeGateway } from './infrastructure/browserImageRuntime';
import { browserToolImageGateway } from './infrastructure/browserToolImageGateway';
import { captureVideoFrameBlob } from './infrastructure/browserVideoFrameCapture';
import { captureBrowserVideoFrameStrip } from './infrastructure/browserVideoFrameStrip';
import { freezoneAssetGateway } from './infrastructure/freezoneAssetGateway';
import { freezoneAiGateway } from './infrastructure/freezoneAiGateway';
import { freezoneCanvasTextTranslationGateway } from './infrastructure/freezoneCanvasTextTranslationGateway';
import { freezoneGenerationTaskGateway } from './infrastructure/freezoneGenerationTaskGateway';
import { freezoneGenerationHistoryGateway } from './infrastructure/freezoneGenerationHistoryGateway';
import { freezoneMultiAngleGenerationGateway } from './infrastructure/freezoneMultiAngleGenerationGateway';
import { freezoneRedrawTaskGateway } from './infrastructure/freezoneRedrawTaskGateway';
import { freezoneRelightGenerationGateway } from './infrastructure/freezoneRelightGenerationGateway';
import { freezoneReversePromptGenerationGateway } from './infrastructure/freezoneReversePromptGenerationGateway';
import { freezoneScene360GenerationGateway } from './infrastructure/freezoneScene360GenerationGateway';
import { freezoneStoryScriptGenerationGateway } from './infrastructure/freezoneStoryScriptGenerationGateway';
import { freezoneVideoClipComposeGateway } from './infrastructure/freezoneVideoClipComposeGateway';
import { freezoneVideoGenerationSubmissionGateway } from './infrastructure/freezoneVideoGenerationSubmissionGateway';
import { freezoneVideoSubtitleEraseGateway } from './infrastructure/freezoneVideoSubtitleEraseGateway';
import { uuidGenerator } from './infrastructure/idGenerator';
import { ensureWebSafeVideo } from './infrastructure/videoTranscode';
import { webImageSplitGateway } from './infrastructure/webImageSplitGateway';
import { zustandCanvasGraphGateway } from './infrastructure/zustandCanvasGraphGateway';
import { showErrorDialog as showErrorDialogInfrastructure } from './infrastructure/globalErrorDialog';
import type { CanvasAssetDragPayload } from './domain/assetDrag';

const canvasSceneDirectorManifestGateway: CanvasSceneDirectorManifestGateway = {
  getSceneDirectorStageManifest,
};

export { canvasNodeFactory } from './nodeFactoryComposition';
export { showErrorDialog } from './infrastructure/globalErrorDialog';
export { clearBrowserClipboard };
export {
  captureBrowserVideoFrameStrip,
  captureVideoFrameBlob,
  ensureWebSafeVideo,
};

export const canvasToolProcessor = new CanvasToolProcessor(
  webImageSplitGateway,
  browserToolImageGateway,
  uuidGenerator,
);
export const canvasAiGateway = freezoneAiGateway;
export const CURRENT_RUNTIME_SESSION_ID =
  browserGenerationRuntimeGateway.runtimeSessionId;

export function getRuntimeDiagnostics() {
  return browserGenerationRuntimeGateway.getRuntimeDiagnostics();
}

export function getNodeGenerationHistory(
  params: GetNodeGenerationHistoryParams,
) {
  return queryNodeGenerationHistory(
    params,
    freezoneGenerationHistoryGateway,
  );
}

export function getCanvasGenerationHistory(
  params: GetCanvasGenerationHistoryParams,
) {
  return queryCanvasGenerationHistory(
    params,
    freezoneGenerationHistoryGateway,
  );
}

export function prepareNodeImage(
  imageUrl: string,
  maxPreviewDimension?: number,
) {
  return prepareNodeImageUseCase(
    browserImageRuntimeGateway,
    imageUrl,
    maxPreviewDimension,
  );
}

export function prepareNodeImageFromFile(
  file: File,
  maxPreviewDimension?: number,
) {
  return prepareNodeImageFromFileUseCase(
    browserImageRuntimeGateway,
    file,
    maxPreviewDimension,
  );
}

export function detectAspectRatio(imageUrl: string) {
  return detectAspectRatioUseCase(browserImageRuntimeGateway, imageUrl);
}

export function hydrateAssetDragPayload(payload: CanvasAssetDragPayload) {
  return hydrateAssetDragPayloadUseCase(
    canvasSceneDirectorManifestGateway,
    payload,
  );
}

export function migratePastedNodeAssets(
  params: Omit<MigratePastedNodeAssetsParams, 'currentOrigin'>,
) {
  return migratePastedNodeAssetsUseCase(
    freezoneAssetGateway,
    freezoneAssetGateway,
    {
      ...params,
      currentOrigin: window.location.origin,
    },
  );
}

export function uploadLocalImageToBackend(
  localImageUrl: string,
  filename: string,
) {
  return uploadLocalImageToBackendUseCase(
    freezoneAssetGateway,
    freezoneAssetGateway,
    readUrl().project,
    localImageUrl,
    filename,
  );
}

export function uploadCanvasAsset(
  projectId: string,
  file: File | Blob,
  filename: string,
  options?: UploadCanvasAssetOptions,
) {
  return uploadCanvasAssetUseCase(
    { projectId, file, filename, options },
    freezoneAssetGateway,
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

export function uploadAndAutoCommitSelectedBackgroundCandidate(
  target: SelectedBackgroundTarget,
  blob: Blob,
  filename: string,
  options: UploadSelectedBackgroundCandidateOptions,
) {
  return uploadAndAutoCommitSelectedBackgroundCandidateUseCase(
    freezoneAssetGateway,
    zustandCanvasGraphGateway,
    canvasEventBus,
    readUrl().project,
    target,
    blob,
    filename,
    options,
  );
}

export function stageSelectedBackgroundOutputForSkill(
  target: SelectedBackgroundTarget,
  imageUrl: string,
  options: StageSelectedBackgroundOptions,
) {
  return stageSelectedBackgroundOutputForSkillUseCase(
    zustandCanvasGraphGateway,
    target,
    imageUrl,
    options,
  );
}

export function regenerateExportImageNode(
  params: Omit<
    RegenerateExportImageNodeParams,
    'projectId' | 'runtimeSessionId'
  >,
) {
  return regenerateExportImageNodeUseCase(
    {
      ...params,
      projectId: readUrl().project,
      runtimeSessionId: CURRENT_RUNTIME_SESSION_ID,
    },
    freezoneAiGateway,
    freezoneRedrawTaskGateway,
  );
}

export function resumeNodeGeneration(params: ResumeNodeGenerationParams) {
  return resumeNodeGenerationUseCase(
    params,
    freezoneGenerationTaskGateway,
  );
}

export function composeVideoClip(params: ComposeVideoClipParams) {
  return composeVideoClipUseCase(params, {
    composeGateway: freezoneVideoClipComposeGateway,
    taskGateway: freezoneGenerationTaskGateway,
    now: () => Date.now(),
  });
}

export function eraseVideoSubtitles(params: EraseVideoSubtitlesParams) {
  return eraseVideoSubtitlesUseCase(params, {
    eraseGateway: freezoneVideoSubtitleEraseGateway,
    taskGateway: freezoneGenerationTaskGateway,
  });
}

export function generateCanvasStoryScript(
  params: GenerateCanvasStoryScriptParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) {
  return generateCanvasStoryScriptUseCase(params, {
    submissionGateway: freezoneStoryScriptGenerationGateway,
    taskGateway: freezoneGenerationTaskGateway,
    onTaskSubmitted,
  });
}

export function generateCanvasReversePrompt(
  params: GenerateCanvasReversePromptParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) {
  return generateCanvasReversePromptUseCase(params, {
    submissionGateway: freezoneReversePromptGenerationGateway,
    taskGateway: freezoneGenerationTaskGateway,
    onTaskSubmitted,
  });
}

export function generateCanvasScene360(
  params: GenerateCanvasScene360Params,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) {
  return generateCanvasScene360UseCase(params, {
    submissionGateway: freezoneScene360GenerationGateway,
    taskGateway: freezoneGenerationTaskGateway,
    onTaskSubmitted,
  });
}

export function generateCanvasMultiAngle(
  params: GenerateCanvasMultiAngleParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) {
  return generateCanvasMultiAngleUseCase(params, {
    submissionGateway: freezoneMultiAngleGenerationGateway,
    taskGateway: freezoneGenerationTaskGateway,
    onTaskSubmitted,
  });
}

export function generateCanvasRelight(
  params: GenerateCanvasRelightParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) {
  return generateCanvasRelightUseCase(params, {
    submissionGateway: freezoneRelightGenerationGateway,
    taskGateway: freezoneGenerationTaskGateway,
    onTaskSubmitted,
  });
}

export function awaitCanvasGenerationTaskCompletion(
  taskKey: string,
  projectId: string,
) {
  return freezoneGenerationTaskGateway.awaitCompletion(taskKey, projectId);
}

export function translateCanvasText(params: TranslateCanvasTextParams) {
  return translateCanvasTextUseCase(params, {
    translationGateway: freezoneCanvasTextTranslationGateway,
    taskGateway: freezoneGenerationTaskGateway,
  });
}

export function submitVideoGeneration(params: SubmitVideoGenerationParams) {
  return submitVideoGenerationUseCase(params, {
    submissionGateway: freezoneVideoGenerationSubmissionGateway,
  });
}

export function completeVideoGenerationTask(
  params: CompleteVideoGenerationTaskParams,
) {
  return completeVideoGenerationTaskUseCase(params, {
    taskGateway: freezoneGenerationTaskGateway,
  });
}

export function pollExportImageGeneration(
  params: Omit<PollExportImageGenerationParams, 'runtimeSessionId'>,
) {
  return pollExportImageGenerationUseCase(
    {
      ...params,
      runtimeSessionId: CURRENT_RUNTIME_SESSION_ID,
    },
    {
      getGenerateImageJob: (jobId) => freezoneAiGateway.getGenerateImageJob(jobId),
      prepareNodeImage,
      embedStoryboardImageMetadata,
      uploadLocalImage: uploadLocalImageToBackend,
      showErrorDialog: showErrorDialogInfrastructure,
      sleep: (delayMs) =>
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, delayMs);
        }),
      now: () => Date.now(),
      warn: (message, context) => console.warn(message, context),
    },
  );
}
