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
  loadCommercialModelCatalog,
  resolveRequiredCatalogModelCode,
} from '@/modules/model_usage/public';
import {
  composeCapability,
  getFreezoneCanvasMetadata,
  publishCanvasCommitRequested,
  resolveCurrentShotMetadataPrompt,
  resolvePromptReferenceRoles,
  type CanvasAssetDragPayload,
  type CanvasGenerationTaskRef,
} from '@/modules/creative_canvas/public';
import {
  analyzeCanvasVideoStory as analyzeCanvasVideoStoryUseCase,
  type AnalyzeCanvasVideoStoryParams,
} from './application/analyzeCanvasVideoStory';
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
  completeVideoGenerationTask as completeVideoGenerationTaskUseCase,
  type CompleteVideoGenerationTaskParams,
} from './application/completeVideoGenerationTask';
import {
  composeCanvasVideo as composeCanvasVideoUseCase,
  type ComposeCanvasVideoParams,
} from './application/composeCanvasVideo';
import {
  composeVideoClip as composeVideoClipUseCase,
  type ComposeVideoClipParams,
} from './application/composeVideoClip';
import {
  eraseVideoSubtitles as eraseVideoSubtitlesUseCase,
  type EraseVideoSubtitlesParams,
} from './application/eraseVideoSubtitles';
import {
  generateCanvasImage as generateCanvasImageUseCase,
  type GenerateCanvasImageParams,
} from './application/generateCanvasImage';
import {
  generateCanvasRedraw as generateCanvasRedrawUseCase,
  type GenerateCanvasRedrawParams,
} from './application/generateCanvasRedraw';
import {
  generateCanvasStoryScript as generateCanvasStoryScriptUseCase,
  type GenerateCanvasStoryScriptParams,
} from './application/generateCanvasStoryScript';
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
import { captureBrowserVideoFrameStrip } from './infrastructure/browserVideoFrameStrip';
import { freezoneAssetGateway } from './infrastructure/freezoneAssetGateway';
import { createFreezoneAiGateway } from './infrastructure/freezoneAiGateway';
import { freezoneCanvasTextTranslationGateway } from './infrastructure/freezoneCanvasTextTranslationGateway';
import { freezoneDirectorStagePaletteGateway } from './infrastructure/freezoneDirectorStagePaletteGateway';
import { freezoneGenerationTaskGateway } from './infrastructure/freezoneGenerationTaskGateway';
import { freezoneGenerationHistoryGateway } from './infrastructure/freezoneGenerationHistoryGateway';
import { freezoneImageGenerationGateway } from './infrastructure/freezoneImageGenerationGateway';
import { freezoneRedrawTaskGateway } from './infrastructure/freezoneRedrawTaskGateway';
import { freezoneSceneAssetsGateway } from './infrastructure/freezoneSceneAssetsGateway';
import { freezoneSkillExecutionGateway } from './infrastructure/freezoneSkillExecutionGateway';
import { freezoneStoryScriptGenerationGateway } from './infrastructure/freezoneStoryScriptGenerationGateway';
import { freezoneVideoComposeGateway } from './infrastructure/freezoneVideoComposeGateway';
import { freezoneVideoGenerationSubmissionGateway } from './infrastructure/freezoneVideoGenerationSubmissionGateway';
import { freezoneVideoStoryAnalysisGateway } from './infrastructure/freezoneVideoStoryAnalysisGateway';
import { freezoneVideoSubtitleEraseGateway } from './infrastructure/freezoneVideoSubtitleEraseGateway';
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
});

export { canvasNodeFactory } from './nodeFactoryComposition';
export { rememberLastVideoModel } from './nodeFactoryComposition';
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
    composeGateway: freezoneVideoComposeGateway,
    taskGateway: freezoneGenerationTaskGateway,
    now: () => Date.now(),
  });
}

export function composeCanvasVideo(params: ComposeCanvasVideoParams) {
  return composeCanvasVideoUseCase(params, {
    composeGateway: freezoneVideoComposeGateway,
    taskGateway: freezoneGenerationTaskGateway,
  });
}

export function eraseVideoSubtitles(params: EraseVideoSubtitlesParams) {
  return eraseVideoSubtitlesUseCase(params, {
    eraseGateway: freezoneVideoSubtitleEraseGateway,
    taskGateway: freezoneGenerationTaskGateway,
  });
}

export function analyzeCanvasVideoStory(
  params: AnalyzeCanvasVideoStoryParams,
) {
  return analyzeCanvasVideoStoryUseCase(params, {
    submissionGateway: freezoneVideoStoryAnalysisGateway,
    taskGateway: freezoneGenerationTaskGateway,
  });
}

export async function generateCanvasStoryScript(
  params: GenerateCanvasStoryScriptParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) {
  const model = await resolveCanvasTextModel(params.command.model);
  return generateCanvasStoryScriptUseCase(
    { ...params, command: { ...params.command, model } },
    {
    submissionGateway: freezoneStoryScriptGenerationGateway,
    taskGateway: freezoneGenerationTaskGateway,
    onTaskSubmitted,
    },
  );
}

export function generateCanvasImage(
  params: GenerateCanvasImageParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) {
  return generateCanvasImageUseCase(params, {
    submissionGateway: freezoneImageGenerationGateway,
    taskGateway: freezoneGenerationTaskGateway,
    onTaskSubmitted,
  });
}

export function generateCanvasRedraw(
  params: GenerateCanvasRedrawParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) {
  return generateCanvasRedrawUseCase(params, {
    redrawGateway: freezoneRedrawTaskGateway,
    onTaskSubmitted,
  });
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

export async function translateCanvasText(
  params: Omit<TranslateCanvasTextParams, 'model'> & { model?: string },
) {
  const model = await resolveCanvasTextModel(params.model);
  return translateCanvasTextUseCase({ ...params, model }, {
    translationGateway: freezoneCanvasTextTranslationGateway,
    taskGateway: freezoneGenerationTaskGateway,
  });
}

async function resolveCanvasTextModel(requested?: string): Promise<string> {
  const catalog = await loadCommercialModelCatalog('TEXT');
  const normalized = requested?.trim() ?? '';
  if (
    normalized &&
    catalog.items.some(
      (item) =>
        item.operation.trim().toUpperCase() === 'TEXT' &&
        item.code === normalized,
    )
  ) {
    return normalized;
  }
  return resolveRequiredCatalogModelCode(catalog, 'TEXT');
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
