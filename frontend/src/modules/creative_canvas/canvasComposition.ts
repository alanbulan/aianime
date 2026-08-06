// Copyright (c) 2026 AI anime
import { applyStoryboardTextOverlay, getStoryboardReferenceFrameHeight } from './infrastructure/browserStoryboardExportRuntime';
import { browserGenerationRuntimeGateway } from './infrastructure/browserGenerationRuntimeGateway';
import { browserImageRuntimeGateway } from './infrastructure/browserImageRuntime';
import { canvasEventBus } from './canvasEventComposition';
import { composeCapability } from './domain/capabilities/registry';
import { createUseCanvasConnectionGestureSurfaceController } from './presentation/useCanvasConnectionGestureSurfaceController';
import { createDisconnectableEdge } from './presentation/DisconnectableEdge';
import { createUseCanvasGenerationRecoveryController } from './presentation/useCanvasGenerationRecoveryController';
import { createUseCanvasProjectSurfaceController } from './presentation/useCanvasProjectSurfaceController';
import { createUseVideoStoryNodeController } from './presentation/useVideoStoryNodeController';
import { createUseCanvasViewerSurfaceController } from './presentation/useCanvasViewerSurfaceController';
import { createUseVideoComposeNodeController } from './presentation/useVideoComposeNodeController';
import { createUseScriptNodeController } from './presentation/useScriptNodeController';
import { createUseImageNodeController } from './presentation/useImageNodeController';
import { createUseTextAnnotationNodeController } from './presentation/useTextAnnotationNodeController';
import { createUseStoryboardNodeController } from './presentation/useStoryboardNodeController';
import { createUseAudioNodeToolbarController } from './presentation/useAudioNodeToolbarController';
import { createUseNodeMainlineToolbarController } from './presentation/useNodeMainlineToolbarController';
import { createUseNodeOutputToolbarController } from './presentation/useNodeOutputToolbarController';
import { createUseNodeManagementToolbarController } from './presentation/useNodeManagementToolbarController';
import { createUseImageNodeToolbarController } from './presentation/useImageNodeToolbarController';
import { createUseCanvasMediaSurfaceController } from './presentation/useCanvasMediaSurfaceController';
import { createUseCanvasViewportSurfaceController } from './presentation/useCanvasViewportSurfaceController';
import { useCanvasGraphEditingSurfaceController } from './presentation/useCanvasGraphEditingSurfaceController';
import { useCanvasNodeCreationSurfaceController } from './presentation/useCanvasNodeCreationSurfaceController';
import { createUseVideoNodeToolbarController } from './presentation/useVideoNodeToolbarController';
import { createUseUploadNodeController } from './presentation/useUploadNodeController';
import {
  createUseThreeDWorldNodeController,
  type ThreeDWorldNodeCanvasNode,
} from './presentation/useThreeDWorldNodeController';
import { createUsePano360ViewerNodeController } from './presentation/usePano360ViewerNodeController';
import { createUseBeatContextNodeController } from './presentation/useBeatContextNodeController';
import { createUseSkillNodeController } from './presentation/useSkillNodeController';
import { createUseStoryboardGenNodeController } from './presentation/useStoryboardGenNodeController';
import { createUseImageEditNodeController } from './presentation/useImageEditNodeController';
import { createUseImageGenNodeController } from './presentation/useImageGenNodeController';
import { createUseVideoNodeController } from './presentation/useVideoNodeController';
import { createNodeContextPromptPaletteButton } from './presentation/NodeContextPromptPaletteButton';
import { createRotateEditorOverlay } from './presentation/RotateEditorOverlay';
import { createUpscaleEditorOverlay } from './presentation/UpscaleEditorOverlay';
import { createScene360Overlay } from './presentation/Scene360Overlay';
import { createUseAudioNodeController } from './presentation/useAudioNodeController';
import { createUseAudioOperationsPanelController } from './presentation/useAudioOperationsPanelController';
import { createUseAudioGeneration } from './presentation/useAudioGeneration';
import { createUseDetachUpstream } from './presentation/useDetachUpstream';
import { createUseImageEditToolbarController } from './presentation/useImageEditToolbarController';
import { createUseImageMatteController } from './presentation/useImageMatteController';
import { createUseIsBoxSelecting } from './presentation/useIsBoxSelecting';
import { createUseUpstreamGraph } from './presentation/useUpstreamGraph';
import { detectAspectRatio as detectAspectRatioUseCase, prepareNodeImage as prepareNodeImageUseCase, prepareNodeImageFromFile as prepareNodeImageFromFileUseCase } from './application/imagePreparation';
import { EXPORT_RESULT_NODE_DEFAULT_WIDTH, EXPORT_RESULT_NODE_LAYOUT_HEIGHT } from './domain/imageNodeLayout';
import { exportStoryboardGrid as exportStoryboardGridUseCase, packStoryboardFrames as packStoryboardFramesUseCase, type ExportStoryboardGridCommand } from './application/storyboardExport';
import { freezoneGenerationTaskGateway } from './infrastructure/freezoneGenerationTaskGateway';
import {
  generateCanvasRedraw,
  generateCanvasReversePrompt,
  generateCanvasImageTo3d,
  generateCanvasImage,
  generateCanvasUpscale,
  generateCanvasScene360,
  submitCanvasImageGeneration,
} from './mediaOperationGenerationComposition';
import {
  completeVideoGenerationTask,
  submitVideoGeneration,
} from './videoGenerationComposition';
import { composeVideoClip } from './videoComposeComposition';
import { eraseVideoSubtitles } from './videoSubtitleEraseComposition';
import { validateVideoReferenceAudioDuration } from './audioReferenceValidationComposition';
import { rememberLastVideoModel } from './canvasNodeFactoryComposition';
import {
  useCanvasCameraOptions,
  useCanvasImageModels,
  useCanvasStyleTemplates,
  useCanvasVideoCameraTemplates,
  useCanvasVideoModels,
} from './generationCatalogComposition';
import { loadCanvasSkillRegistry } from './skillCatalogComposition';
import { openPresetProjectionInMyCanvas } from './presetProjectionComposition';
import {
  createCanvasFromPreset,
  getFreezoneCanvas,
} from './canvasStorageComposition';
import { listFreezoneBeatContext } from './contextQueryComposition';
import { analyzeCanvasVideoStory } from './videoStoryAnalysisComposition';
import { separateCanvasAudioVideo } from './audioSeparationComposition';
import { getCanvasBeatDirectorManifest as getCanvasBeatDirectorManifestUseCase, type CanvasBeatDirectorManifestGateway, type GetCanvasBeatDirectorManifestParams } from './application/beatDirectorManifest';
import { getCanvasDirectorStagePalette as getCanvasDirectorStagePaletteUseCase, type GetCanvasDirectorStagePaletteParams } from './application/directorStagePalette';
import { getFreezoneCanvasMetadata } from './application/canvasMetadataState';
import { getCanvasSceneAssetsForBeat as getCanvasSceneAssetsForBeatUseCase, type GetCanvasSceneAssetsForBeatParams } from './application/sceneAssets';
import { nodeNeedsGenerationResume, resumeNodeGeneration as resumeNodeGenerationUseCase, type ResumeNodeGenerationParams } from './application/resumeGeneration';
import { matteImageInBrowserWorker, preloadBrowserMatteWorker } from './infrastructure/browserMatteWorkerClient';
import { platformCanvasAssetGateway } from './assetTransferComposition';
import { pollExportImageGeneration as pollExportImageGenerationUseCase, type PollExportImageGenerationParams } from './application/pollExportImageGeneration';
import { publishCanvasCommitRequested } from './application/canvasCommitEvents';
import {
  publishCanvasProjectionRemovalRequested,
  publishCanvasProjectionSyncRequested,
} from './application/canvasProjectionCommandEvents';
import { regenerateExportImageNode as regenerateExportImageNodeUseCase, type RegenerateExportImageNodeParams } from './application/regenerateExportNode';
import { resolveCurrentShotMetadataPrompt } from './shotMetadataComposition';
import { resolvePromptReferenceRoles } from './domain/referenceRoles';
import { freezoneDirectorStagePaletteGateway } from './infrastructure/freezoneDirectorStagePaletteGateway';
import { freezoneSceneAssetsGateway } from './infrastructure/freezoneSceneAssetsGateway';
import {
  generateCanvasStoryScript,
  translateCanvasText,
} from './textGenerationComposition';
import { generateCanvasAudio } from './audioGenerationComposition';
import { loadCanvasAudioReferences } from './audioVoiceCatalogComposition';
import {
  directorCaptureBlobToDataUrl,
  readDirectorCaptureImageSize,
} from './infrastructure/browserDirectorCaptureRuntime';
import { extractUpstreamContent } from './application/graphContentResolver';
import { extractUpstreamImages } from './application/graphImageResolver';
import { CANVAS_NODE_TYPES } from './domain/canvasConnection';
import { type CanvasAssetDragPayload } from './domain/assetDrag';
import { NODE_TOOL_TYPES } from './domain/canvasNodeTool';
import { type SelectedBackgroundGraphGateway, stageSelectedBackgroundOutputForSkill as stageSelectedBackgroundOutputForSkillUseCase, uploadAndAutoCommitSelectedBackgroundCandidate as uploadAndAutoCommitSelectedBackgroundCandidateUseCase, type StageSelectedBackgroundOptions, type UploadSelectedBackgroundCandidateOptions } from './application/selectedBackgroundSlot';
import type {
  BeatContextNodeData,
  CanvasEdge,
  CanvasNode,
  CanvasNodeData,
} from './domain/canvasNodeData';
import { awaitCanvasSkillRunResult as awaitCanvasSkillRunResultUseCase, startCanvasSkillRun as startCanvasSkillRunUseCase, type AwaitCanvasSkillRunResultParams, type StartCanvasSkillRunParams } from './application/skillExecution';
import { hydrateAssetDragPayload as hydrateAssetDragPayloadUseCase, type CanvasSceneDirectorManifestGateway } from './application/assetDragHydration';
import { type SelectedBackgroundTarget } from './application/selectedBackgroundSlot';
import { uploadCanvasAsset as uploadCanvasAssetUseCase, type UploadCanvasAssetOptions } from './application/uploadCanvasAsset';
import { uploadLocalImageToBackend as uploadLocalImageToBackendUseCase } from './application/uploadToolOutput';
import { useCanvasStore } from './canvasStoreComposition';
import { useShallow } from 'zustand/react/shallow';
import type { EdgeTypes } from '@xyflow/react';

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


