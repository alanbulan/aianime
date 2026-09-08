// Copyright (c) 2026 AI anime
export type ResourceChange =
  | { resource: "projects" | "styles" }
  | {
      resource: "project" | "characters" | "scenes" | "props" | "episodes" | "assets";
      project_id: string;
      episode?: number;
    };

function isResourceChange(value: unknown): value is ResourceChange {
  if (!value || typeof value !== "object") return false;
  const change = value as Record<string, unknown>;
  if (change.resource === "projects" || change.resource === "styles") return true;
  return ["project", "characters", "scenes", "props", "episodes", "assets"].includes(String(change.resource))
    && typeof change.project_id === "string" && change.project_id.trim().length > 0
    && (change.episode === undefined || (
      typeof change.episode === "number" && Number.isInteger(change.episode) && change.episode > 0
    ));
}

export function toolResourceChanges(value: unknown): ResourceChange[] {
  if (typeof value === "string") {
    try { return toolResourceChanges(JSON.parse(value)); } catch { return []; }
  }
  if (Array.isArray(value)) return value.flatMap(toolResourceChanges);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  if (record.ok === false || record.success === false || record.error) return [];
  if (record.ok === true && Array.isArray(record.resource_changes)) {
    return record.resource_changes.filter(isResourceChange);
  }
  // ACP emits content blocks; older adapters expose the same JSON in {text}.
  if (typeof record.text === "string") return toolResourceChanges(record.text);
  if (record.type === "content") return toolResourceChanges(record.content);
  return [];
}
