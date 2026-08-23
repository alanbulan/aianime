// Copyright (c) 2026 AI anime
import type { Style } from "@/modules/asset_world/domain/style";
import type {
  AssetImageSourceKind,
  AssetImageSourceSelection,
  Character,
  CharacterAssetHistory,
  CharacterAssetKind,
  CharacterAssetRestoreResult,
  CharacterImageSelection,
  CharacterVoiceSamples,
  CharacterVoiceSlot,
  Identity,
  IdentityAttempts,
} from "@/modules/asset_world/domain/character";

export interface AssetDataResponse<T> {
  ok: true;
  data: T;
}

export interface AssetErrorResponse {
  ok: false;
  error: string;
  code?: string;
}

export type AssetResponse<T> = AssetDataResponse<T> | AssetErrorResponse;

export interface AssetTaskResponse {
  ok: true;
  task_type: string;
  task_id?: string;
  task_key?: string;
  message: string;
  scope?: string;
}

export interface CreateStyleInput {
  id: string;
  name: string;
  config: Record<string, unknown>;
  preview_path?: string | null;
}

export interface UpdateStyleInput {
  id: string;
  name: string;
  config: Record<string, unknown>;
}

export interface CreateCharacterInput {
  name: string;
  role?: string;
  gender?: string;
  is_main?: boolean;
  description?: string;
  face_prompt?: string;
}

export interface CharacterUpdateResponse {
  name: string;
  updated_fields: string[];
  renamed_from?: string;
}

export interface CharacterGenerationInput {
  style?: string;
  ethnicity?: string;
  model?: string;
}

export interface IdentityGenerationInputObject {
  identityId: string;
  style?: string;
  model?: string;
}

export type IdentityGenerationInput = string | IdentityGenerationInputObject;

export interface IdentityGenerationBody {
  style?: string;
  model?: string;
}

export interface CreateIdentityInput {
  identity_name: string;
  age_group?: string;
  appearance_details?: string;
}

export interface UpdateIdentityInput {
  identity_name?: string;
  appearance_details?: string;
  face_prompt?: string;
  age_group?: string;
  body_type?: string;
}

export interface RestoreCharacterAssetInput {
  restoreUrl: string;
  kind: CharacterAssetKind;
  historyId: string;
  identityId?: string;
}

export interface UploadVoiceSampleInput {
  slot: string;
  file: File;
}

export interface RecordVoiceSampleInput {
  slot: string;
  dataUrl: string;
}

export interface TrimVoiceSampleInput {
  slot: string;
  sourcePath: string;
  startSeconds: number;
  durationSeconds: number;
}

