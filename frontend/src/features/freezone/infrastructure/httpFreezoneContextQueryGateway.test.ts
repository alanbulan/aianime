// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiCall } from "@/shared/api/client";
import { httpFreezoneContextQueryGateway } from "./httpFreezoneContextQueryGateway";

vi.mock("@/shared/api/client", () => ({
  apiCall: vi.fn(),
}));

describe("httpFreezoneContextQueryGateway", () => {
  beforeEach(() => {
    vi.mocked(apiCall).mockReset();
  });

  it("lists project assets through the encoded Freezone path", async () => {
    const controller = new AbortController();
    vi.mocked(apiCall).mockResolvedValueOnce([]);

    await httpFreezoneContextQueryGateway.listProjectAssets("project/a", {
      signal: controller.signal,
    });

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2Fa/freezone/assets",
      { signal: controller.signal },
    );
  });

  it("serializes the Beat Context scope without changing the endpoint", async () => {
    vi.mocked(apiCall).mockResolvedValueOnce({
      scope: { episode: 1, beat: 4 },
      episodes: [],
      assets: [],
    });

    await httpFreezoneContextQueryGateway.listBeatContext("project-a", {
      episode: 1,
      beat: 4,
    });

    expect(apiCall).toHaveBeenCalledWith(
      "projects/project-a/freezone/assets/beat-context?episode=1&beat=4",
      undefined,
    );
  });
});
