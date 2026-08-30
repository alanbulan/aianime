// Copyright (c) 2026 AI anime

import { CommercialApiError } from "./commercial-api-client.js";
import { resolveProviderStrategy } from "./commercial-model-providers/factory.js";
import { forwardedHeaders } from "./commercial-model-providers/shared.js";
import type { ProviderRequestInput } from "./commercial-model-providers/types.js";
import type { ModelRoute, PreparedBody } from "./commercial-model-route.js";

export async function requestByok(
  route: ModelRoute,
  input: ProviderRequestInput,
  prepared: PreparedBody,
): Promise<Response> {
  if (!route.baseUrl) throw new CommercialApiError("BYOK Base URL 缺失");
  return resolveProviderStrategy(
    route.protocol ?? "OPENAI_COMPATIBLE",
    route.baseUrl,
  ).request(route, input, prepared);
}

export { forwardedHeaders };
