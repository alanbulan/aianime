import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type { ModelGatewayGateway } from "@/modules/model_usage/application/model-gateway-ports";
import type {
  CustomChannelInput,
  InitCustomNewApiInput,
  NewApiDatabaseConfigInput,
  SaveCustomChannelsBatchInput,
  SaveEmbeddingModelInput,
  SaveMediaModelsInput,
  SaveMediaRelayConfigInput,
  SaveOfficialConfigInput,
  SaveProviderChannelsInput,
  SyncProviderChannelInput,
} from "@/modules/model_usage/domain/model-gateway";

export function createModelGatewayQueries(gateway: ModelGatewayGateway) {
  function useModelGatewayConfig(enabled = true) {
    return useQuery({
      queryKey: queryKeys.modelGateway(),
      queryFn: ({ signal }) => gateway.fetchConfig(signal),
      enabled,
    });
  }

  function useSaveOfficialConfig() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: SaveOfficialConfigInput) =>
        gateway.saveOfficialConfig(input),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.modelGateway() });
      },
    });
  }

  function useEnableOfficial() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: () => gateway.enableOfficial(),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.modelGateway() });
      },
    });
  }

  function useInitCustomNewApi() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: InitCustomNewApiInput) =>
        gateway.initCustomNewApi(input),
      onSuccess: (data) => {
        if (data.ok === true) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.modelGateway(),
          });
        }
      },
    });
  }

  function useSaveProviderChannels() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: SaveProviderChannelsInput) =>
        gateway.saveProviderChannels(input),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.modelGateway() });
      },
    });
  }

  function useSyncProviderChannel() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: SyncProviderChannelInput) =>
        gateway.syncProviderChannel(input),
      onSuccess: (data) => {
        if (data.ok === true) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.modelGateway(),
          });
        }
      },
    });
  }

  function useSaveCustomChannel() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (
        input: CustomChannelInput & {
          newApiBaseUrl: string;
          database?: NewApiDatabaseConfigInput;
        },
      ) => gateway.saveCustomChannel(input),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.modelGateway() });
      },
    });
  }

  function useSaveMediaModels() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: SaveMediaModelsInput) =>
        gateway.saveMediaModels(input),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.modelGateway() });
      },
    });
  }

  function useSaveEmbeddingModel() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: SaveEmbeddingModelInput) =>
        gateway.saveEmbeddingModel(input),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.modelGateway() });
      },
    });
  }

  function useSaveMediaRelayConfig() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: SaveMediaRelayConfigInput) =>
        gateway.saveMediaRelayConfig(input),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.modelGateway() });
      },
    });
  }

  function useSaveCustomChannelsBatch() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: SaveCustomChannelsBatchInput) =>
        gateway.saveCustomChannelsBatch(input),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.modelGateway() });
      },
    });
  }

  return {
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
  };
}
