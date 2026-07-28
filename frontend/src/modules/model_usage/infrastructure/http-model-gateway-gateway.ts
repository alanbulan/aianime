import type { ModelGatewayGateway } from "@/modules/model_usage/application/model-gateway-ports";
import type {
  CustomChannelWriteResult,
  InitCustomNewApiResult,
  MediaRelayConfig,
  ModelGatewayConfig,
  ModelGatewayLooseResult,
  ModelGatewayResult,
  ModelGatewaySuccess,
  SaveCustomChannelsBatchResult,
  SaveEmbeddingModelResult,
  SaveMediaModelsResult,
  SavedProviderChannelConfig,
  SyncProviderChannelResult,
} from "@/modules/model_usage/domain/model-gateway";
import { api } from "@/shared/api/transport";

export const httpModelGatewayGateway: ModelGatewayGateway = {
  fetchConfig(signal) {
    return api
      .get("api/v1/model-gateway/config", { signal })
      .json<ModelGatewaySuccess<ModelGatewayConfig>>();
  },
  saveOfficialConfig(input) {
    return api
      .post("api/v1/model-gateway/official/config", { json: input })
      .json<ModelGatewayResult<ModelGatewayConfig>>();
  },
  enableOfficial() {
    return api
      .post("api/v1/model-gateway/official/enable")
      .json<ModelGatewayResult<ModelGatewayConfig>>();
  },
  initCustomNewApi(input) {
    return api
      .post("api/v1/model-gateway/custom/newapi/init", {
        json: input,
        timeout: 60_000,
        throwHttpErrors: false,
      })
      .json<ModelGatewayLooseResult<InitCustomNewApiResult>>();
  },
  saveProviderChannels(input) {
    return api
      .post("api/v1/model-gateway/custom/newapi/provider-channels", {
        json: input,
        timeout: 60_000,
      })
      .json<
        ModelGatewayResult<{ channels: SavedProviderChannelConfig[] }>
      >();
  },
  syncProviderChannel(input) {
    return api
      .post("api/v1/model-gateway/custom/newapi/provider-channel/sync", {
        json: input,
        timeout: 60_000,
        throwHttpErrors: false,
      })
      .json<ModelGatewayLooseResult<SyncProviderChannelResult>>();
  },
  saveCustomChannel(input) {
    return api
      .post("api/v1/model-gateway/custom/newapi/channels", {
        json: input,
        timeout: 60_000,
      })
      .json<ModelGatewayResult<CustomChannelWriteResult>>();
  },
  saveMediaModels(input) {
    return api
      .post("api/v1/model-gateway/custom/newapi/media-models", {
        json: input,
        timeout: 120_000,
      })
      .json<ModelGatewayResult<SaveMediaModelsResult>>();
  },
  saveEmbeddingModel(input) {
    return api
      .post("api/v1/model-gateway/custom/newapi/embedding-model", {
        json: input,
        timeout: 120_000,
      })
      .json<ModelGatewayResult<SaveEmbeddingModelResult>>();
  },
  saveMediaRelayConfig(input) {
    return api
      .post("api/v1/model-gateway/media-relay/config", {
        json: input,
        timeout: 60_000,
      })
      .json<ModelGatewayResult<MediaRelayConfig>>();
  },
  saveCustomChannelsBatch(input) {
    return api
      .post("api/v1/model-gateway/custom/newapi/channels/batch", {
        json: input,
        timeout: 120_000,
      })
      .json<ModelGatewayResult<SaveCustomChannelsBatchResult>>();
  },
};
