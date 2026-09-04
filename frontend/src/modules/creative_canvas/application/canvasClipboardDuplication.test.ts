// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import type { CanvasClipboardSnapshot } from '../domain/canvasClipboard';
import {
  planCanvasClipboardDuplication,
  type CanvasClipboardDuplicationPorts,
} from './canvasClipboardDuplication';

type TestNodeData = Record<string, unknown>;

interface TestNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  measured: { width: number; height: number };
  selected?: boolean;
  data: TestNodeData;
}

interface TestEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

const ports: CanvasClipboardDuplicationPorts<
  TestNode,
  string,
  TestNodeData
> = {
  resolveNodeType: (node) => node.type,
  cloneNodeData: (data) => structuredClone(data),
  getNodeSize: (node) => node.measured,
  hasRectCollision: (candidate, nodes) => nodes.some((node) => {
    const margin = 18;
    return (
      candidate.x < node.position.x + node.measured.width + margin
      && candidate.x + candidate.width + margin > node.position.x
      && candidate.y < node.position.y + node.measured.height + margin
      && candidate.y + candidate.height + margin > node.position.y
    );
  }),
};

function node(
  id: string,
  position = { x: 0, y: 0 },
  options: {
    width?: number;
    height?: number;
    data?: TestNodeData;
    selected?: boolean;
  } = {},
): TestNode {
  return {
    id,
    type: 'textAnnotation',
    position,
    measured: {
      width: options.width ?? 10,
      height: options.height ?? 10,
    },
    selected: options.selected,
    data: {
      content: id,
      ...options.data,
    },
  };
}

function snapshot(
  nodes: TestNode[],
  edges: TestEdge[] = [],
  sourceProject = 'source-project',
): CanvasClipboardSnapshot<TestNode, TestEdge> {
  return { nodes, edges, sourceProject };
}

describe('planCanvasClipboardDuplication', () => {
  it('chooses the first collision-free base offset and keeps internal edges', () => {
    const sourceNodes = [
      node('source-a'),
      node('source-b', { x: 30, y: 40 }),
    ];
    const plan = planCanvasClipboardDuplication({
      nodes: [node('obstacle', { x: 44, y: 30 })],
      edges: [],
      sourceNodeIds: [],
      pasteIteration: 0,
      ports,
      options: {
        sourceSnapshot: snapshot(sourceNodes, [
          {
            id: 'internal',
            source: 'source-a',
            target: 'source-b',
            sourceHandle: null,
            targetHandle: null,
          },
          { id: 'external', source: 'source-a', target: 'missing' },
        ]),
        selectAll: true,
      },
    });

    expect(plan).toMatchObject({
      selection: 'all',
      advancePasteIteration: true,
      sourceProject: 'source-project',
      nodes: [
        { sourceNodeId: 'source-a', position: { x: 72, y: 8 } },
        { sourceNodeId: 'source-b', position: { x: 102, y: 48 } },
      ],
      connections: [{
        sourceNodeId: 'source-a',
        targetNodeId: 'source-b',
        sourceHandle: 'source',
        targetHandle: 'target',
      }],
    });
  });

  it('aligns cursor paste by group top-left and clears generation runtime state', () => {
    const sourceData = {
      content: 'source',
      nested: { value: 1 },
      isGenerating: true,
      generationStartedAt: 100,
      generationJobId: 'job',
      generationProviderId: 'provider',
      generationClientSessionId: 'session',
      generationTaskKey: 'task:image:source-a',
      generationTaskType: 'freezone_image_generate',
      generationTaskJobId: 'task-job',
      generationTaskRefs: [
        {
          task_key: 'task:image:source-a',
          task_type: 'freezone_image_generate',
          job_id: 'task-job',
        },
      ],
      generationStoryboardMetadata: { frame: 1 },
      generationError: 'failed',
      generationErrorDetails: 'details',
      generationDebugContext: { request: 1 },
    };
    const sourceNodes = [
      node('source-a', { x: 10, y: 20 }, { data: sourceData }),
      node('source-b', { x: 40, y: 70 }),
    ];

    const plan = planCanvasClipboardDuplication({
      nodes: [],
      edges: [],
      sourceNodeIds: [],
      pasteIteration: 5,
      ports,
      options: {
        sourceSnapshot: snapshot(sourceNodes),
        targetFlowPosition: { x: 100, y: 200 },
      },
    });

    expect(plan?.nodes.map((item) => item.position)).toEqual([
      { x: 100, y: 200 },
      { x: 130, y: 250 },
    ]);
    expect(plan?.nodes[0].data).toMatchObject({
      isGenerating: false,
      generationStartedAt: null,
      generationJobId: null,
      generationProviderId: null,
      generationClientSessionId: null,
      generationTaskKey: null,
      generationTaskType: null,
      generationTaskJobId: null,
      generationTaskRefs: null,
      generationError: null,
      generationErrorDetails: null,
    });
    expect(plan?.nodes[0].data.generationStoryboardMetadata).toBeUndefined();
    expect(plan?.nodes[0].data.generationDebugContext).toBeUndefined();
    expect(plan?.nodes[0].data).not.toBe(sourceNodes[0].data);
    expect(plan?.nodes[0].data.nested).not.toBe(sourceData.nested);
    expect(sourceData.isGenerating).toBe(true);
    expect(plan?.selection).toBe('first');
    expect(plan?.advancePasteIteration).toBe(false);
  });

  it('uses live nodes in graph order for an explicit non-iterating duplicate', () => {
    const nodes = [
      node('source-a', { x: 10, y: 20 }),
      node('source-b', { x: 40, y: 50 }),
      node('other', { x: 80, y: 90 }),
    ];
    const plan = planCanvasClipboardDuplication({
      nodes,
      edges: [
        { id: 'internal', source: 'source-b', target: 'source-a' },
        { id: 'external', source: 'source-b', target: 'other' },
      ],
      sourceNodeIds: ['source-b', 'source-a'],
      pasteIteration: 9,
      ports,
      options: {
        explicitOffset: { x: 0, y: 0 },
        disableOffsetIteration: true,
        suppressSelect: true,
      },
    });

    expect(plan?.nodes.map((item) => item.sourceNodeId)).toEqual([
      'source-a',
      'source-b',
    ]);
    expect(plan?.nodes.map((item) => item.position)).toEqual([
      { x: 10, y: 20 },
      { x: 40, y: 50 },
    ]);
    expect(plan?.connections).toHaveLength(1);
    expect(plan?.selection).toBe('none');
    expect(plan?.advancePasteIteration).toBe(false);
    expect(plan?.sourceProject).toBeNull();
  });

  it('searches through the sixteenth fallback offset', () => {
    const plan = planCanvasClipboardDuplication({
      nodes: [node('blocker', { x: 0, y: 0 }, { width: 422, height: 400 })],
      edges: [],
      sourceNodeIds: [],
      pasteIteration: 0,
      ports,
      options: {
        sourceSnapshot: snapshot([node('source')]),
      },
    });

    expect(plan?.nodes[0].position).toEqual({ x: 440, y: 304 });
  });

  it('returns null when no live or snapshot source node exists', () => {
    expect(planCanvasClipboardDuplication({
      nodes: [node('source')],
      edges: [],
      sourceNodeIds: ['missing'],
      pasteIteration: 0,
      ports,
    })).toBeNull();
  });
});
