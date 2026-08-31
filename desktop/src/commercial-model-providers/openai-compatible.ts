// Copyright (c) 2026 AI anime

import { randomUUID } from "node:crypto";

import { isModelWriteMethod } from "../commercial-api-client.js";
import type { CommercialModelProviderStrategy } from "./types.js";
import {
  discoverOpenAiCompatibleModelCatalog,
  discoverOpenAiCompatibleModels,
  fetchProvider,
  forwardedHeaders,
  normalizeOpenAiBaseUrl,
} from "./shared.js";

export async function requestOpenAiCompatible(
  route: Parameters<CommercialModelProviderStrategy["request"]>[0],
  input: Parameters<CommercialModelProviderStrategy["request"]>[1],
  prepared: Parameters<CommercialModelProviderStrategy["request"]>[2],
): Promise<Response> {
  const localUrl = new URL(input.path, "http://model-proxy.local");
  const relativePath = localUrl.pathname.replace(/^\/v1(?=\/|$)/, "") || "/";
  const upstreamUrl = new URL(`${route.baseUrl}${relativePath}`);
  upstreamUrl.search = localUrl.search;
  const headers = forwardedHeaders(input.requestHeaders, prepared.contentType);
  if (route.apiKey) headers.set("Authorization", `Bearer ${route.apiKey}`);
  if (isModelWriteMethod(input.method) && !headers.has("Idempotency-Key")) {
    headers.set("Idempotency-Key", randomUUID());
  }
  return fetchProvider(route, upstreamUrl, {
    method: input.method,
    headers,
    ...(prepared.body === undefined ? {} : { body: prepared.body }),
    signal: input.signal,
  });
}

export const openAiCompatibleProviderStrategy: CommercialModelProviderStrategy = {
  id: "openai-compatible",
  matches: () => true,
  normalizeBaseUrl: normalizeOpenAiBaseUrl,
  discoverModelIds: discoverOpenAiCompatibleModels,
  discoverModels: discoverOpenAiCompatibleModelCatalog,
  parameterSchema: () => null,
  validateAssignments: () => undefined,
  request: requestOpenAiCompatible,
};
