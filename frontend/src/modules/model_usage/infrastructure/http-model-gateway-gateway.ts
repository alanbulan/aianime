import { api } from "@/shared/api/transport";
import type { ModelGatewayGateway } from "@/modules/model_usage/application/model-gateway-ports";
import type {
  ModelGatewayConfig,
  ModelGatewaySuccess,
} from "@/modules/model_usage/domain/model-gateway";

export const httpModelGatewayGateway: ModelGatewayGateway = {
  fetchConfig: (signal) =>
    api
      .get("api/v1/model-gateway/config", { signal })
      .json<ModelGatewaySuccess<ModelGatewayConfig>>(),
};
