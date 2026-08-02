// Copyright (c) 2026 AI anime

export type VideoPromptLanguage = "zh" | "en";

export interface GenerateSeedance2PromptCommand {
  beatNum: number;
  manualPromptReference?: string;
  promptGuidance?: string;
}

export interface RegenerateBeatVideoCommand {
  beatNum: number;
  model: string;
  useDirectorRender?: boolean;
  resolution?: string;
  duration?: number;
  ratio?: string;
  mode?: string;
  seedance2ConfigJson?: string;
  audioSetting?: string;
}

export function promptLanguageFromLocale(
  locale: string | undefined,
): VideoPromptLanguage {
  return locale?.startsWith("zh") ? "zh" : "en";
}
