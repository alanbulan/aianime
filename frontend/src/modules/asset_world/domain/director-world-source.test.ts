// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { directorSourceIdentityUrl } from "./director-world-source";

describe("directorWorldSource", () => {
  it("removes query and fragment variants from source identity URLs", () => {
    expect(directorSourceIdentityUrl(
      " /static/project/world.sog?v=2#camera ",
    )).toBe("/static/project/world.sog");
    expect(directorSourceIdentityUrl(
      "/static/project/pano.jpg#camera?v=2",
    )).toBe("/static/project/pano.jpg");
  });

  it("returns an empty identity for blank URLs", () => {
    expect(directorSourceIdentityUrl("   ")).toBe("");
  });
});
