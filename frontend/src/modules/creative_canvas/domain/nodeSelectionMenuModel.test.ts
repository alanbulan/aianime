// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import type { SkillDefinition } from './skillContract';
import {
  NODE_SELECTION_MENU_ADD_NODE_TYPES,
  NODE_SELECTION_MENU_NODE_TYPES,
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
  it('keeps the established add-node order and excludes generated-only nodes', () => {
    expect(NODE_SELECTION_MENU_ADD_NODE_TYPES).toEqual([
      NODE_SELECTION_MENU_NODE_TYPES.textAnnotation,
      NODE_SELECTION_MENU_NODE_TYPES.beatContext,
      NODE_SELECTION_MENU_NODE_TYPES.imageGen,
      NODE_SELECTION_MENU_NODE_TYPES.video,
      NODE_SELECTION_MENU_NODE_TYPES.videoCompose,
      NODE_SELECTION_MENU_NODE_TYPES.audio,
      NODE_SELECTION_MENU_NODE_TYPES.script,
      NODE_SELECTION_MENU_NODE_TYPES.upload,
      NODE_SELECTION_MENU_NODE_TYPES.pano360Viewer,
      NODE_SELECTION_MENU_NODE_TYPES.threeDWorld,
    ]);
    expect(NODE_SELECTION_MENU_ADD_NODE_TYPES).not.toContain(
      NODE_SELECTION_MENU_NODE_TYPES.videoStory,
    );
    expect(NODE_SELECTION_MENU_ADD_NODE_TYPES).not.toContain(
      NODE_SELECTION_MENU_NODE_TYPES.storyboardGen,
    );
  });

  it('uses the full add-node menu when allowed types are unspecified', () => {
    expect(referenceGenerateItemsForAllowedTypes(undefined)).toBeNull();
  });

  it('projects supported reference actions and preserves image precedence', () => {
    const nodeTypes = NODE_SELECTION_MENU_NODE_TYPES;
    const items = referenceGenerateItemsForAllowedTypes([
      nodeTypes.upload,
      nodeTypes.imageEdit,
      nodeTypes.imageGen,
      nodeTypes.pano360Viewer,
    ]);

    expect(items).toEqual([
      expect.objectContaining({
        key: 'image',
        type: nodeTypes.imageGen,
        disabled: false,
      }),
      expect.objectContaining({
        key: 'pano360',
        type: nodeTypes.pano360Viewer,
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
