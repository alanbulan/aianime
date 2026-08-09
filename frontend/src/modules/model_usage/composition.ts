import { createGenerationCreditQueries } from "@/modules/model_usage/application/query-hooks";
import { createModelGatewayQueries } from "@/modules/model_usage/application/model-gateway-query-hooks";
import { createCommercialModelAccessQueries } from "@/modules/model_usage/application/commercial-model-access-queries";
import { createCommercialInvocationQueries } from "@/modules/model_usage/application/commercial-invocation-queries";
import { httpGenerationCreditGateway } from "@/modules/model_usage/infrastructure/http-generation-credit-gateway";
import { httpModelGatewayGateway } from "@/modules/model_usage/infrastructure/http-model-gateway-gateway";
import { electronCommercialModelAccessGateway } from "@/modules/model_usage/infrastructure/electron-commercial-model-access-gateway";
import { electronCommercialInvocationGateway } from "@/modules/model_usage/infrastructure/electron-commercial-invocation-gateway";

const generationCreditQueries = createGenerationCreditQueries(
  httpGenerationCreditGateway,
);
const modelGatewayQueries = createModelGatewayQueries(httpModelGatewayGateway);
const commercialModelAccessQueries = createCommercialModelAccessQueries(
  electronCommercialModelAccessGateway,
);
const commercialInvocationQueries = createCommercialInvocationQueries(
  electronCommercialInvocationGateway,
);

export const { useGenerationCreditCost, useGenerationCreditCosts } =
  generationCreditQueries;
export const { useModelGatewayConfig } = modelGatewayQueries;
export const {
  clearCommercialModelCatalogCache,
  loadCommercialModelCatalog,
  useClearByok,
  useCommercialModelAccessStatus,
  useCommercialModelCatalog,
  useCommercialModelDetails,
  useCommercialQuota,
  useConfigureByok,
  useSelectCloudModels,
} = commercialModelAccessQueries;
export const seedCommercialBootstrapModelUsage =
  commercialModelAccessQueries.seedCommercialBootstrap;
export const {
  useCancelCommercialInvocation,
  useCommercialInvocationDetails,
  useCommercialInvocations,
  useSaveCommercialInvocationResult,
} = commercialInvocationQueries;
