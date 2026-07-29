// Copyright (c) 2026 AI anime
export {
  buildProjectionFromPreset,
  commitFreezoneAsset,
  getFreezoneAssetImpact,
  getProjectionStatuses,
  listFreezoneBeatContext,
  listFreezoneProjectAssets,
  uploadFreezoneAsset,
  useFreezoneBeatContext,
  useFreezoneProjectAssets,
} from "@/features/freezone/composition";
export { openPresetProjectionInMyCanvas } from "@/features/freezone/openPresetProjection";
export { installFreezoneCanvasStorageReclaimer } from "@/features/freezone/canvasDraftComposition";
export { presetRequestFromMetadata } from "@/features/freezone/application/canvasPreset";
export type {
  FreezoneAssetUploadOptions,
  FreezoneAssetUploadResult,
} from "@/features/freezone/domain/assetUpload";
export { SKILL_SCHEMA_VERSION } from "@/features/freezone/domain/skillContract";
export {
  isSkillRunDoneStatus,
  isSkillRunFailureStatus,
  isSkillRunTerminalStatus,
  skillRunErrorMessage,
} from "@/features/freezone/domain/skillExecution";
export type {
  ImpactBeat,
  ImpactResult,
  PushResult,
  PushTarget,
  PushTargetKind,
} from "@/features/freezone/domain/assetCommit";
export type {
  FreezoneBeatContextBeat,
  FreezoneBeatContextEpisode,
  FreezoneBeatContextResponse,
  FreezoneAssetMediaType,
  FreezoneProjectAsset,
} from "@/features/freezone/domain/beatContext";
export type {
  FreezoneProjectionBuildResponse,
  FreezoneProjectionPresetRequest,
  FreezoneProjectionStatusItem,
  FreezoneProjectionStatusResponse,
} from "@/features/freezone/domain/canvasProjection";
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
} from "@/features/freezone/domain/canvasStorage";
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
} from "@/features/freezone/domain/skillContract";
export type {
  CanvasGraphPatch,
  CanvasGraphPatchOperation,
  SkillErrorEnvelope,
  SkillRunOutput,
  SkillRunRequest,
  SkillRunResponse,
  SkillRunResult,
} from "@/features/freezone/domain/skillExecution";
export type {
  SceneAssetsForBeat,
  SceneAssetsForBeatResult,
} from "@/features/freezone/domain/sceneAssets";
