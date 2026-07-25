// Copyright (c) 2026 AI anime
import { describe, expect, it } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
} from '../domain/canvasNodes';
import type { NodeFactory } from './ports';
import { createPanoCaptureNodes } from './panoCaptureNodes';

function node(
  id: string,
  overrides: Partial<CanvasNode> = {},
): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.pano360Viewer,
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
  } as CanvasNode;
}

function factory(...ids: string[]): NodeFactory {
  let index = 0;
  return {
    createNode: (type, position, data = {}) => ({
      id: ids[index++] ?? `created-${index}`,
      type,
      position,
      data,
    }) as CanvasNode,
  };
}

describe('Canvas pano capture nodes', () => {
  it('returns null for empty captures or a missing source', () => {
    const source = node('source');
    expect(
      createPanoCaptureNodes([source], [], source.id, [], undefined, factory()),
    ).toBeNull();
    expect(
      createPanoCaptureNodes(
        [source],
        [],
        'missing',
        [{ dataUrl: 'data:image/png;base64,x', width: 1, height: 1, label: 'x' }],
        undefined,
        factory('capture'),
      ),
    ).toBeNull();
  });

  it('creates one selected image at the source absolute position offset', () => {
    const parent = node('parent', {
      type: CANVAS_NODE_TYPES.group,
      position: { x: 100, y: 200 },
    });
    const source = node('source', {
      parentId: parent.id,
      position: { x: 10, y: 20 },
      measured: { width: 500, height: 250 },
      selected: true,
    });
    const result = createPanoCaptureNodes(
      [parent, source],
      [],
      source.id,
      [
        {
          dataUrl: 'data:image/png;base64,local',
          uploadedUrl: '/capture.png',
          width: 400,
          height: 200,
          label: 'Current',
          metadata: { yaw: 45 },
        },
      ],
      undefined,
      factory('capture'),
    );

    expect(result?.selectedNodeId).toBe('capture');
    expect(result?.nodes[1]?.selected).toBe(false);
    expect(result?.nodes[2]).toMatchObject({
      id: 'capture',
      type: CANVAS_NODE_TYPES.exportImage,
      position: { x: 690, y: 220 },
      width: 320,
      height: 160,
      style: { width: 320, height: 160 },
      selected: true,
      data: {
        imageUrl: '/capture.png',
        previewImageUrl: '/capture.png',
        aspectRatio: '2:1',
        displayName: 'Current',
        captureMetadata: { yaw: 45 },
      },
    });
    expect(result?.edges).toEqual([
      expect.objectContaining({ source: source.id, target: 'capture' }),
    ]);
  });

  it('creates a parent-first grid using the first capture ratio', () => {
    const source = node('source', {
      measured: { width: 500, height: 250 },
      selected: true,
    });
    const result = createPanoCaptureNodes(
      [source],
      [],
      source.id,
      [
        { dataUrl: 'first-local', uploadedUrl: '/first.png', width: 1200, height: 600, label: 'A' },
        { dataUrl: 'second-local', uploadedUrl: '', width: 600, height: 600, label: 'B' },
        { dataUrl: 'third-local', width: 300, height: 900, label: 'C' },
      ],
      { cols: 2, groupName: 'Captures' },
      factory('group', 'first', 'second', 'third'),
    );

    expect(result?.selectedNodeId).toBe('group');
    expect(result?.nodes.slice(1).map((item) => item.id)).toEqual([
      'group',
      'first',
      'second',
      'third',
    ]);
    expect(result?.nodes[1]).toMatchObject({
      position: { x: 580, y: 0 },
      width: 1264,
      height: 678,
      style: { width: 1264, height: 678 },
      selected: false,
      data: { label: 'Captures', displayName: 'Captures' },
    });
    expect(result?.nodes[2]).toMatchObject({
      parentId: 'group',
      position: { x: 20, y: 34 },
      width: 600,
      height: 300,
      data: { imageUrl: '/first.png', aspectRatio: '2:1' },
    });
    expect(result?.nodes[3]).toMatchObject({
      parentId: 'group',
      position: { x: 644, y: 34 },
      data: { imageUrl: 'second-local', aspectRatio: '2:1' },
    });
    expect(result?.nodes[4]).toMatchObject({
      parentId: 'group',
      position: { x: 20, y: 358 },
      data: { imageUrl: 'third-local', aspectRatio: '2:1' },
    });
    expect(result?.edges).toHaveLength(3);
  });
});
