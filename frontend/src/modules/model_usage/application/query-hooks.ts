import { queryOptions, useQueries, useQuery } from "@tanstack/react-query";

import { BillingRuleNotConfiguredError } from "@/shared/api/errors";
import type { GenerationCreditGateway } from "@/modules/model_usage/application/ports";
import type {
  GenerationCreditCostOptions,
  GenerationCreditCostRequest,
} from "@/modules/model_usage/domain/generation-credit";

export const generationCreditCostQueryKey = (
  kind: string,
  value?: string | null,
  options: GenerationCreditCostOptions = {},
) =>
  [
    "generation-credit-cost",
    kind,
    value ?? "",
    options.surface ?? "",
    options.params ? JSON.stringify(options.params) : "",
    options.quantity ?? "",
    options.modeKey ?? "",
    options.imageRole ?? "",
  ] as const;

export function createGenerationCreditQueries(gateway: GenerationCreditGateway) {
  function generationCreditCostQueryOptions(
    kind: string,
    value?: string | null,
    options: GenerationCreditCostOptions = {},
  ) {
    const cleanKind = kind.trim();
    const cleanValue = String(value ?? "").trim();
    const cleanSurface = String(options.surface ?? "").trim();
    const cleanModeKey = String(options.modeKey ?? "").trim();
    const cleanImageRole = String(options.imageRole ?? "").trim();
    const paramsJson = options.params ? JSON.stringify(options.params) : "";
    const requiresValue =
      cleanKind === "model" ||
      cleanKind === "image_selection" ||
      cleanKind === "fixed_image" ||
      cleanKind === "video_backend" ||
      cleanKind === "feature";

    return queryOptions({
      queryKey: generationCreditCostQueryKey(cleanKind, cleanValue, {
        params: options.params,
        surface: cleanSurface as GenerationCreditCostOptions["surface"],
        quantity: options.quantity,
        modeKey: cleanModeKey,
        imageRole: cleanImageRole,
      }),
      queryFn: ({ signal }) =>
        gateway.fetch(
          {
            kind: cleanKind,
            value: cleanValue,
            surface: cleanSurface,
            paramsJson,
            quantity: options.quantity ?? null,
            modeKey: cleanModeKey,
            imageRole: cleanImageRole,
          },
          signal,
        ),
      enabled: !!cleanKind && (!requiresValue || !!cleanValue),
      retry: (failureCount, error) =>
        !(error instanceof BillingRuleNotConfiguredError) && failureCount < 3,
      staleTime: 60_000,
    });
  }

  function useGenerationCreditCost(
    kind: string,
    value?: string | null,
    options: GenerationCreditCostOptions = {},
  ) {
    return useQuery(generationCreditCostQueryOptions(kind, value, options));
  }

  function useGenerationCreditCosts(
    requests: readonly GenerationCreditCostRequest[],
  ) {
    return useQueries({
      queries: requests.map(({ kind, options, value }) =>
        generationCreditCostQueryOptions(kind, value, options),
      ),
    });
  }

  return {
    useGenerationCreditCost,
    useGenerationCreditCosts,
  };
}