export interface CharacterGateway {
  listCharacters(
    project: string,
    signal?: AbortSignal,
  ): Promise<AssetDataResponse<Character[]>>;
  buildCharacters(
    project: string,
  ): Promise<AssetTaskResponse | AssetErrorResponse>;
  createCharacter(
    project: string,
    input: CreateCharacterInput,
  ): Promise<AssetDataResponse<Character>>;
  updateCharacter(
    project: string,
    name: string,
    input: Partial<Character>,
  ): Promise<AssetDataResponse<CharacterUpdateResponse>>;
  deleteCharacter(
    project: string,
    name: string,
  ): Promise<AssetDataResponse<unknown>>;
  schedulePortrait(
    project: string,
    name: string,
    input?: CharacterGenerationInput,
  ): Promise<AssetTaskResponse | AssetErrorResponse>;
  uploadPortrait(
    project: string,
    name: string,
    file: File,
  ): Promise<AssetDataResponse<{ portrait_url: string }>>;
  getAssetHistory(
    historyUrl: string,
    signal?: AbortSignal,
  ): Promise<AssetResponse<CharacterAssetHistory>>;
  restoreAsset(
    input: RestoreCharacterAssetInput,
  ): Promise<AssetResponse<CharacterAssetRestoreResult>>;
  getVoiceSamples(
    project: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<AssetDataResponse<CharacterVoiceSamples>>;
  uploadVoiceSample(
    project: string,
    name: string,
    input: UploadVoiceSampleInput,
  ): Promise<AssetResponse<CharacterVoiceSlot>>;
  recordVoiceSample(
    project: string,
    name: string,
    input: RecordVoiceSampleInput,
  ): Promise<AssetResponse<CharacterVoiceSlot>>;
  trimVoiceSample(
    project: string,
    name: string,
    input: TrimVoiceSampleInput,
  ): Promise<AssetResponse<CharacterVoiceSlot>>;
  deleteVoiceSample(
    project: string,
    name: string,
    slot: string,
  ): Promise<AssetResponse<CharacterVoiceSlot>>;
  listIdentities(
    project: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<AssetDataResponse<Identity[]>>;
  createIdentity(
    project: string,
    name: string,
    input: CreateIdentityInput,
  ): Promise<AssetDataResponse<Identity>>;
  updateIdentity(
    project: string,
    name: string,
    identityId: string,
    input: UpdateIdentityInput,
  ): Promise<AssetDataResponse<Identity>>;
  deleteIdentity(
    project: string,
    name: string,
    identityId: string,
  ): Promise<AssetDataResponse<unknown>>;
  scheduleIdentityImage(
    project: string,
    name: string,
    identityId: string,
    body: IdentityGenerationBody,
  ): Promise<AssetTaskResponse | AssetErrorResponse>;
  uploadIdentityImage(
    project: string,
    name: string,
    identityName: string,
    file: File,
  ): Promise<AssetDataResponse<{ image_url: string }>>;
  uploadIdentityCostume(
    project: string,
    name: string,
    identityId: string,
    file: File,
  ): Promise<AssetDataResponse<{ costume_image_url: string }>>;
  deleteIdentityCostume(
    project: string,
    name: string,
    identityId: string,
  ): Promise<AssetDataResponse<{ deleted: boolean }>>;
  deleteIdentityImage(
    project: string,
    name: string,
    identityId: string,
  ): Promise<AssetDataResponse<{ deleted: boolean }>>;
  uploadIdentityPortrait(
    project: string,
    name: string,
    identityId: string,
    file: File,
  ): Promise<AssetDataResponse<{ portrait_image_url: string }>>;
  scheduleIdentityPortrait(
    project: string,
    name: string,
    identityId: string,
    body: IdentityGenerationBody,
  ): Promise<AssetTaskResponse | AssetErrorResponse>;
  getIdentityAttempts(
    project: string,
    name: string,
    identityId: string,
    signal?: AbortSignal,
  ): Promise<AssetResponse<IdentityAttempts>>;
}

export interface AssetImageSourceGateway {
  getAssetImageSourceSelection(
    project: string,
    kind: AssetImageSourceKind,
    signal?: AbortSignal,
  ): Promise<AssetDataResponse<AssetImageSourceSelection>>;
  getCharacterImageSelection(
    project: string,
    signal?: AbortSignal,
  ): Promise<AssetDataResponse<CharacterImageSelection>>;
  updateAssetImageSourceSelection(
    project: string,
    kind: AssetImageSourceKind,
    imageSourceSelection: string,
  ): Promise<AssetDataResponse<AssetImageSourceSelection>>;
}

export interface AssetWorldGateway {
  listStyles(
    signal?: AbortSignal,
  ): Promise<AssetDataResponse<Style[]>>;
  getStyle(
    styleId: string,
    signal?: AbortSignal,
  ): Promise<AssetDataResponse<Style>>;
  createStyle(input: CreateStyleInput): Promise<AssetResponse<{ id: string }>>;
  updateStyle(input: UpdateStyleInput): Promise<AssetResponse<{ id: string }>>;
  deleteStyle(styleId: string): Promise<AssetDataResponse<unknown>>;
  analyzeStyle(
    project: string,
    file: File,
  ): Promise<AssetResponse<Record<string, unknown>>>;
  uploadStylePreview(
    input: { file: File; styleId: string },
  ): Promise<AssetResponse<{ preview_path: string }>>;
}
