// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import {
  listFreezoneBeatContext,
  listFreezoneProjectAssets,
  type FreezoneContextQueryGateway,
} from "./contextQueries";

function createGateway(): FreezoneContextQueryGateway {
  return {
    listProjectAssets: vi.fn().mockResolvedValue([]),
    listBeatContext: vi.fn().mockResolvedValue({
      scope: { episode: null, beat: null },
      episodes: [],
      assets: [],
    }),
  };
}

describe("contextQueries", () => {
  it("delegates project asset queries through the context port", async () => {
    const gateway = createGateway();
    const options = { signal: new AbortController().signal };

    await listFreezoneProjectAssets("project-a", options, gateway);

    expect(gateway.listProjectAssets).toHaveBeenCalledWith(
      "project-a",
      options,
    );
  });

  it("delegates scoped beat context queries through the context port", async () => {
    const gateway = createGateway();
    const options = { episode: 1, beat: 4 };

    await listFreezoneBeatContext("project-a", options, gateway);

    expect(gateway.listBeatContext).toHaveBeenCalledWith(
      "project-a",
      options,
    );
  });
});
