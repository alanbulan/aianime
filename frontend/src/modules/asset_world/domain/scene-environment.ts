// Copyright (c) 2026 AI anime
export type SceneEnvironmentSectionKey =
  | "front"
  | "left"
  | "right"
  | "back"
  | "light"
  | "material"
  | "forbidden";

export interface SceneEnvironmentSection {
  key: SceneEnvironmentSectionKey;
  label: string;
  i18nKey: string;
}

export const SCENE_ENVIRONMENT_SECTIONS: readonly SceneEnvironmentSection[] = [
  { key: "front", label: "正面", i18nKey: "assets.scenes.environment.front" },
  { key: "left", label: "左侧", i18nKey: "assets.scenes.environment.left" },
  { key: "right", label: "右侧", i18nKey: "assets.scenes.environment.right" },
  { key: "back", label: "背面", i18nKey: "assets.scenes.environment.back" },
  { key: "light", label: "光源", i18nKey: "assets.scenes.environment.light" },
  {
    key: "material",
    label: "材质/风格",
    i18nKey: "assets.scenes.environment.material",
  },
  {
    key: "forbidden",
    label: "禁止元素",
    i18nKey: "assets.scenes.environment.forbidden",
  },
] as const;

export type SceneEnvironmentSections = Record<
  SceneEnvironmentSectionKey,
  string
>;

const EMPTY_SECTIONS: SceneEnvironmentSections = {
  front: "",
  left: "",
  right: "",
  back: "",
  light: "",
  material: "",
  forbidden: "",
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseEnvironmentPrompt(
  prompt: string | null | undefined,
): SceneEnvironmentSections {
  const result: SceneEnvironmentSections = { ...EMPTY_SECTIONS };
  const text = (prompt ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return result;

  const labels = SCENE_ENVIRONMENT_SECTIONS.map((section) =>
    escapeRegExp(section.label),
  ).join("|");
  const headingPattern = new RegExp(
    `(?:^|\\n)\\s*(${labels})\\s*[:：]`,
    "g",
  );
  const hits: Array<{
    key: SceneEnvironmentSectionKey;
    labelStart: number;
    contentStart: number;
  }> = [];

  let match: RegExpExecArray | null;
  while ((match = headingPattern.exec(text)) !== null) {
    const section = SCENE_ENVIRONMENT_SECTIONS.find(
      (candidate) => candidate.label === match?.[1],
    );
    if (!section) continue;
    hits.push({
      key: section.key,
      labelStart: match.index,
      contentStart: match.index + match[0].length,
    });
  }

  if (hits.length === 0) {
    result.front = text;
    return result;
  }

  for (let index = 0; index < hits.length; index += 1) {
    const hit = hits[index];
    const end = hits[index + 1]?.labelStart ?? text.length;
    const content = text.slice(hit.contentStart, end).trim();
    result[hit.key] = result[hit.key]
      ? `${result[hit.key]}\n${content}`
      : content;
  }

  const preamble = text.slice(0, hits[0].labelStart).trim();
  if (preamble) {
    result.front = result.front ? `${preamble}\n${result.front}` : preamble;
  }

  return result;
}

export function serializeEnvironmentPrompt(
  sections: SceneEnvironmentSections,
): string {
  return SCENE_ENVIRONMENT_SECTIONS.map((section) => ({
    label: section.label,
    value: (sections[section.key] ?? "").trim(),
  }))
    .filter((section) => section.value.length > 0)
    .map((section) => `${section.label}：${section.value}`)
    .join("\n");
}
