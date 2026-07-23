// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { characterMainCopyForSpineTemplate } from "@/modules/asset_world/public";

describe("characterMainCopyForSpineTemplate", () => {
  it("uses plain protagonist copy for premium drama projects", () => {
    expect(characterMainCopyForSpineTemplate("drama")).toMatchObject({
      label: "主角",
      makeMain: "设为主角",
      unsetMain: "取消主角",
      mainSet: "已设为主角",
      mainUnset: "已取消主角",
    });
  });

  it("uses narrator protagonist copy for narrated projects", () => {
    expect(characterMainCopyForSpineTemplate("narrated")).toMatchObject({
      label: "解说主角",
      makeMain: "设为解说主角",
      unsetMain: "取消解说主角",
      mainSet: "已设为解说主角",
      mainUnset: "已取消解说主角",
    });
  });
});
