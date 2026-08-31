import { createModelGatewayQueries } from "@/modules/model_usage/application/model-gateway-query-hooks";
import { createCommercialModelAccessQueries } from "@/modules/model_usage/application/commercial-model-access-queries";
import { createCommercialInvocationQueries } from "@/modules/model_usage/application/commercial-invocation-queries";
import { httpModelGatewayGateway } from "@/modules/model_usage/infrastructure/http-model-gateway-gateway";
import { electronCommercialModelAccessGateway } from "@/modules/model_usage/infrastructure/electron-commercial-model-access-gateway";
import { electronCommercialInvocationGateway } from "@/modules/model_usage/infrastructure/electron-commercial-invocation-gateway";

const modelGatewayQueries = createModelGatewayQueries(httpModelGatewayGateway);
const commercialModelAccessQueries = createCommercialModelAccessQueries(
  electronCommercialModelAccessGateway,
);
const commercialInvocationQueries = createCommercialInvocationQueries(
  electronCommercialInvocationGateway,
);

export const { useModelGatewayConfig } = modelGatewayQueries;
export const {
  clearCommercialModelCatalogCache,
  loadCommercialModelAccessStatus,
  loadCommercialModelCatalog,
  useClearByok,
  useDiscoverByokProviderModels,
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
