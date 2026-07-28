import { createGenerationCreditQueries } from "@/modules/model_usage/application/query-hooks";
import { createModelGatewayQueries } from "@/modules/model_usage/application/model-gateway-query-hooks";
import { httpGenerationCreditGateway } from "@/modules/model_usage/infrastructure/http-generation-credit-gateway";
import { httpModelGatewayGateway } from "@/modules/model_usage/infrastructure/http-model-gateway-gateway";

const generationCreditQueries = createGenerationCreditQueries(
  httpGenerationCreditGateway,
);
const modelGatewayQueries = createModelGatewayQueries(httpModelGatewayGateway);

export const { useGenerationCreditCost, useGenerationCreditCosts } =
  generationCreditQueries;
export const {
  useEnableOfficial,
  useInitCustomNewApi,
  useModelGatewayConfig,
  useSaveCustomChannel,
  useSaveCustomChannelsBatch,
  useSaveEmbeddingModel,
  useSaveMediaModels,
  useSaveMediaRelayConfig,
  useSaveOfficialConfig,
  useSaveProviderChannels,
  useSyncProviderChannel,
} = modelGatewayQueries;
