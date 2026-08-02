// Copyright (c) 2026 AI anime
import {
  propRefCandidateCapability,
  renderRepairCandidateCapability,
  scene360CandidateCapability,
  sceneMasterCandidateCapability,
  startFrameCandidateCapability,
} from "./candidateCapabilities";
import {
  characterMultiViewCapability,
  portraitFromRefCapability,
} from "./portraitFromRef";
import { realSceneSketchRepairCapability } from "./realSceneSketchRepair";
import type {
  CapabilityComposeContext,
  ComposedCapabilityJob,
  GenerationCapability,
} from "./contracts";

const CAPABILITIES: GenerationCapability[] = [
  realSceneSketchRepairCapability,
  portraitFromRefCapability,
  characterMultiViewCapability,
  sceneMasterCandidateCapability,
  scene360CandidateCapability,
  propRefCandidateCapability,
  renderRepairCandidateCapability,
  startFrameCandidateCapability,
];

const capabilityMap = new Map(CAPABILITIES.map((capability) => [capability.id, capability]));

export function listCapabilities(): GenerationCapability[] {
  return CAPABILITIES;
}

export function getCapability(capabilityId: string | null | undefined): GenerationCapability | null {
  if (!capabilityId) return null;
  return capabilityMap.get(capabilityId) ?? null;
}

export function defaultCapabilityParams(capability: GenerationCapability): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const param of capability.params) {
    if (param.defaultValue !== undefined) {
      params[param.key] = param.defaultValue;
    } else if (param.type === "multiselect") {
      params[param.key] = [];
    } else if (param.options?.[0]) {
      params[param.key] = param.options[0].value;
    } else if (param.type === "boolean") {
      params[param.key] = false;
    } else {
      params[param.key] = "";
    }
  }
  return params;
}

export function composeCapability(
  capabilityId: string,
  context: CapabilityComposeContext,
): ComposedCapabilityJob | null {
  const capability = getCapability(capabilityId);
  if (!capability) return null;
  return capability.compose(context);
}
