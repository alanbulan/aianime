// Copyright (c) 2026 AI anime
import { useCallback } from 'react';
import type { TFunction } from 'i18next';

import { loadCanvasSkillRegistry } from '@/features/canvas/skillCatalogComposition';
import {
  translateSkillName,
  type CanvasNodePlacement,
} from '@/modules/creative_canvas/public';

import { nodeCatalog } from '../application/nodeCatalog';
import type { CanvasNodeData, CanvasNodeType } from '../domain/canvasNodes';
import {
  useCanvasSkillRegistry,
  type CanvasSkillRegistryResult,
} from './useCanvasSkillRegistry';

export interface CanvasNodeCatalogControllerOptions {
  translate: TFunction;
}

export interface CanvasNodeCatalogController extends CanvasSkillRegistryResult {
  resolvePlacementLabel: (
    placement: CanvasNodePlacement<CanvasNodeType, CanvasNodeData>,
  ) => string;
}

export function useCanvasNodeCatalogController({
  translate,
}: CanvasNodeCatalogControllerOptions): CanvasNodeCatalogController {
  const registry = useCanvasSkillRegistry(loadCanvasSkillRegistry);
  const resolvePlacementLabel = useCallback(
    (
      placement: CanvasNodePlacement<CanvasNodeType, CanvasNodeData>,
    ): string => {
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
