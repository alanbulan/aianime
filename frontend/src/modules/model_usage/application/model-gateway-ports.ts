import type {
  CustomChannelWriteResult,
  InitCustomNewApiInput,
  InitCustomNewApiResult,
  MediaRelayConfig,
  ModelGatewayConfig,
  ModelGatewayLooseResult,
  ModelGatewayResult,
  ModelGatewaySuccess,
  SaveCustomChannelInput,
  SaveCustomChannelsBatchInput,
  SaveCustomChannelsBatchResult,
  SaveEmbeddingModelInput,
  SaveEmbeddingModelResult,
  SaveMediaModelsInput,
  SaveMediaModelsResult,
  SaveMediaRelayConfigInput,
  SaveOfficialConfigInput,
  SaveProviderChannelsInput,
  SavedProviderChannelConfig,
  SyncProviderChannelInput,
  SyncProviderChannelResult,
} from "@/modules/model_usage/domain/model-gateway";

export interface ModelGatewayGateway {
  fetchConfig(signal?: AbortSignal): Promise<ModelGatewaySuccess<ModelGatewayConfig>>;
  saveOfficialConfig(
    input: SaveOfficialConfigInput,
  ): Promise<ModelGatewayResult<ModelGatewayConfig>>;
  enableOfficial(): Promise<ModelGatewayResult<ModelGatewayConfig>>;
  initCustomNewApi(
    input: InitCustomNewApiInput,
  ): Promise<ModelGatewayLooseResult<InitCustomNewApiResult>>;
  saveProviderChannels(
    input: SaveProviderChannelsInput,
  ): Promise<ModelGatewayResult<{ channels: SavedProviderChannelConfig[] }>>;
  syncProviderChannel(
    input: SyncProviderChannelInput,
  ): Promise<ModelGatewayLooseResult<SyncProviderChannelResult>>;
  saveCustomChannel(
    input: SaveCustomChannelInput,
  ): Promise<ModelGatewayResult<CustomChannelWriteResult>>;
  saveMediaModels(
    input: SaveMediaModelsInput,
  ): Promise<ModelGatewayResult<SaveMediaModelsResult>>;
  saveEmbeddingModel(
    input: SaveEmbeddingModelInput,
  ): Promise<ModelGatewayResult<SaveEmbeddingModelResult>>;
  saveMediaRelayConfig(
    input: SaveMediaRelayConfigInput,
  ): Promise<ModelGatewayResult<MediaRelayConfig>>;
  saveCustomChannelsBatch(
    input: SaveCustomChannelsBatchInput,
  ): Promise<ModelGatewayResult<SaveCustomChannelsBatchResult>>;
}
