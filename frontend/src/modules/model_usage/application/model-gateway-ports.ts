import type {
  ModelGatewayConfig,
  ModelGatewaySuccess,
} from "@/modules/model_usage/domain/model-gateway";

export interface ModelGatewayGateway {
  fetchConfig(signal?: AbortSignal): Promise<ModelGatewaySuccess<ModelGatewayConfig>>;
}
