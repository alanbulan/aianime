// Copyright (c) 2026 AI anime
import {
  embedStoryboardImageMetadata,
  mergeStoryboardImages,
  saveImageSourceToDirectory,
} from '@/commands/image';
import {
  loadBeatDirectorStageManifest,
  loadSceneDirectorStageManifest,
} from '@/modules/asset_world/public';
import {
  composeCapability,
  generateCanvasRedraw,
  getFreezoneCanvasMetadata,
  publishCanvasCommitRequested,
  resolveCurrentShotMetadataPrompt,
  resolvePromptReferenceRoles,
  submitCanvasImageGeneration,
  type CanvasAssetDragPayload,
} from '@/modules/creative_canvas/public';
import {
  getCanvasBeatDirectorManifest as getCanvasBeatDirectorManifestUseCase,
  type CanvasBeatDirectorManifestGateway,
  type GetCanvasBeatDirectorManifestParams,
} from './application/beatDirectorManifest';
import {
  getCanvasDirectorStagePalette as getCanvasDirectorStagePaletteUseCase,
  type GetCanvasDirectorStagePaletteParams,
} from './application/directorStagePalette';
import {
  hydrateAssetDragPayload as hydrateAssetDragPayloadUseCase,
  type CanvasSceneDirectorManifestGateway,
} from './application/assetDragHydration';
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
import {
  exportStoryboardGrid as exportStoryboardGridUseCase,
  packStoryboardFrames as packStoryboardFramesUseCase,
  type ExportStoryboardGridCommand,
} from './application/storyboardExport';
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
  awaitCanvasSkillRunResult as awaitCanvasSkillRunResultUseCase,
  startCanvasSkillRun as startCanvasSkillRunUseCase,
  type AwaitCanvasSkillRunResultParams,
  type StartCanvasSkillRunParams,
} from './application/skillExecution';
import {
  getCanvasSceneAssetsForBeat as getCanvasSceneAssetsForBeatUseCase,
  type GetCanvasSceneAssetsForBeatParams,
} from './application/sceneAssets';
import {
  uploadLocalImageToBackend as uploadLocalImageToBackendUseCase,
} from './application/uploadToolOutput';
import {
  uploadCanvasAsset as uploadCanvasAssetUseCase,
  type UploadCanvasAssetOptions,
} from './application/uploadCanvasAsset';
import { clearBrowserClipboard } from './infrastructure/browserClipboardGateway';
import { browserGenerationRuntimeGateway } from './infrastructure/browserGenerationRuntimeGateway';
import { browserImageRuntimeGateway } from './infrastructure/browserImageRuntime';
import {
  applyStoryboardTextOverlay,
  getStoryboardReferenceFrameHeight,
} from './infrastructure/browserStoryboardExportRuntime';
import { browserToolImageGateway } from './infrastructure/browserToolImageGateway';
import { captureVideoFrameBlob } from './infrastructure/browserVideoFrameCapture';
import { freezoneAssetGateway } from './infrastructure/freezoneAssetGateway';
import { createFreezoneAiGateway } from './infrastructure/freezoneAiGateway';
import { freezoneDirectorStagePaletteGateway } from './infrastructure/freezoneDirectorStagePaletteGateway';
import { freezoneGenerationTaskGateway } from './infrastructure/freezoneGenerationTaskGateway';
import { freezoneSceneAssetsGateway } from './infrastructure/freezoneSceneAssetsGateway';
import { freezoneSkillExecutionGateway } from './infrastructure/freezoneSkillExecutionGateway';
import { uuidGenerator } from './infrastructure/idGenerator';
import { ensureWebSafeVideo } from './infrastructure/videoTranscode';
import { webImageSplitGateway } from './infrastructure/webImageSplitGateway';
import { zustandCanvasGraphGateway } from './infrastructure/zustandCanvasGraphGateway';
import { showErrorDialog as showErrorDialogInfrastructure } from './infrastructure/globalErrorDialog';

const canvasSceneDirectorManifestGateway: CanvasSceneDirectorManifestGateway = {
  getSceneDirectorStageManifest: loadSceneDirectorStageManifest,
};

const canvasBeatDirectorManifestGateway: CanvasBeatDirectorManifestGateway = {
  getBeatManifest: ({ projectId, episode, beat }) =>
    loadBeatDirectorStageManifest(projectId, episode, beat),
};

