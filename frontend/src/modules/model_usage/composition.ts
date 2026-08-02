import { createGenerationCreditQueries } from "@/modules/model_usage/application/query-hooks";
import { createModelGatewayQueries } from "@/modules/model_usage/application/model-gateway-query-hooks";
import { createCommercialModelAccessQueries } from "@/modules/model_usage/application/commercial-model-access-queries";
import { httpGenerationCreditGateway } from "@/modules/model_usage/infrastructure/http-generation-credit-gateway";
import { httpModelGatewayGateway } from "@/modules/model_usage/infrastructure/http-model-gateway-gateway";
import { electronCommercialModelAccessGateway } from "@/modules/model_usage/infrastructure/electron-commercial-model-access-gateway";

const generationCreditQueries = createGenerationCreditQueries(
  httpGenerationCreditGateway,
);
const modelGatewayQueries = createModelGatewayQueries(httpModelGatewayGateway);
const commercialModelAccessQueries = createCommercialModelAccessQueries(
  electronCommercialModelAccessGateway,
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
  useCommercialQuota,
  useConfigureByok,
  useSelectCloudModels,
} = commercialModelAccessQueries;
export const seedCommercialBootstrapModelUsage =
  commercialModelAccessQueries.seedCommercialBootstrap;
