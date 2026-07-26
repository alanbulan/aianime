// Copyright (c) 2026 AI anime
import { useCallback } from 'react';
import type { TFunction } from 'i18next';

import { getSkillRegistry } from '@/api/skills';
import { translateSkillName } from '@/features/freezone/context/skillI18n';

import { nodeCatalog } from '../application/nodeCatalog';
import type { CanvasNodePlacement } from './useCanvasNodePlacementController';
import {
  useCanvasSkillRegistry,
  type CanvasSkillRegistryResult,
} from './useCanvasSkillRegistry';

export interface CanvasNodeCatalogControllerOptions {
  translate: TFunction;
}

export interface CanvasNodeCatalogController extends CanvasSkillRegistryResult {
  resolvePlacementLabel: (placement: CanvasNodePlacement) => string;
}

export function useCanvasNodeCatalogController({
  translate,
}: CanvasNodeCatalogControllerOptions): CanvasNodeCatalogController {
  const registry = useCanvasSkillRegistry(getSkillRegistry);
  const resolvePlacementLabel = useCallback(
    (placement: CanvasNodePlacement): string => {
      const definition = nodeCatalog.getDefinition(placement.type);
      return placement.skill
        ? translateSkillName(placement.skill, translate)
        : definition
          ? translate(definition.menuLabelKey)
          : placement.type;
    },
    [translate],
  );

  return {
    ...registry,
    resolvePlacementLabel,
  };
}
