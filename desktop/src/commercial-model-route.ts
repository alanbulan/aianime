// Copyright (c) 2026 AI anime

import type {
  ByokModelRole,
  ByokProviderProtocol,
} from "./commercial-model-access.js";

export interface ModelRoute {
  key: string;
  selector: string;
  source: "cloud" | "byok";
  label: string;
  role: ByokModelRole;
  modelId: string;
  priority: number;
  providerPriority: number;
  baseUrl?: string;
  apiKey?: string;
  protocol?: ByokProviderProtocol;
  contextWindow?: number;
  maxOutputTokens?: number;
  reasoningEfforts?: string[];
  defaultReasoningEffort?: string;
}

export interface PreparedBody {
  body?: BodyInit;
  contentType?: string;
}
