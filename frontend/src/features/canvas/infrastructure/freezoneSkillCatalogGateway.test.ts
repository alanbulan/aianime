// Copyright (c) 2026 AI anime
import { describe, expect, it, vi } from "vitest";

import type { SkillDefinition } from "@/modules/creative_canvas/public";

import { createFreezoneSkillCatalogGateway } from "./freezoneSkillCatalogGateway";

function scene360Skill(): SkillDefinition {
  return {
    id: "freezone_scene_360",
    provider: "freezone_mainline",
    display_name: "Scene 360",
    description: "",
    inputs: [
      {
        role: "scene_reverse_master",
        label: "Reverse master",
        accepts: {},
        required: false,
        cardinality: "single",
      },
    ],
    outputs: [],
  };
}

describe("freezoneSkillCatalogGateway", () => {
  it("normalizes and caches the registry for five minutes", async () => {
    let currentTime = 10;
    const loadRegistry = vi.fn().mockResolvedValue([scene360Skill()]);
    const gateway = createFreezoneSkillCatalogGateway(
      loadRegistry,
      () => currentTime,
    );

    const first = await gateway.listSkills();
    const cached = await gateway.listSkills();

    expect(first[0].inputs[0].required).toBe(true);
    expect(cached).toBe(first);
    expect(loadRegistry).toHaveBeenCalledOnce();

    currentTime += 5 * 60 * 1000;
    await gateway.listSkills();
    expect(loadRegistry).toHaveBeenCalledTimes(2);
  });

  it("shares an in-flight registry request", async () => {
    let resolveRegistry!: (skills: SkillDefinition[]) => void;
    const loadRegistry = vi.fn(
      () => new Promise<SkillDefinition[]>((resolve) => {
        resolveRegistry = resolve;
      }),
    );
    const gateway = createFreezoneSkillCatalogGateway(loadRegistry);

    const first = gateway.listSkills();
    const second = gateway.listSkills();
    resolveRegistry([scene360Skill()]);

    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(secondResult).toBe(firstResult);
    expect(loadRegistry).toHaveBeenCalledOnce();
  });
});
