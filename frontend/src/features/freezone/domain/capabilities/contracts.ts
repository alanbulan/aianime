// Copyright (c) 2026 AI anime
export type CapabilityCategory = "character" | "scene" | "beat" | "video" | "utility";
export type CapabilityParamType = "enum" | "multiselect" | "slider" | "text" | "boolean";

export interface CapabilityInputDefinition {
  key: string;
  label: string;
  required: boolean;
  acceptKinds: string[];
  description?: string;
}

export interface CapabilityParamOption {
  value: string;
  label: string;
}

export interface CapabilityParamDefinition {
  key: string;
  label: string;
  type: CapabilityParamType;
  defaultValue?: unknown;
  options?: CapabilityParamOption[];
  min?: number;
  max?: number;
  step?: number;
  description?: string;
}

export interface CapabilityComposeContext {
  inputUrls: string[];
  params: Record<string, unknown>;
  nodePrompt?: string;
  metadata?: Record<string, unknown> | null;
}

export interface ComposedCapabilityJob {
  prompt: string;
  referenceUrls: string[];
  model: string;
  aspectRatio: string;
  imageSize: string;
  quality?: string;
  outputKind?: string;
}

export interface GenerationCapability {
  id: string;
  name: string;
  shortName: string;
  category: CapabilityCategory;
  description: string;
  outputKind: string;
  model: string;
  aspectRatio: string;
  imageSize: string;
  inputs: CapabilityInputDefinition[];
  params: CapabilityParamDefinition[];
  compose(context: CapabilityComposeContext): ComposedCapabilityJob;
}

export function stringifyParamValue(value: unknown): string {
  if (Array.isArray(value)) return value.filter(Boolean).join(" / ");
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}
