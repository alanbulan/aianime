// Copyright (c) 2026 AI anime
import type { CharacterGateway } from "@/modules/asset_world/application/ports";
import type {
  Character,
  Identity,
} from "@/modules/asset_world/domain/character";

export type CharacterCatalogGateway = Pick<
  CharacterGateway,
  "listCharacters" | "listIdentities"
>;

export async function listCharacters(
  project: string,
  gateway: CharacterCatalogGateway,
): Promise<Character[]> {
  const response = await gateway.listCharacters(project);
  return response.data;
}

export async function listCharacterIdentities(
  project: string,
  character: string,
  gateway: CharacterCatalogGateway,
): Promise<Identity[]> {
  const response = await gateway.listIdentities(project, character);
  return response.data;
}
