// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import { CANVAS_NODE_TYPES } from '@/features/canvas/domain/canvasNodes';
import type { SkillDefinition } from '@/features/freezone/public';

import {
  referenceGenerateItemsForAllowedTypes,
  skillGroupsForNodeSelectionMenu,
} from './nodeSelectionMenuModel';

function skill(
  id: string,
  provider: SkillDefinition['provider'],
): SkillDefinition {
  return {
    id,
    provider,
    display_name: id,
    description: '',
    inputs: [],
    outputs: [],
  };
}

describe('nodeSelectionMenuModel', () => {
  it('uses the full add-node menu when allowed types are unspecified', () => {
    expect(referenceGenerateItemsForAllowedTypes(undefined)).toBeNull();
  });

  it('projects supported reference actions and preserves image precedence', () => {
    const items = referenceGenerateItemsForAllowedTypes([
      CANVAS_NODE_TYPES.upload,
      CANVAS_NODE_TYPES.imageEdit,
      CANVAS_NODE_TYPES.imageGen,
      CANVAS_NODE_TYPES.pano360Viewer,
    ]);

    expect(items).toEqual([
      expect.objectContaining({
        key: 'image',
        type: CANVAS_NODE_TYPES.imageGen,
        disabled: false,
      }),
      expect.objectContaining({
        key: 'pano360',
        type: CANVAS_NODE_TYPES.pano360Viewer,
        disabled: false,
      }),
    ]);
  });

  it('orders skill providers and removes hidden skills', () => {
    expect(skillGroupsForNodeSelectionMenu([
      skill('workflow.visible', 'workflow'),
      skill('agent.review_frame', 'agent'),
      skill('mainline.visible', 'freezone_mainline'),
      skill('tool.visible', 'tool'),
      skill('workflow.plan_beat_graph', 'workflow'),
    ])).toEqual([
      {
        provider: 'freezone_mainline',
        items: [expect.objectContaining({ id: 'mainline.visible' })],
      },
      {
        provider: 'tool',
        items: [expect.objectContaining({ id: 'tool.visible' })],
      },
      {
        provider: 'workflow',
        items: [expect.objectContaining({ id: 'workflow.visible' })],
      },
    ]);
  });
});
