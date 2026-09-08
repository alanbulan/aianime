// Copyright (c) 2026 AI anime
import type { InvalidateQueryFilters, QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import type { ResourceChange } from "../domain/resourceChange";

export async function invalidateAssistantResourceChanges(
  client: QueryClient,
  changes: readonly ResourceChange[],
): Promise<void> {
  const filters: InvalidateQueryFilters[] = [];
  for (const change of changes) {
    if (change.resource === "styles") {
      filters.push({ queryKey: queryKeys.styles() });
      continue;
    }
    if (change.resource === "projects") {
      filters.push({ queryKey: queryKeys.projects(), exact: true }, { queryKey: queryKeys.projectSummaries() });
      continue;
    }
    if (!("project_id" in change)) continue;
    const project = change.project_id;
    switch (change.resource) {
      case "project":
        filters.push(
          { queryKey: queryKeys.project(project) },
          { queryKey: queryKeys.projects(), exact: true },
          { queryKey: queryKeys.projectSummaries() },
          { queryKey: queryKeys.styles(project) },
        );
        break;
      case "characters":
        filters.push(
          { queryKey: queryKeys.characters(project) },
          { queryKey: queryKeys.characterVoiceLibrary(project) },
        );
        break;
      case "scenes": filters.push({ queryKey: queryKeys.scenes(project) }); break;
      case "props": filters.push({ queryKey: queryKeys.props(project) }); break;
      case "episodes":
        filters.push(
          { queryKey: queryKeys.episodes(project), exact: change.episode !== undefined },
          ...(change.episode === undefined ? [] : [{ queryKey: queryKeys.episode(project, change.episode) }]),
        );
        break;
      case "assets": break;
    }
    filters.push(
      { queryKey: queryKeys.pipelineStatus(project) },
      { queryKey: queryKeys.assetReferences(project) },
      { queryKey: queryKeys.freezoneProjectAssets(project) },
      { queryKey: queryKeys.videoReferenceBeatStatusProject(project) },
      { queryKey: queryKeys.audioGenerationPlans(project) },
    );
  }
  const unique = new Map(filters.map((filter) => [JSON.stringify(filter), filter]));
  await Promise.all([...unique.values()].map((filter) => client.invalidateQueries(filter)));
}
