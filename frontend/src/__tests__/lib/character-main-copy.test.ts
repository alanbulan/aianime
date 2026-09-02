// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { characterMainCopyForSpineTemplate } from "@/modules/asset_world/public";

describe("characterMainCopyForSpineTemplate", () => {
  it("separates the narrative anchor from story protagonists", () => {
    expect(characterMainCopyForSpineTemplate("drama")).toMatchObject({
      label: "叙事锚点",
      makeMain: "设为叙事锚点",
      unsetMain: "取消叙事锚点",
      mainSet: "已设为叙事锚点",
      mainUnset: "已取消叙事锚点",
    });
    expect(characterMainCopyForSpineTemplate("drama").help).toContain(
      "角色定位",
    );
  });

  it("uses explicit narrator copy for first-person narrated projects", () => {
    expect(
      characterMainCopyForSpineTemplate("narrated", "first_person"),
    ).toMatchObject({
      label: "第一人称叙述者",
      makeMain: "设为第一人称叙述者",
      unsetMain: "取消第一人称叙述者",
      mainSet: "已设为第一人称叙述者",
      mainUnset: "已取消第一人称叙述者",
    });
  });

  it("keeps third-person narrated projects on narrative-anchor semantics", () => {
    expect(
      characterMainCopyForSpineTemplate("narrated", "third_person").label,
    ).toBe("叙事锚点");
  });
});
