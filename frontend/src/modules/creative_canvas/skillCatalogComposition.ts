// Copyright (c) 2026 AI anime
import { freezoneSkillCatalogGateway } from '@/modules/creative_canvas/infrastructure/freezoneSkillCatalogGateway';

export function loadCanvasSkillRegistry() {
  return freezoneSkillCatalogGateway.listSkills();
}
