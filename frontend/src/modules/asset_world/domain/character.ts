// Copyright (c) 2026 AI anime
export interface CharacterVoiceSample {
  path: string;
  sha256?: string;
  updated_at?: string;
}

export type CharacterVoiceSlotId =
  | "default"
  | "child"
  | "youth"
  | "middle"
  | "elder";

export interface CharacterVoiceSlot {
  slot: CharacterVoiceSlotId | string;
  label: string;
  path: string;
  url: string;
  sha256: string;
  updated_at: string;
  inherited_from_default: boolean;
  required: boolean;
}

export interface CharacterVoiceSamples {
  character: string;
  slots: CharacterVoiceSlot[];
}

export type CharacterAssetKind =
  | "portrait"
  | "identity"
  | "identity_costume"
  | "identity_portrait";

export interface CharacterAssetHistoryEntry {
  history_id: string;
  filename: string;
  url: string;
  created_at?: string;
  bytes?: number;
}

export interface CharacterAssetHistory {
  kind: CharacterAssetKind;
  identity_id?: string;
  current_url?: string | null;
  entries: CharacterAssetHistoryEntry[];
}

export interface CharacterAssetRestoreResult {
  kind: CharacterAssetKind;
  identity_id?: string;
  restored: boolean;
  url: string;
  backup_history_id?: string;
}

export interface Character {
  name: string;
  display_name?: string;
  aliases?: string[];
  description?: string;
  role?: string;
  gender?: string;
  age_group?: string;
  is_main?: boolean;
  face_prompt?: string;
  body_type?: string;
  reference_audio_path?: string;
  reference_audio_url?: string;
  reference_audio_sha256?: string;
  reference_audio_updated_at?: string;
  voice_samples_by_age_group?: Record<string, CharacterVoiceSample>;
  portrait_path?: string | null;
  portrait_url?: string | null;
  identities?: Identity[];
  history_url?: string;
  restore_url?: string;
}

export interface Identity {
  id?: string;
  identity_id: string;
  identity_name: string;
  name?: string;
  url?: string;
  appearance_details?: string;
  face_prompt?: string;
  age_group?: string;
  body_type?: string;
  reference_audio_path?: string;
  reference_audio_url?: string;
  reference_audio_sha256?: string;
  reference_audio_updated_at?: string;
  image_path?: string | null;
  image_url?: string | null;
  costume_image_path?: string | null;
  costume_image_url?: string | null;
  portrait_image_path?: string | null;
  portrait_image_url?: string | null;
  history_url?: string;
  restore_url?: string;
  costume_history_url?: string;
  portrait_history_url?: string;
}

export interface IdentityAttempts {
  image_attempts: number;
  portrait_attempts: number;
}

export interface CharacterImageSelection {
  character_image_selection: string;
  options: Record<string, string>;
}

export type AssetImageSourceKind = "character" | "scene" | "prop";

export interface AssetImageSourceSelection {
  asset_kind: AssetImageSourceKind;
  image_source_selection: string;
  options: Record<string, string>;
}

export type AssetTab = "characters" | "scenes" | "props" | "voices";

export type AssetRefType = "identity" | "scene" | "prop";

export interface BeatReference {
  episode: number;
  beatNumber: number;
}

export interface SceneCoOccurrence {
  identities: string[];
  props: string[];
}

export interface AssetReferenceIndex {
  referencesFor(type: AssetRefType, id: string): BeatReference[];
  countFor(type: AssetRefType, id: string): number;
  coOccurrenceForScene(sceneId: string): SceneCoOccurrence;
  isLoading: boolean;
}

export interface CharacterMainCopy {
  label: string;
  makeMain: string;
  unsetMain: string;
  mainSet: string;
  mainUnset: string;
}

const DRAMA_MAIN_COPY: CharacterMainCopy = {
  label: "主角",
  makeMain: "设为主角",
  unsetMain: "取消主角",
  mainSet: "已设为主角",
  mainUnset: "已取消主角",
};

const NARRATED_MAIN_COPY: CharacterMainCopy = {
  label: "解说主角",
  makeMain: "设为解说主角",
  unsetMain: "取消解说主角",
  mainSet: "已设为解说主角",
  mainUnset: "已取消解说主角",
};

export function characterMainCopyForSpineTemplate(
  spineTemplate: string | null | undefined,
): CharacterMainCopy {
  return spineTemplate === "narrated" ? NARRATED_MAIN_COPY : DRAMA_MAIN_COPY;
}

const CHARACTER_SEARCH_FIELDS = [
  "name",
  "aliases",
  "description",
  "role",
  "gender",
  "age_group",
  "body_type",
  "face_prompt",
] as const;

type CharacterSearchField = (typeof CHARACTER_SEARCH_FIELDS)[number];
type CharacterSearchValue =
  | string
  | readonly (string | null | undefined)[]
  | null
  | undefined;

export type SearchableCharacter = Partial<
  Record<CharacterSearchField, CharacterSearchValue>
>;

export function filterCharacters<T extends SearchableCharacter>(
  characters: readonly T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...characters];

  return characters.filter((character) =>
    CHARACTER_SEARCH_FIELDS.some((field) =>
      normalizeSearchValue(character[field]).includes(needle),
    ),
  );
}

function normalizeSearchValue(value: CharacterSearchValue): string {
  if (typeof value === "string") return value.toLowerCase();
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(" ").toLowerCase();
  }
  return "";
}
