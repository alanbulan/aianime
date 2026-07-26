// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  listCharacterIdentities,
  listCharacters,
  type CharacterCatalogGateway,
} from "@/modules/asset_world/application/character-catalog";
import type { Character, Identity } from "@/modules/asset_world/public";

describe("Asset World character catalog", () => {
  it("unwraps character and identity lists through the existing gateway", async () => {
    const identity = {
      identity_id: "alice_worker",
      identity_name: "worker",
      image_url: "/static/alice-worker.png",
    } satisfies Identity;
    const character = {
      name: "Alice",
      display_name: "Alice",
      identities: [identity],
    } satisfies Character;
    const listCharactersGateway = vi.fn().mockResolvedValue({
      ok: true,
      data: [character],
    });
    const listIdentities = vi.fn().mockResolvedValue({
      ok: true,
      data: [identity],
    });
    const gateway: CharacterCatalogGateway = {
      listCharacters: listCharactersGateway,
      listIdentities,
    };

    await expect(listCharacters("demo", gateway)).resolves.toEqual([
      character,
    ]);
    await expect(
      listCharacterIdentities("demo", "Alice", gateway),
    ).resolves.toEqual([identity]);
    expect(listCharactersGateway).toHaveBeenCalledWith("demo");
    expect(listIdentities).toHaveBeenCalledWith("demo", "Alice");
  });
});
