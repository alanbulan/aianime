// Copyright (c) 2026 AI anime
export {
  composeCapability,
  defaultCapabilityParams,
  getCapability,
  listCapabilities,
} from "@/modules/creative_canvas/domain/capabilities/registry";
export { stringifyParamValue } from "@/modules/creative_canvas/domain/capabilities/contracts";
export type {
  CapabilityCategory,
  CapabilityComposeContext,
  CapabilityInputDefinition,
  CapabilityParamDefinition,
  CapabilityParamOption,
  CapabilityParamType,
  ComposedCapabilityJob,
  GenerationCapability,
} from "@/modules/creative_canvas/domain/capabilities/contracts";
export {
  filterCanvasImageModels,
  supportsCanvasImageMode,
} from "@/modules/creative_canvas/domain/imageModelCapability";
export type {
  CanvasImageMode,
  CanvasImageModeCapability,
} from "@/modules/creative_canvas/domain/imageModelCapability";
export {
  CAMERA_MOVEMENT_PRESETS,
  findCameraMovementPreset,
  resolveCameraPresetVideoUrl,
} from "@/modules/creative_canvas/domain/cameraMovementPresets";
export type { CameraMovementPreset } from "@/modules/creative_canvas/domain/cameraMovementPresets";
export type { VideoGenMode } from "@/modules/creative_canvas/domain/videoGenerationMode";
export {
  DEFAULT_VIDEO_DURATION_SEC,
  clampVideoDuration,
  defaultSceneOptimizeForModel,
  isVideoModeSupportedByModel,
  normalizeSceneOptimize,
  normalizeVideoQuality,
  qualityToResolution,
  sceneOptimizeOptionsForModel,
  supportedVideoModesForModel,
  videoDurationBoundsForModel,
  videoModelReferenceDisabledReason,
  videoModelUsesTypedReferenceModes,
  videoQualityOptionsForModel,
} from "@/modules/creative_canvas/domain/videoGenerationModel";
export type {
  Seedance2SceneOptimize,
  VideoDurationBounds,
  VideoGenQuality,
  VideoModelCapabilityDescriptor,
} from "@/modules/creative_canvas/domain/videoGenerationModel";
export {
  classifyVideoReferenceItems,
  videoReferenceCapsForMode,
} from "@/modules/creative_canvas/domain/videoReferenceLimits";
export type {
  VideoReferenceCapEntry,
  VideoReferenceCaps,
  VideoReferenceItem,
} from "@/modules/creative_canvas/domain/videoReferenceLimits";
export type {
  CanvasCameraIdLabel,
  CanvasCameraOptions,
  CanvasCatalogModelOption,
  CanvasImageModel,
  CanvasStyleTemplate,
  CanvasVideoModel,
} from "@/modules/creative_canvas/application/generationCatalog";
export {
  prefetchCanvasCameraOptions,
  prefetchCanvasImageModels,
  prefetchCanvasStyleTemplates,
  prefetchCanvasVideoCameraTemplates,
  prefetchCanvasVideoModels,
  useCanvasCameraOptions,
  useCanvasImageModels,
  useCanvasStyleTemplates,
  useCanvasVideoCameraTemplates,
  useCanvasVideoModels,
} from "@/modules/creative_canvas/generationCatalogComposition";
export type { UseCanvasCameraOptionsResult } from "@/modules/creative_canvas/presentation/useCanvasCameraOptions";
export type { UseCanvasImageModelsResult } from "@/modules/creative_canvas/presentation/useCanvasImageModels";
export type { UseCanvasStyleTemplatesResult } from "@/modules/creative_canvas/presentation/useCanvasStyleTemplates";
export type { UseCanvasVideoCameraTemplatesResult } from "@/modules/creative_canvas/presentation/useCanvasVideoCameraTemplates";
export type { UseCanvasVideoModelsResult } from "@/modules/creative_canvas/presentation/useCanvasVideoModels";
export {
  getFreezoneCanvasMetadata,
  setFreezoneCanvasMetadata,
} from "@/modules/creative_canvas/application/canvasMetadataState";
export { resolvePromptReferenceRoles } from "@/modules/creative_canvas/domain/referenceRoles";
export {
  collectCandidateBindingsForNode,
  collectNodeMainlineContexts,
  extractMainlineContextsFromNode,
  getMainlineEdgeKind,
  hasMainlineContexts,
  isBeatContextNode,
  isMainlineContext,
  isPropagatingMainlineEdge,
  resolveBeatContextForNode,
  validMainlineContexts,
  validateCandidateBindingRoleCandidate,
  validatePropagatingEdgeCandidate,
} from "@/modules/creative_canvas/domain/mainlineContext";
export type {
  BeatContextResolution,
  CandidateBinding,
  CandidateBindingRole,
  CandidateBindingRoleValidationResult,
  MainlineContext,
  MainlineContextEdgeLike,
  MainlineContextKind,
  MainlineContextNodeLike,
  MainlineEdgeKind,
  PropagatingEdgeValidationResult,
} from "@/modules/creative_canvas/domain/mainlineContext";
export {
  isPresetManagedEdge,
  isPresetManagedNode,
  isSystemManagedNodeData,
  mainlineNodeVisualState,
  nodeMainlineFlags,
} from "@/modules/creative_canvas/domain/mainlineNodeFlags";
export type {
  MainlineEdgeLike,
  MainlineNodeFlags,
  MainlineNodeLike,
  MainlineNodeVisualState,
} from "@/modules/creative_canvas/domain/mainlineNodeFlags";
export {
  currentBeatContextToMainlineContext,
  getCurrentBeatContextFromNode,
  parseBeatContextVisualMarkers,
} from "@/modules/creative_canvas/domain/currentBeatContext";
export type {
  BeatContextVisualMarkers,
  CurrentBeatContext,
} from "@/modules/creative_canvas/domain/currentBeatContext";
export { useCanvasProjectContextController } from "@/modules/creative_canvas/presentation/useCanvasProjectContextController";
export type {
  CanvasProjectContextController,
  CanvasProjectContextControllerOptions,
} from "@/modules/creative_canvas/presentation/useCanvasProjectContextController";
export { createUseCanvasGenerationRecoveryController } from "@/modules/creative_canvas/presentation/useCanvasGenerationRecoveryController";
export type {
  CanvasGenerationRecoveryControllerDependencies,
  CanvasGenerationRecoveryControllerOptions,
} from "@/modules/creative_canvas/presentation/useCanvasGenerationRecoveryController";
export {
  canvasIdForFreezoneEntry,
  personalCanvasIdForUsername,
} from "@/modules/creative_canvas/domain/canvasIdentity";
export type {
  CanvasBackupStatus,
  CanvasSaveSource,
  CreateBlankFreezoneCanvasRequest,
  FreezoneCanvasPayload,
  FreezoneCanvasSaveResult,
  FreezoneCanvasScope,
  FreezoneCanvasSummary,
  FreezonePresetCanvasRequest,
  FreezonePresetCanvasResponse,
} from "@/modules/creative_canvas/domain/canvasStorage";
export {
  createBlankFreezoneCanvas,
  createCanvasFromPreset,
  deleteFreezoneCanvas,
  generateClientSaveId,
  getFreezoneCanvas,
  listFreezoneCanvases,
  putFreezoneCanvas,
  putFreezoneCanvasKeepalive,
  useFreezoneCanvases,
} from "@/modules/creative_canvas/canvasStorageComposition";
export {
  CANVAS_MUTATION_SOURCES,
  isCanvasMutationSource,
  isCanvasMutationState,
  isDeleteToEmpty,
  trackEdit,
} from "@/modules/creative_canvas/domain/canvasMutation";
export type {
  CanvasMutationSource,
  CanvasMutationState,
} from "@/modules/creative_canvas/domain/canvasMutation";
export {
  CANVAS_CONFLICT_PREFIX,
  CANVAS_DRAFT_PREFIX,
  CANVAS_HISTORY_PREFIX,
  CANVAS_VIEWPORT_PREFIX,
  FREEZONE_CANVAS_TTL_MS,
} from "@/modules/creative_canvas/domain/canvasStorageRetention";
export {
  installFreezoneCanvasStorageReclaimer,
  scheduleCanvasDraftPruneOnce,
} from "@/modules/creative_canvas/canvasStorageRetentionComposition";
export {
  CANVAS_DRAFT_MAX_BYTES,
  canvasDraftSignature,
  createStoredCanvasDraft,
} from "@/modules/creative_canvas/application/canvasDraft";
export type {
  CanvasDraftHistorySnapshot,
  CanvasDraftHistoryState,
  CanvasDraftInput,
  CanvasDraftStorageGateway,
  StoredCanvasDraft,
} from "@/modules/creative_canvas/application/canvasDraft";
export { canvasDraftStorageGateway } from "@/modules/creative_canvas/canvasDraftComposition";
export {
  HISTORY_PERSIST_MAX_STEPS,
  buildConflictCopyCanvasId,
  buildConflictCopyMetadata,
  canvasConflictStorageKey,
  canvasHistoryStorageKey,
  canvasViewportStorageKey,
  isCanvasSyncViewport,
  trimHistoryForStorage,
} from "@/modules/creative_canvas/application/canvasSyncStorage";
export type {
  CanvasSyncHistorySnapshot,
  CanvasSyncHistoryState,
  CanvasSyncStatus,
  CanvasSyncStorageGateway,
  CanvasSyncViewport,
  ConflictSnapshot,
  PersistedCanvasHistory,
} from "@/modules/creative_canvas/application/canvasSyncStorage";
export { createCanvasSyncHook } from "@/modules/creative_canvas/canvasSyncHookComposition";
export type {
  CanvasSyncHookCompositionOptions,
  CanvasSyncStoreState,
} from "@/modules/creative_canvas/canvasSyncHookComposition";
export { canvasSyncStorageGateway } from "@/modules/creative_canvas/canvasSyncComposition";
export {
  canvasContentSignature,
  decideHydrateDraft,
} from "@/modules/creative_canvas/application/canvasSyncHydration";
export type {
  CanvasHydrationEdge,
  CanvasHydrationNode,
  HydrateDraftDecision,
} from "@/modules/creative_canvas/application/canvasSyncHydration";
export { createCanvasConflictRecovery } from "@/modules/creative_canvas/application/canvasConflictRecovery";
export type {
  CanvasConflictCaptureArgs,
  CanvasConflictCopyResult,
  CanvasConflictRecovery,
  CanvasConflictRecoveryDependencies,
  SaveCanvasConflictCopyArgs,
} from "@/modules/creative_canvas/application/canvasConflictRecovery";
export { canvasConflictRecovery } from "@/modules/creative_canvas/canvasConflictRecoveryComposition";
export {
  nodeDataAfterCommittedSlot,
} from "@/modules/creative_canvas/application/committedNodePatch";
export {
  defaultCharacterFromMetadata,
  inferCanonicalRefreshTarget,
  latestCanvasNodeData,
  markCommitCandidatePushed,
  nodeDataPatchAfterCommittedSourceSlot,
  nodeDataPatchAfterCommittedTarget,
  normalizePushTarget,
  pushTargetsEqual,
  refreshCommittedTargetNodes,
  renderCommitSuccessMessage,
  resolveSubmitNodeData,
  sceneDirectorWorldDataForManifest,
  shouldRefreshCommittedTargetNodes,
} from "@/modules/creative_canvas/application/canvasCommitRules";
export type {
  CanvasCommitNode,
  CanvasCommitStore,
  CanvasCommitStoreState,
} from "@/modules/creative_canvas/application/canvasCommitRules";
export {
  canvasCommitEvents,
  publishCanvasAssetsUpdated,
  publishCanvasCommitRequested,
} from "@/modules/creative_canvas/application/canvasCommitEvents";
export type {
  CanvasCommitEventSource,
  CanvasCommitRequest,
} from "@/modules/creative_canvas/application/canvasCommitEvents";
export {
  saveOpenDirectorWorldScene,
  setDirectorWorldSceneSaveHandler,
} from "@/modules/creative_canvas/application/directorWorldSceneSaveRegistry";
export type { DirectorWorldSceneSaveHandler } from "@/modules/creative_canvas/application/directorWorldSceneSaveRegistry";
export {
  deriveNodeDropInfo,
  modelSourceUrlFromNodeData,
} from "@/modules/creative_canvas/domain/canvasCommitSource";
export type {
  CanvasCommitMediaType,
  CanvasCommitSourceInfo,
  CanvasCommitSourceNode,
} from "@/modules/creative_canvas/domain/canvasCommitSource";
export { isCommitCandidateData } from "@/modules/creative_canvas/domain/canvasCommitEligibility";
export { createCanvasCommitControllerHook } from "@/modules/creative_canvas/canvasCommitControllerComposition";
export type { CanvasCommitControllerCompositionOptions } from "@/modules/creative_canvas/canvasCommitControllerComposition";
export type {
  CanvasCommitController,
  CanvasCommitControllerDependencies,
  CanvasCommitControllerOptions,
  CanvasCommitPrompt,
} from "@/modules/creative_canvas/presentation/useCanvasCommitController";
export {
  buildSceneDirectorWorldCommitPlan,
  hasDirectorWorldSceneState,
  isDirectorWorldSourceSlotTarget,
  nodeDataAfterDirectorWorldSourceSlotCommit,
} from "@/modules/creative_canvas/domain/directorWorldCommit";
export type {
  DirectorWorldSceneSnapshot,
  DirectorWorldSourceSlotTarget,
  SceneDirectorWorldCommitPlan,
  SceneDirectorWorldCommitPlanEntry,
  SceneDirectorWorldTarget,
} from "@/modules/creative_canvas/domain/directorWorldCommit";
export type {
  CommitSceneDirectorWorldParams,
  PersistSceneDirectorWorldSourceParams,
  SceneDirectorWorldCommitGateway,
  SceneDirectorWorldCommitOptions,
} from "@/modules/creative_canvas/application/sceneDirectorWorldCommit";
export {
  commitDirectorRenderFromCanvasSource,
  commitSceneDirectorWorldFromCanvasNode,
} from "@/modules/creative_canvas/directorCommitComposition";
export type {
  DirectorRenderCanvasCommitSource,
  DirectorRenderTarget,
} from "@/modules/creative_canvas/application/directorRenderCommit";
export {
  EMPTY_SHOT_METADATA,
  hasActiveShotMetadata,
  mergeShotMetadata,
  parseInlineShotBlock,
  renderShotMetadataForPrompt,
} from "@/modules/creative_canvas/domain/shotMetadata";
export type { ShotMetadata } from "@/modules/creative_canvas/domain/shotMetadata";
export type {
  FreezoneAssetUploadOptions,
  FreezoneAssetUploadResult,
} from "@/modules/creative_canvas/domain/assetUpload";
export type {
  SceneAssetsForBeat,
  SceneAssetsForBeatResult,
} from "@/modules/creative_canvas/domain/sceneAssets";
export type {
  FreezoneProjectionBuildResponse,
  FreezoneProjectionPresetRequest,
  FreezoneProjectionStatusItem,
  FreezoneProjectionStatusResponse,
} from "@/modules/creative_canvas/domain/canvasProjection";
export {
  clearCanvasProjectionStatuses,
  getCanvasProjectionStatus,
  markCanvasProjectionFresh,
  setCanvasProjectionStatuses,
  subscribeCanvasProjectionStatus,
} from "@/modules/creative_canvas/application/canvasProjectionStatusState";
export {
  applyRemoteFreezoneCanvas,
  consumeQueuedLocalFreezoneProjections,
  flushFreezoneCanvasRuntime,
  queueLocalFreezoneProjection,
  removeLocalFreezoneProjection,
} from "@/modules/creative_canvas/application/canvasRuntimeState";
export type {
  LocalProjectionPayload,
  RemoteCanvasMerge,
} from "@/modules/creative_canvas/application/canvasRuntimeState";
export { useCanvasProjectionStatus } from "@/modules/creative_canvas/presentation/useCanvasProjectionStatus";
export {
  normalizePresetProjectionRequest,
  projectionKeyForPresetRequest,
  projectionLabelForPresetRequest,
  projectionTargetForCanvasPanel,
  shouldProjectPresetIntoPersonalCanvas,
} from "@/modules/creative_canvas/domain/canvasProjectionRequest";
export {
  hasLegacyPresetCanvasMetadata,
  mergeProjectionMetadata,
  projectionMetadataWithRequest,
  removeProjectionMetadata,
  requestFromProjectionMetadata,
} from "@/modules/creative_canvas/domain/canvasProjectionMetadata";
export {
  resolveCurrentShotMetadataPrompt,
  shotMetadataState,
} from "@/modules/creative_canvas/shotMetadataComposition";
export {
  buildProjectionFromPreset,
  getProjectionStatuses,
} from "@/modules/creative_canvas/projectionComposition";
export { openPresetProjectionInMyCanvas } from "@/modules/creative_canvas/presetProjectionComposition";
export {
  assetToPushTarget,
  coercePushTarget,
  completeTarget,
  inferDefaultTarget,
  isCanonicalPushTarget,
  isPlyOrGlbPushTargetKind,
  isScenePushTargetKind,
} from "@/modules/creative_canvas/domain/pushTarget";
export type { FreezoneSource } from "@/modules/creative_canvas/domain/pushTarget";
export type {
  ImpactBeat,
  ImpactResult,
  PushResult,
  PushTarget,
  PushTargetKind,
} from "@/modules/creative_canvas/domain/assetCommit";
export {
  commitFreezoneAsset,
  getFreezoneAssetImpact,
  uploadFreezoneAsset,
} from "@/modules/creative_canvas/assetTransferComposition";
export { SKILL_SCHEMA_VERSION } from "@/modules/creative_canvas/domain/skillContract";
export type {
  CandidateOrigin,
  ResolvedSkillInput,
  SkillCapabilities,
  SkillCardinality,
  SkillDefinition,
  SkillInputAcceptSpec,
  SkillInputRole,
  SkillInputSpec,
  SkillMediaType,
  SkillOutputRole,
  SkillOutputSpec,
  SkillParameterDefinitions,
  SkillParameterSpec,
  SkillProvider,
} from "@/modules/creative_canvas/domain/skillContract";
export {
  isSkillRunDoneStatus,
  isSkillRunFailureStatus,
  isSkillRunTerminalStatus,
  skillRunErrorMessage,
} from "@/modules/creative_canvas/domain/skillExecution";
export type {
  CanvasGraphPatch,
  CanvasGraphPatchOperation,
  SkillErrorEnvelope,
  SkillRunOutput,
  SkillRunRequest,
  SkillRunResponse,
  SkillRunResult,
} from "@/modules/creative_canvas/domain/skillExecution";
export {
  inputAcceptsNode,
  isSkillReadyToSubmit,
  resolveInputsForSkill,
} from "@/modules/creative_canvas/domain/skillInputResolution";
export type {
  SkillInputEdge,
  SkillInputNode,
} from "@/modules/creative_canvas/domain/skillInputResolution";
export { inferSkillConnectionRole } from "@/modules/creative_canvas/domain/inferSkillConnectionRole";
export type {
  InferSkillConnectionRoleArgs,
  SkillConnectionNode,
} from "@/modules/creative_canvas/domain/inferSkillConnectionRole";
export {
  hasCompletedHistoryRecords,
  historyRecordInputImageUrl,
  historyRecordOutputUrl,
  historyRecordPreviewImageUrl,
  historyRecordPrompt,
  historyRecordStrictWorldUrl,
  historyRecordWorldUrl,
  isCompletedHistoryRecord,
} from "@/modules/creative_canvas/domain/generationHistoryRecord";
export type {
  CanvasGenerationHistoryRecord,
  GenerationHistoryRecordProjection,
} from "@/modules/creative_canvas/domain/generationHistoryRecord";
export type {
  CanvasAsset,
  CanvasAssetBuckets,
  CanvasAssetDateGroup,
  CanvasAssetKind,
  CanvasMediaUrlResolver,
} from "@/modules/creative_canvas/domain/canvasAsset";
export {
  groupCanvasAssetsByDate,
} from "@/modules/creative_canvas/domain/canvasAsset";
export {
  createCanvasHistoryAssetPayload,
  resolveCanvasHistoryAssetPosition,
} from "@/modules/creative_canvas/application/canvasHistoryAssetSpawn";
export type {
  CanvasHistoryAssetPlacement,
} from "@/modules/creative_canvas/application/canvasHistoryAssetSpawn";
export {
  recordsToAssetBuckets,
} from "@/modules/creative_canvas/application/generationHistoryAssets";
export type {
  HistoryNodeMeta,
} from "@/modules/creative_canvas/application/generationHistoryAssets";
export {
  NodeGenerationHistory,
} from "@/modules/creative_canvas/presentation/NodeGenerationHistory";
export type {
  NodeGenerationHistoryProps,
} from "@/modules/creative_canvas/presentation/NodeGenerationHistory";
export {
  CanvasHistoryAssetCard,
} from "@/modules/creative_canvas/presentation/CanvasHistoryAssetCard";
export type {
  CanvasHistoryAssetCardProps,
} from "@/modules/creative_canvas/presentation/CanvasHistoryAssetCard";
export {
  useCanvasHistoryAssetController,
} from "@/modules/creative_canvas/presentation/useCanvasHistoryAssetController";
export type {
  CanvasHistoryAssetController,
  CanvasHistoryAssetControllerOptions,
} from "@/modules/creative_canvas/presentation/useCanvasHistoryAssetController";
export {
  CanvasHistoryAssetsModal,
} from "@/modules/creative_canvas/presentation/CanvasHistoryAssetsModal";
export type {
  CanvasHistoryAssetsModalProps,
} from "@/modules/creative_canvas/presentation/CanvasHistoryAssetsModal";
export type {
  CanvasHistoryAssetsModalCommandProps,
  CanvasHistoryAssetsModalController,
  CanvasHistoryAssetsModalControllerOptions,
  CanvasHistoryWorldViewerRequest,
} from "@/modules/creative_canvas/presentation/useCanvasHistoryAssetsModalController";
export {
  createClosedCanvasImageViewer,
  navigateCanvasImageViewer,
  openCanvasImageViewer,
} from "@/modules/creative_canvas/domain/canvasImageViewer";
export type {
  CanvasImageViewerDirection,
  CanvasImageViewerState,
} from "@/modules/creative_canvas/domain/canvasImageViewer";
export { ImageViewerModal } from "@/modules/creative_canvas/presentation/ImageViewerModal";
export type { ImageViewerModalProps } from "@/modules/creative_canvas/presentation/ImageViewerModal";
export { VideoViewerModal } from "@/modules/creative_canvas/presentation/VideoViewerModal";
export type { VideoViewerModalProps } from "@/modules/creative_canvas/presentation/VideoViewerModal";
export { createUseCanvasViewerSurfaceController } from "@/modules/creative_canvas/presentation/useCanvasViewerSurfaceController";
export type {
  CanvasViewerSurfaceController,
  CanvasViewerSurfaceControllerDependencies,
  CanvasViewerSurfaceStore,
  CanvasViewerSurfaceStoreHook,
} from "@/modules/creative_canvas/presentation/useCanvasViewerSurfaceController";
export {
  useCanvasGenerationHistory,
} from "@/modules/creative_canvas/presentation/useCanvasGenerationHistory";
export type {
  CanvasGenerationHistoryContext,
  UseCanvasGenerationHistoryResult,
} from "@/modules/creative_canvas/presentation/useCanvasGenerationHistory";
export {
  useNodeGenerationHistory,
} from "@/modules/creative_canvas/presentation/useNodeGenerationHistory";
export type {
  UseNodeGenerationHistoryOptions,
  UseNodeGenerationHistoryResult,
} from "@/modules/creative_canvas/presentation/useNodeGenerationHistory";
export type {
  FreezoneAssetMediaType,
  FreezoneBeatContextBeat,
  FreezoneBeatContextEpisode,
  FreezoneBeatContextResponse,
  FreezoneProjectAsset,
} from "@/modules/creative_canvas/domain/beatContext";
export {
  listFreezoneBeatContext,
  listFreezoneProjectAssets,
  useFreezoneBeatContext,
  useFreezoneProjectAssets,
} from "@/modules/creative_canvas/contextQueryComposition";
export { useAssetLibraryCatalogController } from "@/modules/creative_canvas/assetLibraryCatalogComposition";
export type { AssetLibraryCatalogControllerOptions } from "@/modules/creative_canvas/assetLibraryCatalogComposition";
export { useAssetLibraryReplacementController } from "@/modules/creative_canvas/presentation/useAssetLibraryReplacementController";
export type {
  AssetLibraryPendingReplacement,
  AssetLibraryReplacementControllerOptions,
  AssetLibraryReplacementHandler,
  AssetLibraryReplacementStorePort,
} from "@/modules/creative_canvas/presentation/useAssetLibraryReplacementController";
export { AssetLibraryPanelView } from "@/modules/creative_canvas/presentation/AssetLibraryPanelView";
export type { AssetLibraryPanelViewProps } from "@/modules/creative_canvas/presentation/AssetLibraryPanelView";
export { AssetLibraryPanel } from "@/modules/creative_canvas/presentation/AssetLibraryPanel";
export type { AssetLibraryPanelProps } from "@/modules/creative_canvas/presentation/AssetLibraryPanel";
export { useAssetDropStore } from "@/modules/creative_canvas/presentation/assetDropStore";
export type {
  ActiveNodeDrag,
  AssetDropState,
  PendingAssetReplace,
} from "@/modules/creative_canvas/presentation/assetDropStore";
export { createUseFreezoneProjectPageController } from "@/modules/creative_canvas/presentation/useFreezoneProjectPageController";
export type {
  FreezoneProjectPageController,
  FreezoneProjectPageControllerDependencies,
  FreezoneProjectPageError,
} from "@/modules/creative_canvas/presentation/useFreezoneProjectPageController";
export { FreezoneProjectPageView } from "@/modules/creative_canvas/presentation/FreezoneProjectPageView";
export type { FreezoneProjectPageViewProps } from "@/modules/creative_canvas/presentation/FreezoneProjectPageView";
export { createUseFreezoneCanvasEntryLifecycle } from "@/modules/creative_canvas/presentation/useFreezoneCanvasEntryLifecycle";
export type {
  FreezoneCanvasEntryLifecycleDependencies,
  FreezoneCanvasEntryLifecycleOptions,
  FreezoneCanvasEntryState,
} from "@/modules/creative_canvas/presentation/useFreezoneCanvasEntryLifecycle";
export { createUseFreezoneShellController } from "@/modules/creative_canvas/presentation/useFreezoneShellController";
export type {
  FreezoneProjectionStatusLifecycleOptions,
  FreezoneShellController,
  FreezoneShellControllerDependencies,
  FreezoneShellControllerOptions,
  FreezoneShellSyncPort,
} from "@/modules/creative_canvas/presentation/useFreezoneShellController";
export { FreezoneShellView } from "@/modules/creative_canvas/presentation/FreezoneShellView";
export type {
  FreezoneShellCanvasRenderProps,
  FreezoneShellMaskEditorRenderProps,
  FreezoneShellViewProps,
} from "@/modules/creative_canvas/presentation/FreezoneShellView";
export { MaskEditor } from "@/modules/creative_canvas/presentation/MaskEditor";
export type {
  MaskEditorProps,
} from "@/modules/creative_canvas/presentation/MaskEditor";
export type {
  MaskEditorControllerDependencies,
} from "@/modules/creative_canvas/presentation/useMaskEditorController";
export {
  useCanvasProjectionStatusLifecycle,
} from "@/modules/creative_canvas/canvasProjectionStatusLifecycleComposition";
export type {
  CanvasProjectionStatusLifecycleOptions,
} from "@/modules/creative_canvas/canvasProjectionStatusLifecycleComposition";
export { useCanvasProjectionCommandController } from "@/modules/creative_canvas/canvasProjectionCommandComposition";
export {
  publishCanvasProjectionRemovalRequested,
  publishCanvasProjectionSyncRequested,
} from "@/modules/creative_canvas/application/canvasProjectionCommandEvents";
export type {
  CanvasProjectionCommandControllerOptions,
  CanvasProjectionCommandMessages,
} from "@/modules/creative_canvas/presentation/useCanvasProjectionCommandController";
export type {
  CanvasProjectionCommandEventPayload,
  CanvasProjectionCommandEventSource,
  CanvasProjectionCommandEventType,
} from "@/modules/creative_canvas/application/canvasProjectionCommandEvents";
export { presetRequestFromMetadata } from "@/modules/creative_canvas/application/canvasPreset";
export {
  assetDropMediaType,
  directorControlBundleFromAssetSource,
  finalizeDirectorWorldAssets,
  isThreeDAsset,
  SCENE_DIRECTOR_WORLD_ROLE,
} from "@/modules/creative_canvas/domain/assetLibraryModel";
export type {
  AssetLibraryDropMediaType,
  AssetMediaType,
  AssetTab,
  CanvasKind,
  LibraryAsset,
  PresetReference,
} from "@/modules/creative_canvas/domain/assetLibraryModel";
export type {
  CanvasAssetLibraryItem,
  CanvasAssetLibraryMedia,
  CanvasAssetLibrarySelection,
  CanvasAssetLibrarySource,
} from "@/modules/creative_canvas/domain/assetLibrary";
export {
  AssetLibraryModal,
} from "@/modules/creative_canvas/presentation/AssetLibraryModal";
export type {
  AssetLibraryModalProps,
} from "@/modules/creative_canvas/presentation/AssetLibraryModal";
export {
  CANVAS_ASSET_DRAG_MIME,
  parseCanvasAssetDragPayload,
} from "@/modules/creative_canvas/domain/assetDrag";
export type {
  CanvasAssetDragKind,
  CanvasAssetDragPayload,
} from "@/modules/creative_canvas/domain/assetDrag";
export { spawnCanvasAssetNode } from "@/modules/creative_canvas/application/canvasAssetNodeSpawning";
export type {
  CanvasAssetNodeData,
  CanvasAssetNodeSpawnPort,
  CanvasAssetNodeType,
} from "@/modules/creative_canvas/application/canvasAssetNodeSpawning";
export { readCanvasAssetDragPayload } from "@/modules/creative_canvas/presentation/canvasAssetDragTransfer";
export {
  isVideoFile,
  VIDEO_FILE_ACCEPT,
} from "@/modules/creative_canvas/domain/videoFileTypes";
export {
  isCanvasPaneTarget,
  isSpacePanKey,
  isTypingTarget,
  PAN_ACTIVATION_KEY_CODE,
} from "@/modules/creative_canvas/presentation/canvasInteractionTargets";
export { useCanvasSpacePan } from "@/modules/creative_canvas/presentation/useCanvasSpacePan";
export type {
  CanvasSpacePanController,
  CanvasSpacePanOptions,
} from "@/modules/creative_canvas/presentation/useCanvasSpacePan";
export {
  collectCanvasNodeIdsInRect,
  resolveActiveToolDialog,
  resolveSelectedNodeId,
} from "@/modules/creative_canvas/domain/canvasSelection";
export type {
  CanvasSelectionDialogTarget,
  CanvasSelectionNode,
  CanvasSelectionNodeIntersectsRect,
  CanvasSelectionRect,
} from "@/modules/creative_canvas/domain/canvasSelection";
export { useCanvasMarqueeSelection } from "@/modules/creative_canvas/presentation/useCanvasMarqueeSelection";
export type {
  CanvasMarqueeCoordinatePort,
  CanvasMarqueeFlowRect,
  CanvasMarqueeNode,
  CanvasMarqueePoint,
  CanvasMarqueeSelectionController,
  CanvasMarqueeSelectionOptions,
  CanvasMarqueeSelectionRect,
  CanvasNodeSelectionChange,
} from "@/modules/creative_canvas/presentation/useCanvasMarqueeSelection";
export { useCanvasSelectionSync } from "@/modules/creative_canvas/presentation/useCanvasSelectionSync";
export type {
  CanvasSelectionSyncNode,
  CanvasSelectionSyncOptions,
  CanvasSelectionSyncResult,
} from "@/modules/creative_canvas/presentation/useCanvasSelectionSync";
export { useCanvasSelectionSurfaceController } from "@/modules/creative_canvas/presentation/useCanvasSelectionSurfaceController";
export type {
  CanvasNativeSelectionStorePort,
  CanvasSelectionGraph,
  CanvasSelectionSurfaceController,
  CanvasSelectionSurfaceControllerOptions,
  CanvasSelectionSurfaceEdge,
  CanvasSelectionSurfaceNode,
} from "@/modules/creative_canvas/presentation/useCanvasSelectionSurfaceController";
export { useCanvasSelectionCommandController } from "@/modules/creative_canvas/presentation/useCanvasSelectionCommandController";
export type {
  CanvasSelectionCommandController,
  CanvasSelectionCommandControllerOptions,
} from "@/modules/creative_canvas/presentation/useCanvasSelectionCommandController";
export { useCanvasMediaTransferController } from "@/modules/creative_canvas/presentation/useCanvasMediaTransferController";
export type {
  CanvasMediaTransferController,
  CanvasMediaTransferControllerOptions,
} from "@/modules/creative_canvas/presentation/useCanvasMediaTransferController";
export type { CanvasMediaPasteEventPort } from "@/modules/creative_canvas/presentation/useCanvasMediaPaste";
export { isAudioFile } from "@/modules/creative_canvas/domain/audioFileTypes";
export type { AudioVoiceRef } from "@/modules/creative_canvas/domain/audioVoice";
export { resolveAudioReferenceDisplayName } from "@/modules/creative_canvas/application/audioReferenceDisplayName";
export type { AudioReferenceDisplaySource } from "@/modules/creative_canvas/application/audioReferenceDisplayName";
export {
  audioVoiceRefKey,
  describeAudioVoiceRef,
} from "@/modules/creative_canvas/application/audioVoiceCatalog";
export type {
  CanvasAudioReference,
  CanvasAudioVoiceCatalogGateway,
} from "@/modules/creative_canvas/application/audioVoiceCatalog";
export {
  projectAudioNodeToolbar,
  resolveAudioNodeDownloadFilename,
} from "@/modules/creative_canvas/application/audioNodeToolbarModel";
export type {
  AudioNodeToolbarFormat,
  AudioNodeToolbarProjection,
  AudioNodeToolbarSource,
} from "@/modules/creative_canvas/application/audioNodeToolbarModel";
export {
  DEFAULT_MUSIC_LENGTH_MS,
  MUSIC_LENGTH_PRESETS,
  filterAudioUpstreamTextContents,
  isAudioSubmitDisabled,
  musicBillingSecondsFromMs,
  resolveAudioMusicSettings,
  resolveAudioVoiceSettings,
} from "@/modules/creative_canvas/application/audioOperationsPanelModel";
export type {
  AudioMusicSettings,
  AudioOperationsNodeSource,
  AudioUpstreamTextSource,
  AudioVoiceSettings,
} from "@/modules/creative_canvas/application/audioOperationsPanelModel";
export {
  MAX_VOICE_CLONE_FILE_BYTES,
  MAX_VOICE_CLONE_FILE_MB,
  VOICE_CLONE_AUDIO_EXTENSIONS,
  VOICE_CLONE_AUDIO_MIME_TYPES,
  VOICE_CLONE_FILE_ACCEPT,
  VOICE_SELECTION_PAGE_SIZE,
  customVoiceReferences,
  filterCustomVoiceReferences,
  filterLibraryVoiceReferences,
  isCurrentVoiceReference,
  paginateVoiceReferences,
  projectCustomVoicePick,
  projectCustomVoiceRows,
  projectLibraryVoicePick,
  projectLibraryVoiceRows,
  resolveVoicePaginationJump,
  sanitizeVoicePaginationInput,
  voiceCloneFileStem,
  voiceCloneFileValidationError,
  voiceCloneUploadError,
  voicePaginationWindow,
} from "@/modules/creative_canvas/application/voiceSelectionModel";
export type {
  VoiceCloneFileInfo,
  VoicePickResult,
  VoiceSelectionPage,
  VoiceSelectionRow,
  VoiceSelectionTab,
} from "@/modules/creative_canvas/application/voiceSelectionModel";
export { separateCanvasAudioVideo } from "@/modules/creative_canvas/audioSeparationComposition";
export type {
  CanvasAudioSeparationCommand,
  CanvasAudioSeparationTaskRef,
  SeparateCanvasAudioVideoParams,
  SeparateCanvasAudioVideoResult,
} from "@/modules/creative_canvas/application/separateCanvasAudioVideo";
export { validateVideoReferenceAudioDuration } from "@/modules/creative_canvas/audioReferenceValidationComposition";
export type {
  ValidateVideoReferenceAudioDurationParams,
  ValidateVideoReferenceAudioDurationResult,
  VideoReferenceAudioDuration,
} from "@/modules/creative_canvas/application/validateVideoReferenceAudioDuration";
export {
  buildCanvasAudioPrompt,
  deriveAudioText,
} from "@/modules/creative_canvas/application/generateCanvasAudio";
export type {
  CanvasAudioGenerationTaskRef,
  CanvasAudioPromptSource,
  CanvasAudioTextSegment,
  GenerateCanvasAudioParams,
  GenerateCanvasAudioResult,
} from "@/modules/creative_canvas/application/generateCanvasAudio";
export { generateCanvasAudio } from "@/modules/creative_canvas/audioGenerationComposition";
export {
  generateCanvasGridAction,
  generateCanvasImage,
  generateCanvasImageTo3d,
  generateCanvasMultiAngle,
  generateCanvasOutpaint,
  generateCanvasRedraw,
  generateCanvasRelight,
  generateCanvasReversePrompt,
  generateCanvasScene360,
  generateCanvasUpscale,
  generateCanvasVideoUpscale,
  prepareCanvasImageSource,
  prepareCanvasImageSources,
  submitCanvasImageGeneration,
} from "@/modules/creative_canvas/mediaOperationGenerationComposition";
export {
  resolveGridActionTemplateMode,
} from "@/modules/creative_canvas/domain/gridAction";
export type {
  CanvasTemplateEditMode,
  GridActionKey,
  GridActionRequest,
} from "@/modules/creative_canvas/domain/gridAction";
export {
  completeCanvasMediaGenerationTask,
  readEmbeddedCanvasGenerationOutputUrl,
} from "@/modules/creative_canvas/application/completeCanvasMediaGenerationTask";
export type {
  CanvasGenerationTaskCompletion,
  CanvasGenerationTaskRef,
  CanvasTaskResultGateway,
  CompleteCanvasMediaGenerationTaskDependencies,
  CompleteCanvasMediaGenerationTaskParams,
} from "@/modules/creative_canvas/application/completeCanvasMediaGenerationTask";
export type {
  CanvasGridActionGenerationCommand,
  CanvasGridActionGenerationGateway,
  GenerateCanvasGridActionDependencies,
  GenerateCanvasGridActionParams,
  GenerateCanvasGridActionResult,
} from "@/modules/creative_canvas/application/generateCanvasGridAction";
export type {
  CanvasImageGenerationCamera,
  CanvasImageGenerationCommand,
  CanvasImageGenerationStyle,
  CanvasImageGenerationSubmissionGateway,
  CanvasImageGenerationTaskRef,
  CanvasImageReferencePreparationGateway,
  GenerateCanvasImageDependencies,
  GenerateCanvasImageParams,
  GenerateCanvasImageResult,
  SubmitCanvasImageGenerationDependencies,
} from "@/modules/creative_canvas/application/generateCanvasImage";
export {
  generateCanvasStoryScript,
  resolveCanvasTextModel,
  translateCanvasText,
} from "@/modules/creative_canvas/textGenerationComposition";
export {
  STORY_SCRIPT_SOURCE_REQUIRED_MESSAGE,
  buildCanvasStoryScriptCommand,
  isCanvasStoryScriptResult,
} from "@/modules/creative_canvas/application/generateCanvasStoryScript";
export type {
  BuildCanvasStoryScriptCommandParams,
  CanvasStoryScriptCharacterReference,
  CanvasStoryScriptCommand,
  CanvasStoryScriptReference,
  CanvasStoryScriptReferenceKind,
  CanvasStoryScriptResult,
  CanvasStoryScriptRow,
  CanvasStoryScriptSubmissionGateway,
  CanvasStoryScriptTaskGateway,
  GenerateCanvasStoryScriptDependencies,
  GenerateCanvasStoryScriptParams,
  GenerateCanvasStoryScriptResult,
} from "@/modules/creative_canvas/application/generateCanvasStoryScript";
export type {
  CanvasTextTranslationGateway,
  CanvasTextTranslationNodeType,
  CanvasTextTranslationSubmission,
  TranslateCanvasTextDependencies,
  TranslateCanvasTextParams,
  TranslateCanvasTextResult,
} from "@/modules/creative_canvas/application/translateCanvasText";
export { analyzeCanvasVideoStory } from "@/modules/creative_canvas/videoStoryAnalysisComposition";
export type {
  AnalyzeCanvasVideoStoryDependencies,
  AnalyzeCanvasVideoStoryParams,
  CanvasVideoStoryAnalysisCommand,
  CanvasVideoStoryAnalysisSubmission,
  CanvasVideoStoryAnalysisSubmissionGateway,
} from "@/modules/creative_canvas/application/analyzeCanvasVideoStory";
export type { VideoStoryRow } from "@/modules/creative_canvas/domain/videoStory";
export {
  completeVideoGenerationTask,
  submitVideoGeneration,
} from "@/modules/creative_canvas/videoGenerationComposition";
export { resolveGenerationOutputUrl } from "@/modules/creative_canvas/application/generationOutputUrl";
export type { GenerationOutputMedia } from "@/modules/creative_canvas/application/generationOutputUrl";
export type {
  CompleteVideoGenerationTaskDependencies,
  CompleteVideoGenerationTaskParams,
  CompleteVideoGenerationTaskResult,
} from "@/modules/creative_canvas/application/completeVideoGenerationTask";
export type {
  SubmitVideoGenerationDependencies,
  SubmitVideoGenerationParams,
  VideoGenerationAspectRatio,
  VideoGenerationReference,
  VideoGenerationResolution,
  VideoGenerationSubmission,
  VideoGenerationSubmissionGateway,
  VideoGenerationTaskRef,
} from "@/modules/creative_canvas/application/submitVideoGeneration";
export {
  composeCanvasVideo,
  composeVideoClip,
} from "@/modules/creative_canvas/videoComposeComposition";
export type {
  CanvasVideoComposeItem,
  CanvasVideoComposeRequest,
  CanvasVideoComposeResolution,
  CanvasVideoComposeTrack,
  CanvasVideoComposeTrackKind,
} from "@/modules/creative_canvas/domain/videoCompose";
export {
  VIDEO_CLIP_MIN_DURATION_MS,
  constrainVideoClipEndMs,
  constrainVideoClipStartMs,
  resolveVideoClipRange,
} from "@/modules/creative_canvas/domain/videoClipRange";
export type { ResolvedVideoClipRange } from "@/modules/creative_canvas/domain/videoClipRange";
export {
  AUDIO_TRACK_ID,
  FALLBACK_CLIP_MS,
  VIDEO_TRACK_ID,
  activeClipAt,
  buildComposePayload,
  clipLengthMs,
  compactVideoTracks,
  hasExportableClips,
  hasOverlappingVideoClips,
  layoutTrack,
  neighborBoundsMs,
  overlappingVideoClipIds,
  packTrackClips,
  reorderIndexForDrag,
  sourceSpanMs,
  timelineDurationMs,
} from "@/modules/creative_canvas/domain/videoComposeTimeline";
export type {
  ActiveClip,
  BuildComposeOptions,
  ComposeClip,
  ComposeCover,
  ComposeTimelineState,
  ComposeTrack,
  ComposeTrackKind,
  LaidClip,
} from "@/modules/creative_canvas/domain/videoComposeTimeline";
export {
  MIN_VIDEO_COMPOSE_VIDEOS,
  projectVideoComposeInputs,
} from "@/modules/creative_canvas/domain/videoComposeInputs";
export type {
  VideoComposeInputMedia,
  VideoComposeInputProjection,
  VideoComposeSourceMedia,
} from "@/modules/creative_canvas/domain/videoComposeInputs";
export {
  VIDEO_COMPOSE_MAX_SPEED,
  VIDEO_COMPOSE_MIN_SPEED,
  applyVideoComposeTimelineEdit,
  resolveVideoComposeClipSelection,
} from "@/modules/creative_canvas/domain/videoComposeTimelineEdits";
export type {
  ResolvedVideoComposeClipSelection,
  VideoComposeClipReference,
  VideoComposeTimelineEdit,
} from "@/modules/creative_canvas/domain/videoComposeTimelineEdits";
export {
  createVideoComposeClipDragSession,
  createVideoComposeTrimDragSession,
  projectVideoComposeClipDrag,
  projectVideoComposeTrimDrag,
  snapVideoComposeClipStart,
  snapVideoComposePlayhead,
} from "@/modules/creative_canvas/domain/videoComposeTimelineGestures";
export type {
  AppliedVideoComposeClipDragProjection,
  BlockedVideoComposeClipDragProjection,
  VideoComposeClipDragProjection,
  VideoComposeClipDragSession,
  VideoComposeTrimDragSession,
} from "@/modules/creative_canvas/domain/videoComposeTimelineGestures";
export {
  buildVideoComposeInitialTimeline,
  reconcileVideoComposeDraftWithSources,
  resolveVideoComposeInitialTimeline,
} from "@/modules/creative_canvas/application/videoComposeTimelineSession";
export type {
  ResolveVideoComposeInitialTimelineOptions,
  VideoComposeClipIdFactory,
} from "@/modules/creative_canvas/application/videoComposeTimelineSession";
export {
  projectVideoComposeActiveMediaClock,
  resolveVideoComposeMediaClockMs,
  resolveVideoComposePreviewTrack,
} from "@/modules/creative_canvas/application/videoComposePreview";
export type {
  VideoComposeActiveMediaClock,
  VideoComposeMediaClockSample,
} from "@/modules/creative_canvas/application/videoComposePreview";
export type {
  CaptureVideoFrameStrip,
  VideoFrameStripCaptureOptions,
  VideoFrameStripFrame,
} from "@/modules/creative_canvas/application/videoFrameStrip";
export { captureBrowserVideoFrameStrip } from "@/modules/creative_canvas/infrastructure/browserVideoFrameStrip";
export { useVideoComposeTimelineEditorController } from "@/modules/creative_canvas/presentation/useVideoComposeTimelineEditorController";
export type { UseVideoComposeTimelineEditorControllerOptions } from "@/modules/creative_canvas/presentation/useVideoComposeTimelineEditorController";
export { useVideoComposeTimelineSessionController } from "@/modules/creative_canvas/presentation/useVideoComposeTimelineSessionController";
export type { UseVideoComposeTimelineSessionControllerOptions } from "@/modules/creative_canvas/presentation/useVideoComposeTimelineSessionController";
export { useVideoComposeTimelinePointerController } from "@/modules/creative_canvas/presentation/useVideoComposeTimelinePointerController";
export type {
  UseVideoComposeTimelinePointerControllerOptions,
  VideoComposePointerDragGhost,
  VideoComposePointerTrimEdit,
} from "@/modules/creative_canvas/presentation/useVideoComposeTimelinePointerController";
export { useVideoComposeKeyboardController } from "@/modules/creative_canvas/presentation/useVideoComposeKeyboardController";
export type { UseVideoComposeKeyboardControllerOptions } from "@/modules/creative_canvas/presentation/useVideoComposeKeyboardController";
export { useVideoComposePlaybackClock } from "@/modules/creative_canvas/presentation/useVideoComposePlaybackClock";
export type { VideoComposePlaybackClock } from "@/modules/creative_canvas/presentation/useVideoComposePlaybackClock";
export { useVideoComposePlaybackController } from "@/modules/creative_canvas/presentation/useVideoComposePlaybackController";
export { useVideoComposeExportController } from "@/modules/creative_canvas/presentation/useVideoComposeExportController";
export type {
  VideoComposeExportController,
  VideoComposeExportControllerOptions,
  VideoComposeExportTarget,
} from "@/modules/creative_canvas/presentation/useVideoComposeExportController";
export { VideoComposeModal } from "@/modules/creative_canvas/presentation/VideoComposeModal";
export type { VideoComposeModalProps } from "@/modules/creative_canvas/presentation/VideoComposeModal";
export { VideoComposeModalView } from "@/modules/creative_canvas/presentation/VideoComposeModalView";
export type {
  VideoComposeExportDialogState,
  VideoComposeExportLocation,
  VideoComposeModalViewProps,
} from "@/modules/creative_canvas/presentation/VideoComposeModalView";
export {
  VideoComposeSpeedPopover,
  VideoComposeToolButton,
  VideoComposeToolDivider,
  VideoComposeVolumePopover,
  VideoComposeZoomInGlyph,
  VideoComposeZoomOutGlyph,
} from "@/modules/creative_canvas/presentation/VideoComposeTimelineControls";
export type {
  CanvasVideoComposeGateway,
  ComposeCanvasVideoDependencies,
  ComposeCanvasVideoParams,
  ComposeCanvasVideoResult,
} from "@/modules/creative_canvas/application/composeCanvasVideo";
export type {
  ComposeVideoClipDependencies,
  ComposeVideoClipParams,
  ComposeVideoClipResult,
} from "@/modules/creative_canvas/application/composeVideoClip";
export { eraseVideoSubtitles } from "@/modules/creative_canvas/videoSubtitleEraseComposition";
export type {
  VideoSubtitleEraseBox,
  VideoSubtitleEraseMode,
} from "@/modules/creative_canvas/domain/videoSubtitleErase";
export type {
  EraseVideoSubtitlesDependencies,
  EraseVideoSubtitlesParams,
  EraseVideoSubtitlesResult,
  VideoSubtitleEraseGateway,
  VideoSubtitleEraseSubmission,
} from "@/modules/creative_canvas/application/eraseVideoSubtitles";
export {
  resolveCanvasImageTo3dSourceKind,
} from "@/modules/creative_canvas/domain/imageTo3d";
export type {
  CanvasImageTo3dSourceKind,
  CanvasImageTo3dSourceNode,
  CanvasImageTo3dVisibleSourceKind,
  CanvasImageTo3dWorldSource,
} from "@/modules/creative_canvas/domain/imageTo3d";
export type {
  CanvasImageTo3dCommand,
  CanvasImageTo3dSubmissionGateway,
  GenerateCanvasImageTo3dDependencies,
  GenerateCanvasImageTo3dParams,
  GenerateCanvasImageTo3dResult,
} from "@/modules/creative_canvas/application/generateCanvasImageTo3d";
export type {
  CanvasMultiAngleGenerationCommand,
  CanvasMultiAngleGenerationGateway,
  GenerateCanvasMultiAngleDependencies,
  GenerateCanvasMultiAngleParams,
  GenerateCanvasMultiAngleResult,
} from "@/modules/creative_canvas/application/generateCanvasMultiAngle";
export type {
  CanvasOutpaintGenerationCommand,
  CanvasOutpaintGenerationGateway,
  GenerateCanvasOutpaintDependencies,
  GenerateCanvasOutpaintParams,
  GenerateCanvasOutpaintResult,
} from "@/modules/creative_canvas/application/generateCanvasOutpaint";
export type {
  CanvasRedrawGenerationCommand,
  CanvasRedrawGenerationGateway,
  GenerateCanvasRedrawDependencies,
  GenerateCanvasRedrawParams,
  GenerateCanvasRedrawResult,
} from "@/modules/creative_canvas/application/generateCanvasRedraw";
export type {
  CanvasRelightGenerationCommand,
  CanvasRelightGenerationGateway,
  GenerateCanvasRelightDependencies,
  GenerateCanvasRelightParams,
  GenerateCanvasRelightResult,
} from "@/modules/creative_canvas/application/generateCanvasRelight";
export type {
  CanvasReversePromptCommand,
  CanvasReversePromptSubmissionGateway,
  CanvasReversePromptTaskGateway,
  GenerateCanvasReversePromptDependencies,
  GenerateCanvasReversePromptParams,
  GenerateCanvasReversePromptResult,
} from "@/modules/creative_canvas/application/generateCanvasReversePrompt";
export type {
  CanvasScene360GenerationCommand,
  CanvasScene360GenerationGateway,
  GenerateCanvasScene360Dependencies,
  GenerateCanvasScene360Params,
  GenerateCanvasScene360Result,
} from "@/modules/creative_canvas/application/generateCanvasScene360";
export type {
  CanvasImageSourcePreparationGateway,
  PrepareCanvasImageSourceDependencies,
  PrepareCanvasImageSourceParams,
  PrepareCanvasImageSourcesParams,
} from "@/modules/creative_canvas/application/prepareCanvasImageSource";
export type {
  CanvasUpscaleGenerationCommand,
  CanvasUpscaleGenerationGateway,
  GenerateCanvasUpscaleDependencies,
  GenerateCanvasUpscaleParams,
  GenerateCanvasUpscaleResult,
} from "@/modules/creative_canvas/application/generateCanvasUpscale";
export {
  CANVAS_VIDEO_UPSCALE_DENOISE_OPTIONS,
  CANVAS_VIDEO_UPSCALE_RESOLUTIONS,
  CANVAS_VIDEO_UPSCALE_RESOLUTION_LABEL,
  DEFAULT_CANVAS_VIDEO_UPSCALE_DENOISE,
  DEFAULT_CANVAS_VIDEO_UPSCALE_RESOLUTION,
  resolveCanvasVideoUpscaleDenoise,
  resolveCanvasVideoUpscaleResolution,
} from "@/modules/creative_canvas/domain/videoUpscale";
export type {
  CanvasVideoUpscaleDenoise,
  CanvasVideoUpscaleResolution,
} from "@/modules/creative_canvas/domain/videoUpscale";
export type {
  CanvasVideoUpscaleGenerationCommand,
  CanvasVideoUpscaleGenerationGateway,
  GenerateCanvasVideoUpscaleDependencies,
  GenerateCanvasVideoUpscaleParams,
  GenerateCanvasVideoUpscaleResult,
} from "@/modules/creative_canvas/application/generateCanvasVideoUpscale";
export {
  createCanvasAudioVoice,
  loadCanvasAudioReferences,
} from "@/modules/creative_canvas/audioVoiceCatalogComposition";
export {
  fetchCanvasGenerationResult,
  fetchCanvasGenerationResultUrl,
} from "@/modules/creative_canvas/infrastructure/freezoneGenerationResultGateway";
export { buildLibraryAssets } from "@/modules/creative_canvas/application/assetLibraryProjection";
export {
  assetToDragPayload,
  insertAssetLibraryAsset,
} from "@/modules/creative_canvas/application/assetLibraryCanvasInsertion";
export {
  mergeProjectedCanvasWithLocalCanvas,
  removeProjectionFromLocalCanvas,
} from "@/modules/creative_canvas/application/canvasProjectionGraph";
export { createCanvasPresetRefresher } from "@/modules/creative_canvas/application/canvasPresetRefresh";
export type {
  CanvasPresetRefreshArgs,
  CanvasPresetRefreshDependencies,
} from "@/modules/creative_canvas/application/canvasPresetRefresh";
export { saveErrorStatusAndBody } from "@/modules/creative_canvas/application/canvasSaveError";
export type { SaveErrorBody } from "@/modules/creative_canvas/application/canvasSaveError";
export { canvasEnvelopeFromRemote } from "@/modules/creative_canvas/application/canvasSyncCore";
export {
  projectionScopedId,
  scopeProjectionGraphIds,
} from "@/modules/creative_canvas/domain/projectionGraphIds";
export {
  beatAssetItems,
  buildAssetLibraryTabs,
  countAssetsForTab,
  filterAssetLibraryAssets,
  groupBeatAssets,
  resolveCanvasKind,
  resolveCurrentBeat,
  resolveCurrentEpisode,
  sceneAssetTypeBadge,
} from "@/modules/creative_canvas/presentation/assetLibraryViewModel";
export {
  PERSONAL_CANVAS_DISPLAY_NAME,
  buildCanvasBrowserSections,
  canDeleteCanvasSummary,
  canvasKindFromSummary,
  displayNameForCanvasSummary,
  findDuplicateCanvasName,
  formatCanvasRelativeTime,
  isConflictCopyCanvas,
  isEpisodeSectionExpandedByDefault,
  orderCanvasSummaries,
  sourceCanvasIdFromSummary,
  userCreatedCanvasId,
} from "@/modules/creative_canvas/presentation/canvasBrowserViewModel";
export { useCanvasBrowserController } from "@/modules/creative_canvas/canvasBrowserComposition";
export type { CanvasBrowserControllerOptions } from "@/modules/creative_canvas/canvasBrowserComposition";
export { CanvasesTab } from "@/modules/creative_canvas/presentation/CanvasesTab";
export type {
  CanvasBrowserKind,
  CanvasBrowserSections,
  CanvasDisplaySummary,
} from "@/modules/creative_canvas/presentation/canvasBrowserViewModel";
export {
  BEAT_SLOT_KINDS,
  GLOBAL_SLOT_KINDS,
  KIND_LABELS,
  SCENE_SLOT_KINDS,
  buildCommitTarget,
  directorWorldSourceDisplayName,
  firstIdentityOptionValue,
  identityOptionLabel,
  identityOptionValue,
  identityOptionsForSelect,
  isUserSelectableCommitKind,
  modelSlotKindsForNodeData,
  renderCommitTargetLabel,
  renderMediaLabel,
  sceneOptionLabel,
  sceneOptionValue,
  shortKindLabel,
} from "@/modules/creative_canvas/presentation/commitDialogViewModel";
export {
  resolveMaxAllowedLineThickness,
  splitIntoSegments,
} from "@/modules/creative_canvas/domain/toolImageGeometry";
export {
  DEFAULT_MULTI_ANGLE_IMAGE_SIZE,
  MULTI_ANGLE_IMAGE_SIZES,
  normalizeMultiAngleYaw,
  resolveMultiAngleGenerationPreset,
} from "@/modules/creative_canvas/domain/multiAngle";
export type {
  CanvasMultiViewPreset,
  MultiAngleImageSize,
  MultiAnglePresetKey,
  MultiAngleZoomLevel,
} from "@/modules/creative_canvas/domain/multiAngle";
export {
  CANVAS_OUTPAINT_ASPECT_RATIOS,
  CANVAS_OUTPAINT_IMAGE_SIZES,
  CANVAS_OUTPAINT_NUM_IMAGES,
  DEFAULT_CANVAS_OUTPAINT_ASPECT_RATIO,
  DEFAULT_CANVAS_OUTPAINT_IMAGE_SIZE,
  DEFAULT_CANVAS_OUTPAINT_NUM_IMAGES,
  calculateCanvasOutpaintFrame,
} from "@/modules/creative_canvas/domain/outpaint";
export type {
  CanvasOutpaintAspectRatio,
  CanvasOutpaintFrame,
  CanvasOutpaintImageSize,
  CanvasOutpaintNumImages,
} from "@/modules/creative_canvas/domain/outpaint";
export {
  CANVAS_REDRAW_ASPECT_RATIOS,
  CANVAS_REDRAW_IMAGE_SIZES,
  CANVAS_REDRAW_NUM_IMAGES,
  DEFAULT_CANVAS_REDRAW_ASPECT_RATIO,
  DEFAULT_CANVAS_REDRAW_IMAGE_SIZE,
  DEFAULT_CANVAS_REDRAW_NUM_IMAGES,
  resolveCanvasRedrawAspectRatio,
  resolveCanvasRedrawImageSize,
} from "@/modules/creative_canvas/domain/redraw";
export type {
  CanvasRedrawAspectRatio,
  CanvasRedrawImageSize,
  CanvasRedrawNumImages,
} from "@/modules/creative_canvas/domain/redraw";
export {
  buildCanvasRelightPrompt,
  resolveCanvasRelightKeyLightDirection,
} from "@/modules/creative_canvas/domain/relight";
export type {
  CanvasRelightKeyLightDirection,
  CanvasRelightSmartPrompt,
} from "@/modules/creative_canvas/domain/relight";
export {
  CANVAS_SCENE_360_ASPECT_RATIOS,
  DEFAULT_CANVAS_SCENE_360_ASPECT_RATIO,
} from "@/modules/creative_canvas/domain/scene360";
export type { CanvasScene360AspectRatio } from "@/modules/creative_canvas/domain/scene360";
export {
  CANVAS_UPSCALE_IMAGE_SIZES,
  CANVAS_UPSCALE_SCALE_FACTORS,
  DEFAULT_CANVAS_UPSCALE_IMAGE_SIZE,
  DEFAULT_CANVAS_UPSCALE_SCALE_FACTOR,
  resolveCanvasUpscaleImageSize,
  resolveCanvasUpscaleScaleFactor,
} from "@/modules/creative_canvas/domain/upscale";
export type {
  CanvasUpscaleImageSize,
  CanvasUpscaleScaleFactor,
} from "@/modules/creative_canvas/domain/upscale";
export {
  CandidateBindingBadges,
  NodeContextBadges,
} from "@/modules/creative_canvas/presentation/NodeContextBadges";
export {
  translateSkillCardinality,
  translateSkillDescription,
  translateSkillInputLabel,
  translateSkillName,
  translateSkillOutputLabel,
  translateSkillParameterLabel,
  translateSkillParameterOption,
  translateSkillRequirement,
} from "@/modules/creative_canvas/presentation/skillI18n";
export { FreezoneChatDock } from "@/modules/creative_canvas/presentation/FreezoneChatDock";
export type { FreezoneChatDockProps } from "@/modules/creative_canvas/presentation/FreezoneChatDock";
export { CommitDialogView } from "@/modules/creative_canvas/presentation/CommitDialogView";
export type { CommitDialogViewProps } from "@/modules/creative_canvas/presentation/CommitDialogView";
export { CommitDialog } from "@/modules/creative_canvas/presentation/CommitDialog";
export { CompareDialog } from "@/modules/creative_canvas/presentation/CompareDialog";
export { CreateIdentityDialog } from "@/modules/creative_canvas/presentation/CreateIdentityDialog";
export {
  BackupStatusIndicator,
  CanvasConflictOverlay,
  CanvasErrorOverlay,
  CanvasLoadingOverlay,
  CanvasLoadingScreen,
  FreezoneToast,
} from "@/modules/creative_canvas/presentation/FreezoneCanvasFeedback";
