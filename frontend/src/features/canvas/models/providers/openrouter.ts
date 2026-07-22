// Copyright (c) 2026 AI anime
import type { ModelProviderDefinition } from '../types';

// OpenRouter — proxies multiple model families (Google Gemini, etc).
// AI anime `_image_provider_config(provider="openrouter")` reads OPENROUTER_API_KEY.
export const provider: ModelProviderDefinition = {
  id: 'openrouter',
  name: 'OpenRouter',
  label: 'OpenRouter',
};
