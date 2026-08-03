// Copyright (c) 2026 AI anime
import { useMemo } from 'react';

import type { CanvasStoryboardGroupConfig } from '@/modules/creative_canvas/domain/canvasStoryboardGroupConfig';
import {
  DEFAULT_STORYBOARD_ASPECT,
  STORYBOARD_ASPECTS,
  resolveStoryboardCols,
} from '@/modules/creative_canvas/domain/storyboardGroup';

const MAX_GRID_COLS = 6;

export interface StoryboardGroupToolbarCommandPorts {
  configureGroup: (
    groupNodeId: string,
    config: CanvasStoryboardGroupConfig,
  ) => void;
  convertGroupToPlain: (groupNodeId: string) => void;
  notifyStitchUnavailable: () => void;
  ungroup: (groupNodeId: string) => unknown;
}

export interface StoryboardGroupToolbarControllerOptions
  extends StoryboardGroupToolbarCommandPorts {
  groupNodeId: string;
  childCount: number;
  aspectKey?: string;
  requestedCols?: number;
  showIndex?: boolean;
  translate: (key: string, options?: Record<string, unknown>) => string;
}

export function useStoryboardGroupToolbarController({
  groupNodeId,
  childCount,
  aspectKey: requestedAspectKey,
  requestedCols,
  showIndex = false,
  translate,
  configureGroup,
  convertGroupToPlain,
  notifyStitchUnavailable,
  ungroup,
}: StoryboardGroupToolbarControllerOptions) {
  const aspectKey = requestedAspectKey ?? DEFAULT_STORYBOARD_ASPECT;
  const currentCols = resolveStoryboardCols(childCount, requestedCols);
  const colOptions = useMemo(() => {
    const max = Math.max(1, Math.min(childCount, MAX_GRID_COLS));
    return Array.from({ length: max }, (_, index) => index + 1);
  }, [childCount]);

  return {
    t: translate,
    aspectKey,
    aspectOptions: STORYBOARD_ASPECTS,
    currentCols,
    colOptions,
    showIndex,
    setAspect: (nextAspectKey: string) => {
      configureGroup(groupNodeId, { aspectKey: nextAspectKey });
    },
    setCols: (cols: number) => {
      configureGroup(groupNodeId, { cols });
    },
    toggleIndex: () => {
      configureGroup(groupNodeId, { showIndex: !showIndex });
    },
    requestStitch: notifyStitchUnavailable,
    convertToPlain: () => convertGroupToPlain(groupNodeId),
    ungroup: () => ungroup(groupNodeId),
  };
}

export type StoryboardGroupToolbarController = ReturnType<
  typeof useStoryboardGroupToolbarController
>;
