// Copyright (c) 2026 AI anime
import { jsonWithBackendError } from "@/shared/api/errors";
import { p } from "@/shared/api/path";
import { api, uploadApi } from "@/shared/api/transport";
import type {
  AssetDataResponse,
  AssetErrorResponse,
  AssetResponse,
  AssetTaskResponse,
  CharacterGateway,
  CharacterUpdateResponse,
} from "@/modules/asset_world/application/ports";
import type {
  Character,
  CharacterAssetHistory,
  CharacterAssetRestoreResult,
  CharacterVoiceSamples,
  CharacterVoiceSlot,
  Identity,
  IdentityAttempts,
} from "@/modules/asset_world/domain/character";

function linkedApiPath(url: string): string {
  return url.replace(/^\/+/, "");
}

export const httpCharacterGateway: CharacterGateway = {
  async listCharacters(project, signal) {
    return api
      .get(p`api/v1/projects/${project}/characters`, { signal })
      .json<AssetDataResponse<Character[]>>();
  },

  async buildCharacters(project) {
    return jsonWithBackendError<AssetTaskResponse | AssetErrorResponse>(
      api.post(p`api/v1/projects/${project}/characters/build`, {
        json: {},
        throwHttpErrors: false,
      }),
    );
  },

  async createCharacter(project, input) {
    return api
      .post(p`api/v1/projects/${project}/characters`, { json: input })
      .json<AssetDataResponse<Character>>();
  },

  async updateCharacter(project, name, input) {
    return api
      .patch(p`api/v1/projects/${project}/characters/${name}`, {
        json: input,
      })
      .json<AssetDataResponse<CharacterUpdateResponse>>();
  },

  async deleteCharacter(project, name) {
    return api
      .post(p`api/v1/projects/${project}/characters/${name}/delete`)
      .json<AssetDataResponse<unknown>>();
  },

  async schedulePortrait(project, name, input) {
    return jsonWithBackendError<AssetTaskResponse | AssetErrorResponse>(
      api.post(
        p`api/v1/projects/${project}/characters/${name}/portrait-async`,
        {
          json: input ?? {},
          throwHttpErrors: false,
        },
      ),
    );
  },

  async uploadPortrait(project, name, file) {
    const formData = new FormData();
    formData.append("file", file);
    return uploadApi
      .post(p`api/v1/projects/${project}/characters/${name}/portrait/upload`, {
        body: formData,
      })
      .json<AssetDataResponse<{ portrait_url: string }>>();
  },

  async getAssetHistory(historyUrl, signal) {
    return api
      .get(linkedApiPath(historyUrl), { signal })
      .json<AssetResponse<CharacterAssetHistory>>();
  },

  async restoreAsset({
    restoreUrl,
    kind,
    historyId,
    identityId,
  }) {
    return jsonWithBackendError<
      AssetResponse<CharacterAssetRestoreResult>
    >(
      api.post(linkedApiPath(restoreUrl), {
        json: {
          kind,
          history_id: historyId,
          identity_id: identityId || undefined,
        },
        throwHttpErrors: false,
      }),
    );
  },

  async getVoiceSamples(project, name, signal) {
    return api
      .get(p`api/v1/projects/${project}/characters/${name}/voice-samples`, {
        signal,
      })
      .json<AssetDataResponse<CharacterVoiceSamples>>();
  },

  async uploadVoiceSample(project, name, { slot, file }) {
    const formData = new FormData();
    formData.append("file", file, file.name);
    return uploadApi
      .post(
        p`api/v1/projects/${project}/characters/${name}/voice-samples/${slot}/upload`,
        { body: formData },
      )
      .json<AssetResponse<CharacterVoiceSlot>>();
  },

  async recordVoiceSample(project, name, { slot, dataUrl }) {
    return api
      .post(
        p`api/v1/projects/${project}/characters/${name}/voice-samples/${slot}/record`,
        { json: { data_url: dataUrl } },
      )
      .json<AssetResponse<CharacterVoiceSlot>>();
  },

  async trimVoiceSample(
    project,
    name,
    { slot, sourcePath, startSeconds, durationSeconds },
  ) {
    return api
      .post(
        p`api/v1/projects/${project}/characters/${name}/voice-samples/${slot}/trim`,
        {
          json: {
            source_path: sourcePath,
            start_seconds: startSeconds,
            duration_seconds: durationSeconds,
          },
        },
      )
      .json<AssetResponse<CharacterVoiceSlot>>();
  },

  async deleteVoiceSample(project, name, slot) {
    return api
      .post(
        p`api/v1/projects/${project}/characters/${name}/voice-samples/${slot}/delete`,
      )
      .json<AssetResponse<CharacterVoiceSlot>>();
  },

  async listIdentities(project, name, signal) {
    return api
      .get(p`api/v1/projects/${project}/characters/${name}/identities`, {
        signal,
      })
      .json<AssetDataResponse<Identity[]>>();
  },

  async createIdentity(project, name, input) {
    return api
      .post(p`api/v1/projects/${project}/characters/${name}/identities`, {
        json: input,
      })
      .json<AssetDataResponse<Identity>>();
  },

  async updateIdentity(project, name, identityId, input) {
    return api
      .patch(
        p`api/v1/projects/${project}/characters/${name}/identities/${identityId}`,
        { json: input },
      )
      .json<AssetDataResponse<Identity>>();
  },

  async deleteIdentity(project, name, identityId) {
    return api
      .delete(
        p`api/v1/projects/${project}/characters/${name}/identities/${identityId}`,
      )
      .json<AssetDataResponse<unknown>>();
  },

  async scheduleIdentityImage(project, name, identityId, body) {
    return jsonWithBackendError<AssetTaskResponse | AssetErrorResponse>(
      api.post(
        p`api/v1/projects/${project}/characters/${name}/identities/${identityId}/generate-async`,
        { json: body, throwHttpErrors: false },
      ),
    );
  },

  async uploadIdentityImage(project, name, identityName, file) {
    const formData = new FormData();
    formData.append("file", file);
    return uploadApi
      .post(
        p`api/v1/projects/${project}/characters/${name}/identities/${identityName}/upload`,
        { body: formData },
      )
      .json<AssetDataResponse<{ image_url: string }>>();
  },

  async uploadIdentityCostume(project, name, identityId, file) {
    const formData = new FormData();
    formData.append("file", file);
    return uploadApi
      .post(
        p`api/v1/projects/${project}/characters/${name}/identities/${identityId}/costume/upload`,
        { body: formData },
      )
      .json<AssetDataResponse<{ costume_image_url: string }>>();
  },

  async deleteIdentityCostume(project, name, identityId) {
    return api
      .post(
        p`api/v1/projects/${project}/characters/${name}/identities/${identityId}/costume/delete`,
      )
      .json<AssetDataResponse<{ deleted: boolean }>>();
  },

  async deleteIdentityImage(project, name, identityId) {
    return api
      .post(
        p`api/v1/projects/${project}/characters/${name}/identities/${identityId}/image/delete`,
      )
      .json<AssetDataResponse<{ deleted: boolean }>>();
  },

  async uploadIdentityPortrait(project, name, identityId, file) {
    const formData = new FormData();
    formData.append("file", file);
    return uploadApi
      .post(
        p`api/v1/projects/${project}/characters/${name}/identities/${identityId}/portrait/upload`,
        { body: formData },
      )
      .json<AssetDataResponse<{ portrait_image_url: string }>>();
  },

  async scheduleIdentityPortrait(project, name, identityId, body) {
    return jsonWithBackendError<AssetTaskResponse | AssetErrorResponse>(
      api.post(
        p`api/v1/projects/${project}/characters/${name}/identities/${identityId}/portrait/generate-async`,
        { json: body, throwHttpErrors: false },
      ),
    );
  },

  async getIdentityAttempts(project, name, identityId, signal) {
    return api
      .get(
        p`api/v1/projects/${project}/characters/${name}/identities/${identityId}/attempts`,
        { signal },
      )
      .json<AssetResponse<IdentityAttempts>>();
  },
};
