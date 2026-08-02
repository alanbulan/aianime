// Copyright (c) 2026 AI anime
import type { SkillDefinition } from "@/modules/creative_canvas/public";

export interface CanvasSkillCatalogGateway {
  listSkills: () => Promise<SkillDefinition[]>;
}
