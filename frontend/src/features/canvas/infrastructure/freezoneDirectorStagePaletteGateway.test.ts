// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiCall = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api/client", () => ({ apiCall }));

import { freezoneDirectorStagePaletteGateway } from "./freezoneDirectorStagePaletteGateway";

beforeEach(() => {
  apiCall.mockReset();
});

describe("freezoneDirectorStagePaletteGateway", () => {
  it("loads the palette with an encoded project identifier", async () => {
    const palette = { actors: [], props: [] };
    apiCall.mockResolvedValue(palette);

    await expect(
      freezoneDirectorStagePaletteGateway.getPalette("project/one"),
    ).resolves.toBe(palette);
    expect(apiCall).toHaveBeenCalledWith(
      "projects/project%2Fone/director-stage/palette",
    );
  });
});