import { useSettingsStore } from '@/stores/settingsStore';




import { captureVideoFrameBlob } from './infrastructure/browserVideoFrameCapture';
import { createFreezoneAiGateway } from './infrastructure/freezoneAiGateway';
import { freezoneSkillExecutionGateway } from './infrastructure/freezoneSkillExecutionGateway';
import { ensureWebSafeVideo } from './infrastructure/videoTranscode';
import { zustandCanvasGraphGateway } from './infrastructure/zustandCanvasGraphGateway';
import { showErrorDialog as showErrorDialogInfrastructure } from './infrastructure/globalErrorDialog';


const canvasSceneDirectorManifestGateway: CanvasSceneDirectorManifestGateway = {
  getSceneDirectorStageManifest: loadSceneDirectorStageManifest,
};
const selectedBackgroundGraphGateway =
  zustandCanvasGraphGateway as unknown as SelectedBackgroundGraphGateway;

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

export { showErrorDialog } from './infrastructure/globalErrorDialog';
export {
  captureVideoFrameBlob,
  ensureWebSafeVideo,
};

export const canvasAiGateway = freezoneAiGateway;
export const CURRENT_RUNTIME_SESSION_ID =
  browserGenerationRuntimeGateway.runtimeSessionId;
export const useCanvasViewerSurfaceController =
  createUseCanvasViewerSurfaceController({
    eventPort: canvasEventBus,
    useStore: useCanvasStore,
  });
