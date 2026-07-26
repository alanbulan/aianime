// Copyright (c) 2026 AI anime
export { SKILL_SCHEMA_VERSION } from "@/features/freezone/domain/skillContract";
export {
  isSkillRunDoneStatus,
  isSkillRunFailureStatus,
  isSkillRunTerminalStatus,
  skillRunErrorMessage,
} from "@/features/freezone/domain/skillExecution";
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
