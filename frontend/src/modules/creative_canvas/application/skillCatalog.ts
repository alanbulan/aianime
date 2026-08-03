// Copyright (c) 2026 AI anime
import type { SkillDefinition } from '@/modules/creative_canvas/domain/skillContract';

export interface CanvasSkillCatalogGateway {
  listSkills: () => Promise<SkillDefinition[]>;
}