const DisconnectableEdge = createDisconnectableEdge({
  useStore: useCanvasStore,
  useRoutingMode: () =>
    useSettingsStore((state) => state.canvasEdgeRoutingMode),
});
export const canvasEdgeTypes: EdgeTypes = {
  disconnectableEdge: DisconnectableEdge,
};
export const useCanvasConnectionGestureSurfaceController =
  createUseCanvasConnectionGestureSurfaceController({
    useStore: useCanvasStore,
  });
export const useIsBoxSelecting = createUseIsBoxSelecting({
  useStore: useCanvasStore,
});
export const useDetachUpstream = createUseDetachUpstream({
  useDeleteEdge: () => useCanvasStore((state) => state.deleteEdge),
  readEdges: () => useCanvasStore.getState().edges,
});
export const {
  useUpstreamNodes,
  useUpstreamContents,
  useUpstreamImages,
} = createUseUpstreamGraph({
  useStore: useCanvasStore,
  projectContent: extractUpstreamContent,
  projectImages: extractUpstreamImages,
});
export const useVideoComposeNodeController = createUseVideoComposeNodeController({
  useStore: useCanvasStore,
  useUpstreamNodes,
});
export const useScriptNodeController = createUseScriptNodeController({
  useStore: useCanvasStore,
  useUpstreamNodes,
  generateCanvasStoryScript,
  translateCanvasText,
});
export const useImageNodeController = createUseImageNodeController({
  useStore: useCanvasStore,
  regenerateExportImageNode,
});
export const useTextAnnotationNodeController =
  createUseTextAnnotationNodeController({
    useStore: useCanvasStore,
    useIsBoxSelecting,
    generateCanvasReversePrompt,
    submitVideoGeneration,
    useCanvasVideoModels,
    awaitCanvasGenerationTaskCompletion,
    translateCanvasText,
  });
