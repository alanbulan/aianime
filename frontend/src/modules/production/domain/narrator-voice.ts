// Copyright (c) 2026 AI anime

export interface NarratorVoiceStatusData {
  narration_style: string;
  source: string;
  reference_path: string;
  reference_url?: string;
  reference_sha256?: string;
  heading: string;
  detail: string;
  explanation: string;
  character_name?: string;
  identity_id?: string;
  identity_name?: string;
  error?: string;
  is_first_person: boolean;
}

export interface NarratorVoicePresetOption {
  label: string;
  value: string;
  isDefault?: boolean;
}

export interface NarratorVoicePresetModelOption {
  value: string;
  label: string;
  voices: NarratorVoicePresetOption[];
  acceptsVoice: boolean;
  allowsCustomVoice: boolean;
  requiresVoice: boolean;
  isDefault?: boolean;
}

export interface NarratorVoiceDesignConfig {
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

export interface GenerateNarratorVoicePresetCommand {
  name: string;
  model_selector: string;
  text: string;
  voice: string;
}

export interface GenerateNarratorVoiceDesignCommand {
  name: string;
  model_selector: string;
  voice_prompt: string;
  preview_text: string;
  preferred_name: string;
  language: string;
  sample_rate: number;
  response_format: "wav" | "mp3";
}
