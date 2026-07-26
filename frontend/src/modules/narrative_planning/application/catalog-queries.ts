// Copyright (c) 2026 AI anime
import type { NarrativePlanningGateway } from "@/modules/narrative_planning/application/ports";
import type {
  Beat,
  Episode,
} from "@/modules/narrative_planning/domain/types";

export type NarrativeCatalogGateway = Pick<
  NarrativePlanningGateway,
  "getBeats" | "listEpisodes"
>;

export async function listEpisodes(
  project: string,
  gateway: NarrativeCatalogGateway,
): Promise<Episode[]> {
  const response = await gateway.listEpisodes(project);
  return response.data;
}

export async function listBeats(
  project: string,
  episode: number,
  gateway: NarrativeCatalogGateway,
): Promise<Beat[]> {
  const response = await gateway.getBeats(project, episode);
  return response.data;
}