export const useStoryboardNodeController = createUseStoryboardNodeController({
  useStore: useCanvasStore,
  useUpstreamNodes,
  exportStoryboardGrid,
  packStoryboardFrames,
  prepareNodeImage,
  uploadLocalImageToBackend,
});
export const useAudioNodeToolbarController = createUseAudioNodeToolbarController({
  useStore: useCanvasStore,
});
export const useNodeMainlineToolbarController =
  createUseNodeMainlineToolbarController({
    useStore: useCanvasStore,
    openPresetProjectionInMyCanvas,
  });
export const useNodeOutputToolbarController = createUseNodeOutputToolbarController({
  useSettingsStore,
});
export const useNodeManagementToolbarController =
  createUseNodeManagementToolbarController({
    useStore: useCanvasStore,
    publishCanvasCommitRequested,
    publishCanvasProjectionRemovalRequested,
    publishCanvasProjectionSyncRequested,
  });
export const useImageNodeToolbarController = createUseImageNodeToolbarController({
  eventPort: canvasEventBus,
});
export const useAudioGeneration = createUseAudioGeneration({
  useStore: useCanvasStore,
  useUpstreamContents,
  generateCanvasAudio,
});
export const useAudioNodeController = createUseAudioNodeController({
  useStore: useCanvasStore,
  useIsBoxSelecting,
  uploadCanvasAsset,
  eventPort: canvasEventBus,
  useAudioGeneration,
  loadCanvasAudioReferences,
});
export const useAudioOperationsPanelController =
  createUseAudioOperationsPanelController({
    useStore: useCanvasStore,
    useAudioGeneration,
    useUpstreamContents,
    useDetachUpstream,
    translateCanvasText,
  });
export const useCanvasMediaSurfaceController =
  createUseCanvasMediaSurfaceController({
    hydrateAssetDragPayload,
  });
export const useCanvasViewportSurfaceController =
  createUseCanvasViewportSurfaceController({
    useCanvasStore,
  });
export { useCanvasGraphEditingSurfaceController };
export { useCanvasNodeCreationSurfaceController };
export const useVideoNodeToolbarController = createUseVideoNodeToolbarController({
  useStore: useCanvasStore,
  eventPort: canvasEventBus,
  analyzeCanvasVideoStory,
  separateCanvasAudioVideo,
});
export const useUploadNodeController = createUseUploadNodeController({
  useStore: useCanvasStore,
  useSettingsStore,
  eventPort: canvasEventBus,
  uploadCanvasAsset,
  prepareNodeImageFromFile,
  uploadLocalImageToBackend,
  getCanvasBeatDirectorManifest,
  directorCaptureBlobToDataUrl,
  readDirectorCaptureImageSize,
});
export const useThreeDWorldNodeController = createUseThreeDWorldNodeController({
  useStore: useCanvasStore,
  useUpstreamNodes,
  useDetachUpstream,
  generateCanvasImageTo3d,
  getCanvasBeatDirectorManifest,
  getCanvasDirectorStagePalette,
  uploadAndAutoCommitSelectedBackgroundCandidate,
  uploadCanvasAsset,
  uploadLocalImageToBackend,
  directorCaptureBlobToDataUrl,
  readDirectorCaptureImageSize,
  readNode: (nodeId) =>
    useCanvasStore
      .getState()
      .nodes.find((node) => node.id === nodeId) as
      | ThreeDWorldNodeCanvasNode
      | undefined,
});
export const usePano360ViewerNodeController =
  createUsePano360ViewerNodeController({
    useStore: useCanvasStore,
    useUpstreamNodes,
    uploadLocalImageToBackend,
    uploadAndAutoCommitSelectedBackgroundCandidate,
  });
