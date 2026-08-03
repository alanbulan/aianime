// Copyright (c) 2026 AI anime
import { useCallback } from 'react';
import type { TFunction } from 'i18next';

import { translateSkillName } from '@/modules/creative_canvas/presentation/skillI18n';
import {
  useCanvasSkillRegistry,
  type CanvasSkillRegistryResult,
  type LoadCanvasSkillRegistry,
} from '@/modules/creative_canvas/presentation/useCanvasSkillRegistry';
import type { CanvasNodePlacement } from '@/modules/creative_canvas/presentation/useCanvasNodePlacementController';

export interface CanvasNodeCatalogControllerOptions<TNodeType = string> {
  translate: TFunction;
  loadSkillRegistry: LoadCanvasSkillRegistry;
  resolveNodeTypeLabel: (type: TNodeType) => string;
}

export interface CanvasNodeCatalogController<
  TNodeType = string,
  TNodeData extends object = Record<string, unknown>,
> extends CanvasSkillRegistryResult {
  resolvePlacementLabel: (
    placement: CanvasNodePlacement<TNodeType, TNodeData>,
  ) => string;
}

export function useCanvasNodeCatalogController<
  TNodeType,
  TNodeData extends object,
>({
  translate,
  loadSkillRegistry,
  resolveNodeTypeLabel,
}: CanvasNodeCatalogControllerOptions<TNodeType>): CanvasNodeCatalogController<
  TNodeType,
  TNodeData
> {
  const registry = useCanvasSkillRegistry(loadSkillRegistry);
  const resolvePlacementLabel = useCallback(
    (
      placement: CanvasNodePlacement<TNodeType, TNodeData>,
    ): string => placement.skill
      ? translateSkillName(placement.skill, translate)
      : resolveNodeTypeLabel(placement.type),
    [resolveNodeTypeLabel, translate],
  );

  return {
    ...registry,
    resolvePlacementLabel,
  };
}
