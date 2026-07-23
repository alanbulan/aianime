// Copyright (c) 2026 AI anime

export const PROJECT_SECTION_ROUTES = {
  freezone: "/projects/$project/freezone",
  ingest: "/projects/$project/ingest",
  characters: "/projects/$project/characters",
  episodes: "/projects/$project/episodes",
  styles: "/projects/$project/styles",
  tasks: "/projects/$project/tasks",
  assistant: "/projects/$project/assistant",
} as const;

export type ProjectSection = keyof typeof PROJECT_SECTION_ROUTES;
export type WorkspaceSection = Exclude<
  ProjectSection,
  "freezone" | "tasks"
>;

const REMEMBERED_SECTIONS = new Set<ProjectSection>([
  "freezone",
  "ingest",
  "characters",
  "episodes",
  "assistant",
  "styles",
]);

export function isRememberedSection(
  section: ProjectSection | null,
): section is ProjectSection {
  return section !== null && REMEMBERED_SECTIONS.has(section);
}

export function projectSectionFromPath(pathname: string): ProjectSection | null {
  const segment = pathname.match(/^\/projects\/[^/]+\/([^/]+)/)?.[1];
  return segment && segment in PROJECT_SECTION_ROUTES
    ? (segment as ProjectSection)
    : null;
}

export function projectModeFromPath(pathname: string): "canvas" | "workspace" {
  return projectSectionFromPath(pathname) === "freezone" ? "canvas" : "workspace";
}
