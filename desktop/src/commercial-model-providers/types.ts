// Copyright (c) 2026 AI anime

import type { IncomingMessage } from "node:http";

import type { ModelRoute, PreparedBody } from "../commercial-model-route.js";

export interface ProviderAssignment {
  modelId: string;
  role: string;
}

export interface ProviderRequestInput {
  method: string;
  path: string;
  requestHeaders: IncomingMessage["headers"];
  signal: AbortSignal;
}

export interface ProviderModelDiscoveryInput {
  apiKey: string;
  baseUrl: string;
  fetchImpl: typeof fetch;
  providerName: string;
}

export interface ProviderDiscoveredModel {
  id: string;
  capabilities?: Record<string, unknown>;
  parameterSchema?: Record<string, unknown>;
  contextWindow?: number;
  maxOutputTokens?: number;
  reasoningEfforts?: string[];
  defaultReasoningEffort?: string;
}

export interface CommercialModelProviderStrategy {
  id: string;
  matches(url: URL): boolean;
  normalizeBaseUrl(url: URL): string;
  discoverModelIds(input: ProviderModelDiscoveryInput): Promise<string[]>;
  discoverModels?(
    input: ProviderModelDiscoveryInput,
  ): Promise<ProviderDiscoveredModel[]>;
  parameterSchema(role: string, modelId: string): string | null;
  validateInputAssignments?(assignments: readonly ProviderAssignment[]): void;
  migrateAssignments<T extends ProviderAssignment>(assignments: readonly T[]): T[];
  validateAssignments(assignments: readonly ProviderAssignment[]): void;
  request(
    route: ModelRoute,
    input: ProviderRequestInput,
    prepared: PreparedBody,
  ): Promise<Response>;
}