export const useBeatContextNodeController = createUseBeatContextNodeController({
  useStore: useCanvasStore,
  getFreezoneCanvas,
  createCanvasFromPreset,
  listFreezoneBeatContext,
  openPresetProjectionInMyCanvas,
  readGraph: () =>
    useCanvasStore.getState() as unknown as {
      nodes: CanvasNode[];
      edges: CanvasEdge[];
    },
  readNodeData: (nodeId) =>
    useCanvasStore
      .getState()
      .nodes.find((node) => node.id === nodeId)
      ?.data as BeatContextNodeData | undefined,
});
export const useSkillNodeController = createUseSkillNodeController({
  useStore: useCanvasStore,
  readGraph: () =>
    useCanvasStore.getState() as unknown as {
      nodes: CanvasNode[];
      edges: CanvasEdge[];
    },
  readNode: (nodeId) =>
    useCanvasStore
      .getState()
      .nodes.find((node) => node.id === nodeId) as CanvasNode | undefined,
  awaitCanvasGenerationTaskCompletion,
  awaitCanvasSkillRunResult,
  getCanvasBeatDirectorManifest,
  getCanvasSceneAssetsForBeat,
  startCanvasSkillRun,
  uploadCanvasAsset,
  stageSelectedBackgroundOutputForSkill,
  loadCanvasSkillRegistry,
  useCanvasImageModels,
});
export const useStoryboardGenNodeController =
  createUseStoryboardGenNodeController({
    useStore: useCanvasStore,
    useSettingsStore,
    canvasAiGateway,
    CURRENT_RUNTIME_SESSION_ID,
    detectAspectRatio,
    getRuntimeDiagnostics,
    showErrorDialog: showErrorDialogInfrastructure,
    uploadLocalImageToBackend,
    useUpstreamImages,
    useCanvasImageModels,
  });
export const useImageEditNodeController = createUseImageEditNodeController({
  useStore: useCanvasStore,
  useSettingsStore,
  readGraph: () =>
    useCanvasStore.getState() as unknown as {
      nodes: CanvasNode[];
      edges: CanvasEdge[];
    },
  canvasAiGateway,
  CURRENT_RUNTIME_SESSION_ID,
  detectAspectRatio,
  getRuntimeDiagnostics,
  showErrorDialog: showErrorDialogInfrastructure,
  useDetachUpstream,
  useUpstreamContents,
  useUpstreamImages,
  useCanvasImageModels,
});
export const useImageGenNodeController = createUseImageGenNodeController({
  useStore: useCanvasStore,
  readGraph: () =>
    useCanvasStore.getState() as unknown as {
      nodes: CanvasNode[];
      edges: CanvasEdge[];
    },
  readNode: (nodeId) =>
    useCanvasStore
      .getState()
      .nodes.find((node) => node.id === nodeId) as CanvasNode | undefined,
  readActiveOverlayNodeId: () =>
    useCanvasStore.getState().activeOverlayNodeId,
  useIsBoxSelecting,
  useUpstreamContents,
  useCanvasImageModels,
  useCanvasCameraOptions,
  useCanvasStyleTemplates,
  uploadCanvasAsset,
  translateCanvasText,
  getCanvasBeatDirectorManifest,
  uploadAndAutoCommitSelectedBackgroundCandidate,
  generateCanvasImage,
});
export const useVideoNodeController = createUseVideoNodeController({
  useStore: useCanvasStore,
  readGraph: () =>
    useCanvasStore.getState() as unknown as {
      nodes: CanvasNode[];
      edges: CanvasEdge[];
    },
  readNode: (nodeId) =>
    useCanvasStore
      .getState()
      .nodes.find((node) => node.id === nodeId) as CanvasNode | undefined,
  readActiveOverlayNodeId: () =>
    useCanvasStore.getState().activeOverlayNodeId,
  useIsBoxSelecting,
  useUpstreamNodes,
  useCanvasVideoModels,
  useCanvasVideoCameraTemplates,
  uploadCanvasAsset,
  translateCanvasText,
  submitVideoGeneration,
  completeVideoGenerationTask,
  composeVideoClip,
  eraseVideoSubtitles,
  validateVideoReferenceAudioDuration,
  captureVideoFrameBlob,
  ensureWebSafeVideo,
  showErrorDialog: showErrorDialogInfrastructure,
  canvasEventBus,
  rememberLastVideoModel,
});
export const NodeContextPromptPaletteButton =
  createNodeContextPromptPaletteButton(useCanvasStore);
