// Copyright (c) 2026 AI anime
import type { SkillDefinition } from "@/features/freezone/public";

export interface CanvasSkillCatalogGateway {
  listSkills: () => Promise<SkillDefinition[]>;
}
