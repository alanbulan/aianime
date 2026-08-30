// Copyright (c) 2026 AI anime
import { catalogRouteValue } from './catalog-route';

export const AUDIO_SPEECH_CATALOG_OPERATION = 'AUDIO_VOICE_CLONE';

export type AudioModelMode =
  | 'speech'
  | 'voiceClone'
  | 'voiceDesign'
  | 'music';

export interface AudioCatalogItem {
  code: string;
  displayName: string;
  capabilities: Record<string, unknown>;
  parameterSchema?: Record<string, unknown>;
  isDefault?: boolean;
}

export interface AudioModelOption {
  value: string;
  label: string;
  supportedModes: AudioModelMode[];
}

export interface AudioPresetVoiceOption {
  value: string;
  label: string;
  isDefault: boolean;
}

export interface AudioSpeechModelOption {
  value: string;
  label: string;
  voices: AudioPresetVoiceOption[];
  acceptsVoice: boolean;
  allowsCustomVoice: boolean;
  requiresVoice: boolean;
  isDefault: boolean;
}

export interface AudioVoiceDesignConfig {
  promptMinLength: number;
  promptMaxLength: number;
  previewTextMinLength: number;
  previewTextMaxLength: number;
  preferredName: string;
  languages: string[];
  defaultLanguage: string;
  sampleRates: number[];
  defaultSampleRate: number | null;
  responseFormats: string[];
  defaultResponseFormat: string;
}

export interface AudioVoiceDesignModelOption {
  value: string;
  label: string;
  config: AudioVoiceDesignConfig;
  isDefault: boolean;
}

export function resolveAudioModelSelector(
  options: readonly { value: string; isDefault?: boolean }[],
  preferred: string | null | undefined,
): string {
  const normalized = String(preferred ?? '').trim();
  if (options.some((option) => option.value === normalized)) return normalized;
  const defaults = options.filter((option) => option.isDefault === true);
  if (defaults.length === 1) return defaults[0]?.value ?? '';
  return options.length === 1 ? options[0]?.value ?? '' : '';
}

export function audioModelOptionsForMode(
  items: readonly AudioCatalogItem[],
  mode: AudioModelMode,
): AudioModelOption[] {
  return items
    .map(audioModelOptionFromCatalog)
    .filter(
      (item): item is AudioModelOption =>
        item !== null && item.supportedModes.includes(mode),
    );
}

export function audioModelOptionFromCatalog(
  item: AudioCatalogItem,
): AudioModelOption | null {
  const declaredModes =
    item.capabilities.supportedModes ??
    item.capabilities.audioModes ??
    item.capabilities.modes;
  const supportedModes = Array.from(
    new Set(
      (Array.isArray(declaredModes) ? declaredModes : [])
        .map(normalizeAudioMode)
        .filter((value): value is AudioModelMode => value !== null),
    ),
  );
  if (supportedModes.length === 0) return null;
  return {
    value: item.code,
    label: item.displayName,
    supportedModes,
  };
}

export function audioPresetVoiceOptions(
  item: Pick<AudioCatalogItem, 'parameterSchema'>,
): AudioPresetVoiceOption[] {
  const schema = item.parameterSchema;
  if (!schema || typeof schema !== 'object') return [];
  const properties = objectRecord(schema.properties);
  const voice = objectRecord(properties?.voice);
  if (!voice || !Array.isArray(voice.enum)) return [];

  const labels = Array.isArray(voice.enumLabels)
    ? voice.enumLabels
    : Array.isArray(voice['x-enum-labels'])
      ? voice['x-enum-labels']
      : [];
  const defaultValue = String(voice.default ?? '').trim();
  const seen = new Set<string>();
  return voice.enum.flatMap((rawValue, index) => {
    const value = String(rawValue ?? '').trim();
    if (!value || seen.has(value)) return [];
    seen.add(value);
    const rawLabel = labels[index];
    const label =
      typeof rawLabel === 'string' && rawLabel.trim()
        ? rawLabel.trim()
        : value;
    return [{ value, label, isDefault: value === defaultValue }];
  });
}

export function audioSpeechModelOptions(
  items: readonly AudioCatalogItem[],
): AudioSpeechModelOption[] {
  return items.map((item) => {
    const voices = audioPresetVoiceOptions(item);
    const schema = objectRecord(item.parameterSchema);
    const properties = objectRecord(schema?.properties);
    const schemaIsExplicit = Boolean(
      schema && Object.keys(schema).length > 0,
    );
    const acceptsVoice =
      voices.length > 0 || Boolean(properties?.voice) || !schemaIsExplicit;
    const required = Array.isArray(schema?.required) ? schema.required : [];
    return {
      value: catalogRouteValue(item),
      label: item.displayName,
      voices,
      acceptsVoice,
      allowsCustomVoice: acceptsVoice && voices.length === 0,
      requiresVoice:
        voices.length > 0 || required.some((value) => value === 'voice'),
      isDefault: item.isDefault === true,
    };
  });
}

