// Copyright (c) 2026 AI anime

export const VOICE_SOURCE_TYPES = [
  "voice_design",
  "preset_voice",
  "account_voice",
] as const;

export type VoiceSourceType = (typeof VOICE_SOURCE_TYPES)[number];

export function isVoiceSourceType(value: string): value is VoiceSourceType {
  return VOICE_SOURCE_TYPES.some((sourceType) => sourceType === value);
}

interface VoiceDesignModelOptionLike {
  readonly value: string;
  readonly config: { readonly defaultLanguage: string };
}

interface PresetVoiceModelOptionLike {
  readonly value: string;
  readonly voices: ReadonlyArray<{
    readonly value: string;
    readonly isDefault?: boolean;
  }>;
}

export function resolveVoiceDesignModelSelection(
  options: ReadonlyArray<VoiceDesignModelOptionLike>,
  selector: string,
): { selector: string; language: string } | null {
  const selected = options.find((option) => option.value === selector);
  return selected
    ? {
        selector: selected.value,
        language: selected.config.defaultLanguage,
      }
    : null;
}

export function resolvePresetVoiceModelSelection(
  options: ReadonlyArray<PresetVoiceModelOptionLike>,
  selector: string,
): { selector: string; voice: string } | null {
  const selected = options.find((option) => option.value === selector);
  if (!selected) return null;
  const defaultVoice =
    selected.voices.find((option) => option.isDefault) ?? selected.voices[0];
  return {
    selector: selected.value,
    voice: defaultVoice?.value ?? "",
  };
}

export interface AccountVoiceOption {
  readonly voiceId: string;
  readonly label: string;
  readonly previewUrl: string | null;
}

export type GeneratedVoiceBindingTarget =
  | {
      readonly kind: "character_slot";
      readonly characterName: string;
      readonly slot: string;
    }
  | {
      readonly kind: "identity";
      readonly characterName: string;
      readonly identityId: string;
    };

export interface GeneratedVoiceTaskReceipt {
  readonly taskType: "freezone_voice_design" | "freezone_voice_preset";
  readonly taskId: string | null;
  readonly taskKey: string;
  readonly scope: string;
}

export interface CreateVoiceDesignInput {
  readonly binding?: GeneratedVoiceBindingTarget;
  readonly language: string;
  readonly modelSelector: string;
  readonly name: string;
  readonly preferredName: string;
  readonly previewText: string;
  readonly responseFormat: "wav" | "mp3";
  readonly sampleRate: number;
  readonly voicePrompt: string;
}

export interface CreatePresetVoiceInput {
  readonly binding?: GeneratedVoiceBindingTarget;
  readonly modelSelector: string;
  readonly name: string;
  readonly text: string;
  readonly voice: string;
}

export interface AccountVoiceCatalog {
  createPresetVoice(
    project: string,
    input: CreatePresetVoiceInput,
  ): Promise<GeneratedVoiceTaskReceipt>;
  designVoice(
    project: string,
    input: CreateVoiceDesignInput,
  ): Promise<GeneratedVoiceTaskReceipt>;
  loadVoiceOptions(project: string): Promise<AccountVoiceOption[]>;
}
