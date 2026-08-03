// Copyright (c) 2026 AI anime
import { apiCall } from '@/shared/api/client';

import type { CanvasSkillCatalogGateway } from '@/modules/creative_canvas/application/skillCatalog';
import { normalizeCanvasSkillCatalog } from '@/modules/creative_canvas/domain/skillCatalog';
import type { SkillDefinition } from '@/modules/creative_canvas/domain/skillContract';

const REGISTRY_CACHE_TTL_MS = 5 * 60 * 1000;

export function createFreezoneSkillCatalogGateway(
  loadRegistry: () => Promise<SkillDefinition[]> = () =>
    apiCall<SkillDefinition[]>('freezone/skills'),
  now: () => number = Date.now,
): CanvasSkillCatalogGateway {
  let cache: { loadedAt: number; value: SkillDefinition[] } | null = null;
  let inFlight: Promise<SkillDefinition[]> | null = null;

  return {
    listSkills() {
      const currentTime = now();
      if (cache && currentTime - cache.loadedAt < REGISTRY_CACHE_TTL_MS) {
        return Promise.resolve(cache.value);
      }
      if (inFlight) {
        return inFlight;
      }

      inFlight = loadRegistry()
        .then((value) => {
          const normalized = normalizeCanvasSkillCatalog(value);
          cache = { loadedAt: now(), value: normalized };
          return normalized;
        })
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
  };
}

export const freezoneSkillCatalogGateway =
  createFreezoneSkillCatalogGateway();