const freezoneAiGateway = createFreezoneAiGateway({
  composeCapability,
  getCanvasMetadata: getFreezoneCanvasMetadata,
  resolveShotMetadataPrompt: resolveCurrentShotMetadataPrompt,
  resolvePromptReferenceRoles,
  submitImageGeneration: (projectId, command) =>
    submitCanvasImageGeneration({ projectId, ...command }),
});

export { canvasNodeFactory } from './nodeFactoryComposition';
export { rememberLastVideoModel } from './nodeFactoryComposition';
export { showErrorDialog } from './infrastructure/globalErrorDialog';
export { clearBrowserClipboard };
export {
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
  projectId: string,
  localImageUrl: string,
  filename: string,
) {
  return uploadLocalImageToBackendUseCase(
    freezoneAssetGateway,
    freezoneAssetGateway,
    projectId,
    localImageUrl,
    filename,
  );
}

export function exportStoryboardGrid(
  projectId: string,
  command: ExportStoryboardGridCommand,
) {
  return exportStoryboardGridUseCase(command, {
    timestamp: Date.now,
    now: () => performance.now(),
    getReferenceFrameHeight: getStoryboardReferenceFrameHeight,
    mergeImages: mergeStoryboardImages,
    applyTextOverlay: applyStoryboardTextOverlay,
    persistImage: browserImageRuntimeGateway.persist,
    embedMetadata: embedStoryboardImageMetadata,
    uploadImage: (source, filename) =>
      uploadLocalImageToBackend(projectId, source, filename),
    info: (message, context) => console.info(message, context),
    warn: (message, error) => console.warn(message, error),
  });
}

export function packStoryboardFrames(
  projectId: string,
  frames: ExportStoryboardGridCommand['frames'],
) {
  return packStoryboardFramesUseCase(
    frames,
    projectId,
    { saveImage: saveImageSourceToDirectory },
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

export function uploadAndAutoCommitSelectedBackgroundCandidate(
  projectId: string,
  target: SelectedBackgroundTarget,
  blob: Blob,
  filename: string,
  options: UploadSelectedBackgroundCandidateOptions,
) {
  return uploadAndAutoCommitSelectedBackgroundCandidateUseCase(
    freezoneAssetGateway,
    zustandCanvasGraphGateway,
    publishCanvasCommitRequested,
    projectId,
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
  params: Omit<RegenerateExportImageNodeParams, 'runtimeSessionId'>,
) {
  return regenerateExportImageNodeUseCase(
    {
      ...params,
      runtimeSessionId: CURRENT_RUNTIME_SESSION_ID,
    },
    {
      aiGateway: freezoneAiGateway,
      generateRedraw: generateCanvasRedraw,
    },
  );
}

export function resumeNodeGeneration(params: ResumeNodeGenerationParams) {
  return resumeNodeGenerationUseCase(
    params,
    freezoneGenerationTaskGateway,
  );
}

export function awaitCanvasGenerationTaskCompletion(
  taskKey: string,
  projectId: string,
) {
  return freezoneGenerationTaskGateway.awaitCompletion(taskKey, projectId);
}

export function startCanvasSkillRun(params: StartCanvasSkillRunParams) {
  return startCanvasSkillRunUseCase(params, freezoneSkillExecutionGateway);
}

export function getCanvasSceneAssetsForBeat(
  params: GetCanvasSceneAssetsForBeatParams,
) {
  return getCanvasSceneAssetsForBeatUseCase(
    params,
    freezoneSceneAssetsGateway,
  );
}

export function getCanvasBeatDirectorManifest(
  params: GetCanvasBeatDirectorManifestParams,
) {
  return getCanvasBeatDirectorManifestUseCase(
    params,
    canvasBeatDirectorManifestGateway,
  );
}

export function getCanvasDirectorStagePalette(
  params: GetCanvasDirectorStagePaletteParams,
) {
  return getCanvasDirectorStagePaletteUseCase(
    params,
    freezoneDirectorStagePaletteGateway,
  );
}

export function awaitCanvasSkillRunResult(
  params: AwaitCanvasSkillRunResultParams,
) {
  return awaitCanvasSkillRunResultUseCase(params, {
    gateway: freezoneSkillExecutionGateway,
    sleep: (delayMs) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, delayMs);
      }),
  });
}

export function pollExportImageGeneration(
  projectId: string,
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
      uploadLocalImage: (source, filename) =>
        uploadLocalImageToBackend(projectId, source, filename),
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
