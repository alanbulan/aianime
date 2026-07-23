import type { ProjectConfig, SpineTemplate } from "@/types/project";

export const INGEST_SETTING_FIELDS = [
  "spine_template",
  "visual_style",
  "narration_style",
  "ethnicity",
] as const;

export interface IngestSettingsValues {
  spine_template: SpineTemplate;
  visual_style: string;
  narration_style: string;
  ethnicity: string;
}

const DEFAULT_SETTINGS: IngestSettingsValues = {
  spine_template: "drama",
  visual_style: "chinese_period_drama",
  narration_style: "first_person",
  ethnicity: "Chinese",
};

const LEGACY_DEFAULTS = {
  visual_style: "post_apocalyptic",
  narration_style: "third_person",
  ethnicity: "Japanese",
} as const;

export function normalizeLegacyDefaults(
  config: ProjectConfig | undefined,
): IngestSettingsValues {
  const isLegacyDefault =
    config?.visual_style === LEGACY_DEFAULTS.visual_style &&
    config?.narration_style === LEGACY_DEFAULTS.narration_style &&
    config?.ethnicity === LEGACY_DEFAULTS.ethnicity;

  return {
    spine_template: config?.spine_template ?? DEFAULT_SETTINGS.spine_template,
    visual_style: isLegacyDefault
      ? DEFAULT_SETTINGS.visual_style
      : (config?.visual_style ?? DEFAULT_SETTINGS.visual_style),
    narration_style: isLegacyDefault
      ? DEFAULT_SETTINGS.narration_style
      : (config?.narration_style ?? DEFAULT_SETTINGS.narration_style),
    ethnicity: isLegacyDefault
      ? DEFAULT_SETTINGS.ethnicity
      : (config?.ethnicity ?? DEFAULT_SETTINGS.ethnicity),
  };
}

export function resolveIngestSettings(
  values: Partial<IngestSettingsValues>,
  defaults: IngestSettingsValues,
): IngestSettingsValues {
  return {
    spine_template: values.spine_template ?? defaults.spine_template,
    visual_style: values.visual_style ?? defaults.visual_style,
    narration_style: values.narration_style ?? defaults.narration_style,
    ethnicity: values.ethnicity ?? defaults.ethnicity,
  };
}

export function toProjectSettingsPayload(
  settings: IngestSettingsValues,
): Partial<ProjectConfig> {
  return { ...settings };
}

export function hasIngestSettingsChanges(
  settings: IngestSettingsValues,
  config: ProjectConfig | undefined,
): boolean {
  return INGEST_SETTING_FIELDS.some((field) => {
    if (field === "narration_style" && settings.spine_template !== "narrated") {
      return false;
    }
    return (config?.[field] ?? "") !== settings[field];
  });
}
