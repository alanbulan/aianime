// Copyright (c) 2026 AI anime
import type { SkillDefinition } from "@/modules/creative_canvas/public";

const REQUIRED_INPUT_OVERRIDES: Readonly<Record<string, ReadonlySet<string>>> = {
  freezone_scene_360: new Set([
    "scene",
    "scene_master",
    "scene_reverse_master",
  ]),
};

export function normalizeCanvasSkillCatalog(
  registry: readonly SkillDefinition[],
): SkillDefinition[] {
  return registry.map((skill) => {
    const requiredRoles = REQUIRED_INPUT_OVERRIDES[skill.id];
    if (!requiredRoles) {
      return skill;
    }
    return {
      ...skill,
      inputs: skill.inputs.map((input) =>
        requiredRoles.has(input.role) && !input.required
          ? { ...input, required: true }
          : input,
      ),
    };
  });
}
