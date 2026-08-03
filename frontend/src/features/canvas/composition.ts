// Copyright (c) 2026 AI anime
import { useShallow } from 'zustand/react/shallow';

import {
  embedStoryboardImageMetadata,
  mergeStoryboardImages,
  saveImageSourceToDirectory,
} from '@/commands/image';
import {
  loadBeatDirectorStageManifest,
  loadSceneDirectorStageManifest,
  type DirectorStageManifest,
} from '@/modules/asset_world/public';
import {
  applyStoryboardTextOverlay,
  browserGenerationRuntimeGateway,
  browserImageRuntimeGateway,
  canvasEventBus,
  composeCapability,
  createUseCanvasGenerationRecoveryController,
  createUseCanvasViewerSurfaceController,
  detectAspectRatio as detectAspectRatioUseCase,
  exportStoryboardGrid as exportStoryboardGridUseCase,
  freezoneGenerationTaskGateway,
  generateCanvasRedraw,
  getCanvasBeatDirectorManifest as getCanvasBeatDirectorManifestUseCase,
  getCanvasDirectorStagePalette as getCanvasDirectorStagePaletteUseCase,
  getFreezoneCanvasMetadata,
  getCanvasSceneAssetsForBeat as getCanvasSceneAssetsForBeatUseCase,
  getStoryboardReferenceFrameHeight,
  migrateCanvasClipboardAssets as migrateCanvasClipboardAssetsUseCase,
  nodeNeedsGenerationResume,
  prepareNodeImage as prepareNodeImageUseCase,
  prepareNodeImageFromFile as prepareNodeImageFromFileUseCase,
  packStoryboardFrames as packStoryboardFramesUseCase,
  pollExportImageGeneration as pollExportImageGenerationUseCase,
  publishCanvasCommitRequested,
  regenerateExportImageNode as regenerateExportImageNodeUseCase,
  resolveCurrentShotMetadataPrompt,
  resolvePromptReferenceRoles,
  resumeNodeGeneration as resumeNodeGenerationUseCase,
  submitCanvasImageGeneration,
  freezoneDirectorStagePaletteGateway,
  freezoneSceneAssetsGateway,
  type CanvasAssetDragPayload,
  type CanvasBeatDirectorManifestGateway,
  type CanvasClipboardAssetMigrationRequest,
  type ExportStoryboardGridCommand,
  type GetCanvasBeatDirectorManifestParams,
  type GetCanvasDirectorStagePaletteParams,
  type GetCanvasSceneAssetsForBeatParams,
  type PollExportImageGenerationParams,
  type RegenerateExportImageNodeParams,
  type ResumeNodeGenerationParams,
} from '@/modules/creative_canvas/public';
import { useCanvasStore } from './canvasStore';
import {
  hydrateAssetDragPayload as hydrateAssetDragPayloadUseCase,
  type CanvasSceneDirectorManifestGateway,
} from './application/assetDragHydration';
import { CanvasToolProcessor } from './application/toolProcessor';
import { CANVAS_NODE_TYPES } from './domain/canvasNodes';
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
  uploadLocalImageToBackend as uploadLocalImageToBackendUseCase,
} from './application/uploadToolOutput';
import {
  uploadCanvasAsset as uploadCanvasAssetUseCase,
  type UploadCanvasAssetOptions,
} from './application/uploadCanvasAsset';
import { clearBrowserClipboard } from './infrastructure/browserClipboardGateway';
import { browserToolImageGateway } from './infrastructure/browserToolImageGateway';
import { captureVideoFrameBlob } from './infrastructure/browserVideoFrameCapture';
import { freezoneAssetGateway } from './infrastructure/freezoneAssetGateway';
import { createFreezoneAiGateway } from './infrastructure/freezoneAiGateway';
import { freezoneSkillExecutionGateway } from './infrastructure/freezoneSkillExecutionGateway';
import { uuidGenerator } from './infrastructure/idGenerator';
import { ensureWebSafeVideo } from './infrastructure/videoTranscode';
import { webImageSplitGateway } from './infrastructure/webImageSplitGateway';
import { zustandCanvasGraphGateway } from './infrastructure/zustandCanvasGraphGateway';
import { showErrorDialog as showErrorDialogInfrastructure } from './infrastructure/globalErrorDialog';

const canvasSceneDirectorManifestGateway: CanvasSceneDirectorManifestGateway = {
  getSceneDirectorStageManifest: loadSceneDirectorStageManifest,
};

const canvasBeatDirectorManifestGateway: CanvasBeatDirectorManifestGateway<DirectorStageManifest> = {
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

type CanvasStoreState = ReturnType<typeof useCanvasStore.getState>;

function selectPendingExportImageNodeIds(state: CanvasStoreState): string[] {
  return state.nodes
    .filter((node) => {
      if (node.type !== CANVAS_NODE_TYPES.exportImage) return false;
      const data = node.data as Record<string, unknown>;
      return (
        data.isGenerating === true &&
        typeof data.generationJobId === 'string' &&
        data.generationJobId.length > 0
      );
    })
    .map((node) => node.id);
}

function selectPendingGenerationResumeNodeIds(
  state: CanvasStoreState,
): string[] {
  return state.nodes.filter(nodeNeedsGenerationResume).map((node) => node.id);
}

function usePendingExportImageNodeIds(): readonly string[] {
  return useCanvasStore(useShallow(selectPendingExportImageNodeIds));
}

function usePendingGenerationResumeNodeIds(): readonly string[] {
  return useCanvasStore(useShallow(selectPendingGenerationResumeNodeIds));
}

function readCanvasNodeData(nodeId: string): Record<string, unknown> | null {
  return (useCanvasStore
    .getState()
    .nodes
    .find((node) => node.id === nodeId)?.data ?? null) as Record<
    string,
    unknown
  > | null;
}

function pollExportImageNode({
  projectId,
  nodeId,
  errorTitle,
}: {
  projectId: string;
  nodeId: string;
  errorTitle: string;
}): Promise<void> {
  return pollExportImageGeneration(projectId, {
    nodeId,
    errorTitle,
    getNodeData: readCanvasNodeData,
    updateNodeData: useCanvasStore.getState().updateNodeData,
  });
}

function resumePendingGenerationNode({
  projectId,
  nodeId,
}: {
  projectId: string;
  nodeId: string;
}): Promise<void> {
  const state = useCanvasStore.getState();
  const node = state.nodes.find((item) => item.id === nodeId);
  if (!node || !nodeNeedsGenerationResume(node)) {
    return Promise.resolve();
  }
  return resumeNodeGeneration({
    node,
    projectId,
    updateNodeData: state.updateNodeData,
    getNodeData: readCanvasNodeData,
  });
}

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
export const useCanvasViewerSurfaceController =
  createUseCanvasViewerSurfaceController({
    eventPort: canvasEventBus,
    useStore: useCanvasStore,
  });
export const useCanvasGenerationRecoveryController =
  createUseCanvasGenerationRecoveryController({
    usePendingExportImageNodeIds,
    usePendingGenerationResumeNodeIds,
    pollExportImageNode,
    resumePendingGenerationNode,
  });

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

export function migratePastedNodeAssets<TNodeData extends object>(
  params: CanvasClipboardAssetMigrationRequest<TNodeData>,
) {
  return migrateCanvasClipboardAssetsUseCase(
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
