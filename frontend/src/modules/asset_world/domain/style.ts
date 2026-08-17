// Copyright (c) 2026 AI anime

/** Style list metadata and full style detail share this canonical shape. */
export interface Style {
  id: string;
  name: string;
  label?: string;
  type?: "preset" | "custom";
  is_preset?: boolean;
  base?: string | null;
  style_instructions?: string;
  avoid_instructions?: string;
  style_tag?: string;
  created_at?: string | null;
  created_by?: string | null;
  preview_path?: string | null;
  preview_url?: string | null;
  config?: Record<string, unknown>;
}

export interface EditableStyleConfig {
  label: string;
  style_instructions: string;
  avoid_instructions: string;
  style_tag: string;
}

export const EMPTY_STYLE_CONFIG: EditableStyleConfig = {
  label: "",
  style_instructions: "",
  avoid_instructions: "",
  style_tag: "",
};

export const EDITABLE_STYLE_CONFIG_KEYS: readonly (keyof EditableStyleConfig)[] = [
  "label",
  "style_instructions",
  "avoid_instructions",
  "style_tag",
];

const IGNORED_STYLE_SAVE_KEYS = new Set<string>([
  ...EDITABLE_STYLE_CONFIG_KEYS,
  "id",
  "name",
  "type",
  "is_preset",
  "created_at",
  "created_by",
  "preview_path",
  "preview_url",
]);

export const STYLE_PREVIEW_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

const STYLE_PREVIEW_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export function extractEditableStyleConfig(
  style: Style | undefined | null,
): EditableStyleConfig {
  if (!style) return { ...EMPTY_STYLE_CONFIG };
  const nested = style.config ?? {};
  const get = (key: keyof EditableStyleConfig): string => {
    const top = (style as unknown as Record<string, unknown>)[key];
    if (typeof top === "string") return top;
    const nestedValue = nested[key];
    return typeof nestedValue === "string" ? nestedValue : "";
  };
  return {
    label: get("label"),
    style_instructions: get("style_instructions"),
    avoid_instructions: get("avoid_instructions"),
    style_tag: get("style_tag"),
  };
}

export function buildStyleSavePayload(
  fields: EditableStyleConfig,
  original: Style | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const key of EDITABLE_STYLE_CONFIG_KEYS) {
    if (fields[key]) payload[key] = fields[key];
  }
  if (!original) return payload;

  const source = original.config ?? (original as unknown as Record<string, unknown>);
  for (const [key, value] of Object.entries(source)) {
    if (!IGNORED_STYLE_SAVE_KEYS.has(key) && !(key in payload)) {
      payload[key] = value;
    }
  }
  return payload;
}

export function isPresetStyle(style: Style | null | undefined): boolean {
  return style?.type === "preset" || style?.is_preset === true;
}

export function isSupportedStylePreviewMimeType(mimeType: string): boolean {
  return STYLE_PREVIEW_MIME_TYPES.has(mimeType.toLowerCase());
}
