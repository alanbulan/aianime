// Copyright (c) 2026 AI anime
import { useMemo } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { QueryFunctionContext } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";
import type {
  AssetDataResponse,
  AssetResponse,
  CharacterGateway,
  CharacterGenerationInput,
  CreateCharacterInput,
  CreateIdentityInput,
  IdentityGenerationBody,
  IdentityGenerationInput,
  RecordVoiceSampleInput,
  RestoreCharacterAssetInput,
  TrimVoiceSampleInput,
  UpdateIdentityInput,
  UploadVoiceSampleInput,
} from "@/modules/asset_world/application/ports";
import type {
  Character,
  CharacterVoiceSlot,
} from "@/modules/asset_world/domain/character";

function identityGenerationPayload(input: IdentityGenerationInput): {
  identityId: string;
  body: IdentityGenerationBody;
} {
  if (typeof input === "string") {
    return { identityId: input, body: {} };
  }
  const { identityId, style, model } = input;
  return {
    identityId,
    body: { style, model },
  };
}

export function createCharacterQueryHooks(gateway: CharacterGateway) {
  function useCharacters(project: string) {
    return useQuery({
      queryKey: queryKeys.characters(project),
      queryFn: ({ signal }) => gateway.listCharacters(project, signal),
      enabled: Boolean(project),
    });
  }

  function useBuildCharacters(project: string) {
    return useMutation({
      mutationFn: () => gateway.buildCharacters(project),
    });
  }

  function useCreateCharacter(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: CreateCharacterInput) =>
        gateway.createCharacter(project, input),
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.characters(project),
        }),
    });
  }

  function useUpdateCharacter(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: Partial<Character>) =>
        gateway.updateCharacter(project, name, input),
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.characters(project),
        }),
    });
  }

  function useDeleteCharacter(project: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (name: string) => gateway.deleteCharacter(project, name),
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.characters(project),
        }),
    });
  }

  function useGeneratePortraitAsync(project: string, name: string) {
    return useMutation({
      mutationFn: (input?: CharacterGenerationInput) =>
        gateway.schedulePortrait(project, name, input),
    });
  }

  function useUploadPortrait(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (file: File) => gateway.uploadPortrait(project, name, file),
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.characters(project),
        }),
    });
  }

  function useCharacterAssetHistory(
    project: string,
    name: string,
    historyUrl: string | undefined,
    options: { enabled?: boolean } = {},
  ) {
    const enabled = options.enabled ?? true;
    return useQuery({
      queryKey: queryKeys.characterAssetHistory(
        project,
        name,
        historyUrl ?? "",
      ),
      queryFn: ({ signal }) =>
        gateway.getAssetHistory(historyUrl ?? "", signal),
      enabled: Boolean(project && name && historyUrl && enabled),
    });
  }

  function useRestoreCharacterAsset(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: RestoreCharacterAssetInput) =>
        gateway.restoreAsset(input),
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.characters(project),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.identities(project, name),
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.characterAssetHistories(project, name),
        });
      },
    });
  }

  function invalidateCharacterVoiceQueries(
    queryClient: ReturnType<typeof useQueryClient>,
    project: string,
    name: string,
  ) {
    queryClient.invalidateQueries({
      queryKey: queryKeys.characters(project),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.characterVoiceSamples(project, name),
    });
  }

  function updateCharacterVoiceCache(
    queryClient: ReturnType<typeof useQueryClient>,
    project: string,
    name: string,
    response: AssetResponse<CharacterVoiceSlot>,
  ) {
    if (!response.ok) return;
    const slot = response.data;
    const slotId = String(slot.slot);
    queryClient.setQueryData<AssetDataResponse<Character[]> | undefined>(
      queryKeys.characters(project),
      (current) => {
        if (!current?.ok) return current;
        return {
          ...current,
          data: current.data.map((character) => {
            if (character.name !== name) return character;
            if (slotId === "default") {
              return {
                ...character,
                reference_audio_path: slot.path,
                reference_audio_url: slot.url,
                reference_audio_sha256: slot.sha256,
                reference_audio_updated_at: slot.updated_at,
              };
            }
            const voiceSamples = {
              ...(character.voice_samples_by_age_group ?? {}),
            };
            if (slot.path) {
              voiceSamples[slotId] = {
                path: slot.path,
                sha256: slot.sha256,
                updated_at: slot.updated_at,
              };
            } else {
              delete voiceSamples[slotId];
            }
            return {
              ...character,
              voice_samples_by_age_group: voiceSamples,
            };
          }),
        };
      },
    );
  }

  function handleCharacterVoiceMutationSuccess(
    queryClient: ReturnType<typeof useQueryClient>,
    project: string,
    name: string,
    response: AssetResponse<CharacterVoiceSlot>,
  ) {
    updateCharacterVoiceCache(queryClient, project, name, response);
    invalidateCharacterVoiceQueries(queryClient, project, name);
  }

  function useCharacterVoiceSamples(project: string, name: string) {
    return useQuery({
      queryKey: queryKeys.characterVoiceSamples(project, name),
      queryFn: ({ signal }) => gateway.getVoiceSamples(project, name, signal),
      enabled: Boolean(project && name),
    });
  }

  function useUploadCharacterVoiceSample(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: UploadVoiceSampleInput) =>
        gateway.uploadVoiceSample(project, name, input),
      onSuccess: (response) =>
        handleCharacterVoiceMutationSuccess(
          queryClient,
          project,
          name,
          response,
        ),
    });
  }

  function useRecordCharacterVoiceSample(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: RecordVoiceSampleInput) =>
        gateway.recordVoiceSample(project, name, input),
      onSuccess: (response) =>
        handleCharacterVoiceMutationSuccess(
          queryClient,
          project,
          name,
          response,
        ),
    });
  }

  function useTrimCharacterVoiceSample(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: TrimVoiceSampleInput) =>
        gateway.trimVoiceSample(project, name, input),
      onSuccess: (response) =>
        handleCharacterVoiceMutationSuccess(
          queryClient,
          project,
          name,
          response,
        ),
    });
  }

  function useDeleteCharacterVoiceSample(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (slot: string) =>
        gateway.deleteVoiceSample(project, name, slot),
      onSuccess: (response) =>
        handleCharacterVoiceMutationSuccess(
          queryClient,
          project,
          name,
          response,
        ),
    });
  }

  function useCharacterIdentities(project: string, name: string) {
    return useQuery({
      queryKey: queryKeys.identities(project, name),
      queryFn: ({ signal }) => gateway.listIdentities(project, name, signal),
      enabled: Boolean(project && name),
    });
  }

  function useIdentityOwnerIndex(project: string) {
    const charactersQuery = useQuery({
      queryKey: queryKeys.characters(project),
      queryFn: ({ signal }) => gateway.listCharacters(project, signal),
      enabled: Boolean(project),
    });

    const names = useMemo(
      () => (charactersQuery.data?.data ?? []).map((character) => character.name),
      [charactersQuery.data?.data],
    );

    const identityQueries = useQueries({
      queries: names.map((name) => ({
        queryKey: queryKeys.identities(project, name),
        queryFn: ({ signal }: QueryFunctionContext) =>
          gateway.listIdentities(project, name, signal),
        enabled: Boolean(project && name),
      })),
    });

    const dataSignature = identityQueries
      .map((query) => query.dataUpdatedAt)
      .join(",");
    const identitiesByCharacter = identityQueries.map(
      (query) => query.data?.data,
    );

    const ownerById = useMemo(() => {
      const owners = new Map<string, string>();
      identitiesByCharacter.forEach((identities, index) => {
        const name = names[index];
        if (!identities) return;
        for (const identity of identities) {
          owners.set(identity.identity_id, name);
        }
      });
      return owners;
    }, [names, dataSignature]);

    return {
      ownerOf: (identityId: string) => ownerById.get(identityId) ?? null,
      isLoading:
        charactersQuery.isLoading ||
        identityQueries.some((query) => query.isLoading),
    };
  }

  function useCreateIdentity(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (input: CreateIdentityInput) =>
        gateway.createIdentity(project, name, input),
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.identities(project, name),
        }),
    });
  }

  function useUpdateIdentity(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({
        identityId,
        data,
      }: {
        identityId: string;
        data: UpdateIdentityInput;
      }) => gateway.updateIdentity(project, name, identityId, data),
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.identities(project, name),
        }),
    });
  }

  function useDeleteIdentity(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (identityId: string) =>
        gateway.deleteIdentity(project, name, identityId),
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.identities(project, name),
        }),
    });
  }

  function useGenerateIdentityImageAsync(project: string, name: string) {
    return useMutation({
      mutationFn: (input: IdentityGenerationInput) => {
        const { identityId, body } = identityGenerationPayload(input);
        return gateway.scheduleIdentityImage(project, name, identityId, body);
      },
    });
  }

  function useUploadIdentityImage(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({
        identityName,
        file,
      }: {
        identityName: string;
        file: File;
      }) => gateway.uploadIdentityImage(project, name, identityName, file),
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.identities(project, name),
        }),
    });
  }

  function useUploadCostumeImage(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({
        identityId,
        file,
      }: {
        identityId: string;
        file: File;
      }) => gateway.uploadIdentityCostume(project, name, identityId, file),
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.identities(project, name),
        }),
    });
  }

  function useDeleteIdentityCostume(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (identityId: string) =>
        gateway.deleteIdentityCostume(project, name, identityId),
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.identities(project, name),
        }),
    });
  }

  function useDeleteIdentityImage(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (identityId: string) =>
        gateway.deleteIdentityImage(project, name, identityId),
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.identities(project, name),
        }),
    });
  }

  function useUploadIdentityPortrait(project: string, name: string) {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({
        identityId,
        file,
      }: {
        identityId: string;
        file: File;
      }) => gateway.uploadIdentityPortrait(project, name, identityId, file),
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: queryKeys.identities(project, name),
        }),
    });
  }

  function useGenerateIdentityPortraitAsync(project: string, name: string) {
    return useMutation({
      mutationFn: (input: IdentityGenerationInput) => {
        const { identityId, body } = identityGenerationPayload(input);
        return gateway.scheduleIdentityPortrait(
          project,
          name,
          identityId,
          body,
        );
      },
    });
  }

  function useIdentityAttempts(
    project: string,
    name: string,
    identityId: string | undefined,
  ) {
    return useQuery({
      queryKey: [
        ...queryKeys.identities(project, name),
        identityId,
        "attempts",
      ],
      queryFn: ({ signal }) =>
        gateway.getIdentityAttempts(
          project,
          name,
          identityId as string,
          signal,
        ),
      enabled: Boolean(project && name && identityId),
      staleTime: 0,
    });
  }

  return {
    useBuildCharacters,
    useCharacterAssetHistory,
    useCharacterIdentities,
    useCharacters,
    useCharacterVoiceSamples,
    useCreateCharacter,
    useCreateIdentity,
    useDeleteCharacter,
    useDeleteCharacterVoiceSample,
    useDeleteIdentity,
    useDeleteIdentityCostume,
    useDeleteIdentityImage,
    useGenerateIdentityImageAsync,
    useGenerateIdentityPortraitAsync,
    useGeneratePortraitAsync,
    useIdentityAttempts,
    useIdentityOwnerIndex,
    useRecordCharacterVoiceSample,
    useRestoreCharacterAsset,
    useTrimCharacterVoiceSample,
    useUpdateCharacter,
    useUpdateIdentity,
    useUploadCharacterVoiceSample,
    useUploadCostumeImage,
    useUploadIdentityImage,
    useUploadIdentityPortrait,
    useUploadPortrait,
  };
}

export type CharacterQueryHooks = ReturnType<typeof createCharacterQueryHooks>;
