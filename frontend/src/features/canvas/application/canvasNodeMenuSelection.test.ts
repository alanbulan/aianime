// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  SKILL_SCHEMA_VERSION,
  type SkillDefinition,
} from '@/features/freezone/public';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from '../domain/canvasNodes';
import {
  createCanvasSkillNodeData,
  planCanvasNodeMenuSelection,
} from './canvasNodeMenuSelection';

function node(id: string, type: CanvasNode['type']): CanvasNode {
  return { id, type, position: { x: 0, y: 0 }, data: {} } as CanvasNode;
}

describe('Canvas node menu selection', () => {
  it('uses placement only for an unfiltered menu without connection context', () => {
    expect(planCanvasNodeMenuSelection({
      type: CANVAS_NODE_TYPES.video,
      nodes: [],
      pendingConnection: null,
      hasPendingBatchConnection: false,
      hasAllowedTypeFilter: false,
    })).toEqual({ kind: 'placement', initialData: undefined });
    expect(planCanvasNodeMenuSelection({
      type: CANVAS_NODE_TYPES.video,
      nodes: [],
      pendingConnection: null,
      hasPendingBatchConnection: true,
      hasAllowedTypeFilter: false,
    }).kind).toBe('spawn');
    expect(planCanvasNodeMenuSelection({
      type: CANVAS_NODE_TYPES.video,
      nodes: [],
      pendingConnection: null,
      hasPendingBatchConnection: false,
      hasAllowedTypeFilter: true,
    }).kind).toBe('spawn');
  });

  it('seeds image connection nodes from the pending origin', () => {
    const imageGen = node('image-gen', CANVAS_NODE_TYPES.imageGen);

    expect(planCanvasNodeMenuSelection({
      type: CANVAS_NODE_TYPES.imageEdit,
      nodes: [imageGen],
      pendingConnection: { nodeId: imageGen.id, handleType: 'source' },
      hasPendingBatchConnection: false,
      hasAllowedTypeFilter: true,
    })).toEqual({
      kind: 'spawn',
      initialData: {
        generationMode: 'image_reference',
        requestAspectRatio: 'auto',
      },
    });
    expect(planCanvasNodeMenuSelection({
      type: CANVAS_NODE_TYPES.upload,
      nodes: [imageGen],
      pendingConnection: { nodeId: imageGen.id, handleType: 'target' },
      hasPendingBatchConnection: false,
      hasAllowedTypeFilter: true,
    })).toEqual({
      kind: 'spawn',
      initialData: { imageOnly: true },
    });
    expect(planCanvasNodeMenuSelection({
      type: CANVAS_NODE_TYPES.upload,
      nodes: [node('video', CANVAS_NODE_TYPES.video)],
      pendingConnection: { nodeId: 'video', handleType: 'target' },
      hasPendingBatchConnection: false,
      hasAllowedTypeFilter: true,
    }).initialData).toBeUndefined();
  });

  it('creates stable Skill node data with the schema fallback', () => {
    const skill: SkillDefinition = {
      id: 'skill-1',
      provider: 'tool',
      display_name: 'Test skill',
      description: '',
      inputs: [],
      outputs: [],
    };

    expect(createCanvasSkillNodeData(skill)).toMatchObject({
      skill_id: skill.id,
      skill_schema_version: SKILL_SCHEMA_VERSION,
      displayName: skill.display_name,
    });
    expect(createCanvasSkillNodeData({
      ...skill,
      schema_version: '2.0',
    })).toMatchObject({ skill_schema_version: '2.0' });
  });
});
