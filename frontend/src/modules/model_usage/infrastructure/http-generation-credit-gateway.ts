import { jsonWithBackendError } from "@/shared/api/errors";
import { api } from "@/shared/api/transport";
import type {
  GenerationCreditGateway,
  NormalizedGenerationCreditCostRequest,
} from "@/modules/model_usage/application/ports";
import type { GenerationCreditCostResponse } from "@/modules/model_usage/domain/generation-credit";

export const httpGenerationCreditGateway: GenerationCreditGateway = {
  fetch(request: NormalizedGenerationCreditCostRequest, signal?: AbortSignal) {
    return jsonWithBackendError<GenerationCreditCostResponse>(
      api.get("api/v1/generation-credit-cost", {
        searchParams: {
          kind: request.kind,
          ...(request.surface ? { surface: request.surface } : {}),
          ...(request.value ? { value: request.value } : {}),
          ...(request.paramsJson ? { params: request.paramsJson } : {}),
          ...(request.quantity != null
            ? { quantity: String(request.quantity) }
            : {}),
          ...(request.modeKey ? { mode_key: request.modeKey } : {}),
          ...(request.imageRole ? { image_role: request.imageRole } : {}),
        },
        signal,
        throwHttpErrors: false,
      }),
    );
  },
};
