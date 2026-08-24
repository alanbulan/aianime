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

export interface NarratorVoiceSourceOption {
  label: string;
  path: string;
  rel_path: string;
}

export interface NarratorVoiceSourcesData {
  options: NarratorVoiceSourceOption[];
}

export interface NarratorVoicePresetOption {
  label: string;
  value: string;
  isDefault?: boolean;
}

export interface NarratorVoiceDesignConfig {
  promptMaxLength: number;
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