export const RotateEditorOverlay = createRotateEditorOverlay({
  useStore: useCanvasStore,
  uploadCanvasAsset,
});
export const UpscaleEditorOverlay = createUpscaleEditorOverlay({
  useStore: useCanvasStore,
  useCanvasImageModels,
  generateCanvasUpscale,
});
export const Scene360Overlay = createScene360Overlay({
  useStore: useCanvasStore,
  useCanvasImageModels,
  generateCanvasScene360,
});
export const useImageMatteController = createUseImageMatteController({
  addExportImageNode: (position, data) =>
    useCanvasStore.getState().addNode(
      CANVAS_NODE_TYPES.exportImage,
      position,
      data as Partial<CanvasNodeData>,
    ),
  addEdge: (sourceNodeId, targetNodeId) => {
    useCanvasStore.getState().addEdge(sourceNodeId, targetNodeId);
  },
  findNodePosition: (nodeId, width, height) =>
    useCanvasStore.getState().findNodePosition(nodeId, width, height),
  selectNode: (nodeId) => useCanvasStore.getState().setSelectedNode(nodeId),
  updateNodeData: (nodeId, patch) =>
    useCanvasStore
      .getState()
      .updateNodeData(nodeId, patch as Partial<CanvasNodeData>),
  uploadAsset: (projectId, blob, filename) =>
    uploadCanvasAsset(projectId, blob, filename),
  fetchBlob: async (sourceUrl) => {
    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`fetch source failed: ${response.status}`);
    }
    return response.blob();
  },
  matteImage: matteImageInBrowserWorker,
  preloadWorker: preloadBrowserMatteWorker,
  schedulePreload: (callback) => {
    const target = window as typeof window & {
      requestIdleCallback?: (idleCallback: () => void) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof target.requestIdleCallback === 'function') {
      const handle = target.requestIdleCallback(callback);
      return () => target.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(callback, 1200);
    return () => window.clearTimeout(timer);
  },
  now: () => Date.now(),
  exportNodeWidth: EXPORT_RESULT_NODE_DEFAULT_WIDTH,
  exportNodeHeight: EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
  reportError: (message, error) => console.error(message, error),
});
export const useImageEditToolbarController =
  createUseImageEditToolbarController({
    useImageMatteController,
    openCropTool: (nodeId) => {
      canvasEventBus.publish('tool-dialog/open', {
        nodeId,
        toolType: NODE_TOOL_TYPES.crop,
      });
    },
  });
export const useCanvasGenerationRecoveryController =
  createUseCanvasGenerationRecoveryController({
    usePendingExportImageNodeIds,
    usePendingGenerationResumeNodeIds,
    pollExportImageNode,
    resumePendingGenerationNode,
  });
export const useCanvasProjectSurfaceController =
  createUseCanvasProjectSurfaceController({
    useGenerationRecovery: useCanvasGenerationRecoveryController,
  });
export const useVideoStoryNodeController = createUseVideoStoryNodeController({
  useStore: useCanvasStore,
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

export function uploadLocalImageToBackend(
  projectId: string,
  localImageUrl: string,
  filename: string,
) {
  return uploadLocalImageToBackendUseCase(
    platformCanvasAssetGateway,
    platformCanvasAssetGateway,
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
    platformCanvasAssetGateway,
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
    platformCanvasAssetGateway,
    selectedBackgroundGraphGateway,
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
    selectedBackgroundGraphGateway,
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
