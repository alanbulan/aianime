// Copyright (c) 2026 AI anime
import { freezoneSkillCatalogGateway } from './infrastructure/freezoneSkillCatalogGateway';

export function loadCanvasSkillRegistry() {
  return freezoneSkillCatalogGateway.listSkills();
}
