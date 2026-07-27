import type { GenerationCreditCostResponse } from "@/modules/model_usage/domain/generation-credit";

export interface NormalizedGenerationCreditCostRequest {
  kind: string;
  value: string;
  surface: string;
  paramsJson: string;
  quantity: number | null;
  modeKey: string;
  imageRole: string;
}

export interface GenerationCreditGateway {
  fetch(
    request: NormalizedGenerationCreditCostRequest,
    signal?: AbortSignal,
  ): Promise<GenerationCreditCostResponse>;
}
