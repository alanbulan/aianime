// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  listBeats,
  listEpisodes,
  type NarrativeCatalogGateway,
} from "@/modules/narrative_planning/application/catalog-queries";
import type { Beat, Episode } from "@/modules/narrative_planning/public";

describe("Narrative Planning catalog queries", () => {
  it("unwraps episode and Beat lists through the existing gateway", async () => {
    const episode = { number: 2, title: "Episode 2" } satisfies Episode;
    const beat = {
      beat_number: 1,
      narration_segment: "Opening",
      visual_description: "City street",
      frame_url: "/static/frame.png",
    } satisfies Beat;
    const listEpisodesGateway = vi.fn().mockResolvedValue({
      ok: true,
      data: [episode],
    });
    const getBeats = vi.fn().mockResolvedValue({
      ok: true,
      data: [beat],
    });
    const gateway: NarrativeCatalogGateway = {
      getBeats,
      listEpisodes: listEpisodesGateway,
    };

    await expect(listEpisodes("demo", gateway)).resolves.toEqual([episode]);
    await expect(listBeats("demo", 2, gateway)).resolves.toEqual([beat]);
    expect(listEpisodesGateway).toHaveBeenCalledWith("demo");
    expect(getBeats).toHaveBeenCalledWith("demo", 2);
  });
});