export function audioVoiceDesignConfig(
  item: Pick<AudioCatalogItem, 'parameterSchema'>,
): AudioVoiceDesignConfig | null {
  const properties = objectRecord(item.parameterSchema?.properties);
  const voicePrompt = objectRecord(properties?.voice_prompt);
  const previewText = objectRecord(properties?.preview_text);
  const promptMaxLength = positiveInteger(voicePrompt?.maxLength);
  const previewTextMaxLength = positiveInteger(previewText?.maxLength);
  if (!promptMaxLength || !previewTextMaxLength) return null;

  const preferredNameSchema = objectRecord(properties?.preferred_name);
  const languageSchema = objectRecord(properties?.language);
  const sampleRateSchema = objectRecord(properties?.sample_rate);
  const responseFormatSchema = objectRecord(properties?.response_format);
  const languages = stringEnum(languageSchema?.enum);
  const sampleRates = numberEnum(sampleRateSchema?.enum);
  const responseFormats = stringEnum(responseFormatSchema?.enum).filter(
    (value) => value === 'wav' || value === 'mp3',
  );
  const defaultLanguage = enumDefault(languageSchema?.default, languages);
  const defaultSampleRate = numberEnumDefault(
    sampleRateSchema?.default,
    sampleRates,
  );
  const defaultResponseFormat = enumDefault(
    responseFormatSchema?.default,
    responseFormats,
  );
  if (
    languages.length === 0 ||
    !defaultLanguage ||
    sampleRates.length === 0 ||
    defaultSampleRate === null ||
    responseFormats.length === 0 ||
    !defaultResponseFormat
  ) {
    return null;
  }
  return {
    promptMinLength: positiveInteger(voicePrompt?.minLength) ?? 1,
    promptMaxLength,
    previewTextMinLength: positiveInteger(previewText?.minLength) ?? 1,
    previewTextMaxLength,
    preferredName: String(preferredNameSchema?.default ?? '').trim(),
    languages,
    defaultLanguage,
    sampleRates,
    defaultSampleRate,
    responseFormats,
    defaultResponseFormat,
  };
}

export function audioVoiceDesignModelOptions(
  items: readonly AudioCatalogItem[],
): AudioVoiceDesignModelOption[] {
  return items.flatMap((item) => {
    const config = audioVoiceDesignConfig(item);
    if (!config) return [];
    return [
      {
        value: catalogRouteValue(item),
        label: item.displayName,
        config,
        isDefault: item.isDefault === true,
      },
    ];
  });
}

export function audioEmotionPromptSupported(
  item: Pick<AudioCatalogItem, 'capabilities' | 'parameterSchema'> | null | undefined,
): boolean {
  if (!item) return false;
  for (const key of [
    'supportsEmotionPrompt',
    'emotionPrompt',
    'expressivePrompt',
  ]) {
    if (item.capabilities[key] === true) return true;
  }
  const properties = objectRecord(item.parameterSchema?.properties);
  return Boolean(
    properties?.emotion_prompt ||
      properties?.emotionPrompt ||
      properties?.expressive_prompt,
  );
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

function stringEnum(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean)),
  );
}

function numberEnum(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter(
        (item): item is number =>
          typeof item === 'number' && Number.isSafeInteger(item) && item > 0,
      ),
    ),
  );
}

function enumDefault(value: unknown, options: readonly string[]): string {
  const normalized = String(value ?? '').trim();
  return options.includes(normalized) ? normalized : options[0] ?? '';
}

function numberEnumDefault(
  value: unknown,
  options: readonly number[],
): number | null {
  return typeof value === 'number' && options.includes(value)
    ? value
    : options[0] ?? null;
}

function normalizeAudioMode(value: unknown): AudioModelMode | null {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (
    normalized === 'speech' ||
    normalized === 'texttospeech' ||
    normalized === 'speechsynthesis'
  ) {
    return 'speech';
  }
  if (normalized === 'voiceclone') return 'voiceClone';
  if (normalized === 'voicedesign') return 'voiceDesign';
  if (
    normalized === 'music' ||
    normalized === 'texttomusic' ||
    normalized === 'musicgeneration'
  ) {
    return 'music';
  }
  return null;
}
