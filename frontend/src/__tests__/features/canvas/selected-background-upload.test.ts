// Copyright (c) 2026 AI anime
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CanvasAssetGateway,
  CanvasGraphGateway,
} from '@/features/canvas/application/ports';
import {
  stageSelectedBackgroundOutputForSkill,
  uploadAndAutoCommitSelectedBackgroundCandidate,
} from '@/features/canvas/application/selectedBackgroundSlot';
import type {
  CanvasEdge,
  CanvasNode,
} from '@/features/canvas/domain/canvasNodes';

const addEdgeWithData = vi.fn();
const addNode = vi.fn();
const publish = vi.fn();
const updateNodeData = vi.fn();
const uploadAsset = vi.fn();

let nodes: CanvasNode[] = [];
let edges: CanvasEdge[] = [];

const graphGateway: CanvasGraphGateway = {
  addEdgeWithData: (source, target, data, options) =>
    addEdgeWithData(source, target, data, options),
  addNode: (type, position, data) => addNode(type, position, data),
  getSnapshot: () => ({ edges, nodes }),
  updateNodeData: (nodeId, data) => updateNodeData(nodeId, data),
};

const assetGateway: CanvasAssetGateway = {
  upload: (projectId, file, filename, options) =>
    uploadAsset(projectId, file, filename, options),
};

function sourceNode(): CanvasNode {
  return {
    data: {},
    id: 'source-node',
    position: { x: 20, y: 30 },
    type: 'imageGenNode',
  } as CanvasNode;
}

describe('selected background staging', () => {
  beforeEach(() => {
    nodes = [sourceNode()];
    edges = [];
    addEdgeWithData.mockReset();
    addNode.mockReset().mockReturnValue('candidate-node');
    publish.mockReset();
    updateNodeData.mockReset();
    uploadAsset.mockReset().mockResolvedValue({
      url: '/static/proj/background.png',
      filename: 'background.png',
      size: 5,
    });
  });

  it('uploads, stages, and auto-commits the selected background', async () => {
    const blob = new Blob(['image'], { type: 'image/png' });

    await expect(
      uploadAndAutoCommitSelectedBackgroundCandidate(
        assetGateway,
        graphGateway,
        publish,
        'proj',
        { episode: 2, beat: 3 },
        blob,
        'background.png',
        {
          sourceNodeId: 'source-node',
          successMessage: '设置完成',
        },
      ),
    ).resolves.toEqual({
      nodeId: 'candidate-node',
      url: '/static/proj/background.png',
    });

    expect(uploadAsset).toHaveBeenCalledWith(
      'proj',
      blob,
      'background.png',
      { disableTimeout: true },
    );
    expect(addNode).toHaveBeenCalledOnce();
    expect(addEdgeWithData).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith({
      auto: true,
      nodeId: 'candidate-node',
      successMessage: '设置完成',
    });
  });

  it('updates an existing skill output instead of creating a duplicate node', () => {
    const outputNode = {
      data: { displayName: '已有背景' },
      id: 'output-node',
      position: { x: 480, y: 70 },
      type: 'imageGenNode',
    } as CanvasNode;
    nodes = [sourceNode(), outputNode];
    edges = [
      {
        id: 'output-edge',
        source: 'source-node',
        sourceHandle: 'selected_background',
        target: 'output-node',
      } as CanvasEdge,
    ];

    expect(
      stageSelectedBackgroundOutputForSkill(
        graphGateway,
        { episode: 2, beat: 3 },
        '/static/proj/updated.png',
        { sourceSkillNodeId: 'source-node' },
      ),
    ).toBe('output-node');

    expect(addNode).not.toHaveBeenCalled();
    expect(updateNodeData).toHaveBeenCalledWith(
      'output-node',
      expect.objectContaining({
        displayName: '已有背景',
        imageUrl: '/static/proj/updated.png',
        output_role: 'selected_background',
      }),
    );
  });

  it('rejects before uploading when no project is selected', async () => {
    await expect(
      uploadAndAutoCommitSelectedBackgroundCandidate(
        assetGateway,
        graphGateway,
        publish,
        null,
        { episode: 2, beat: 3 },
        new Blob(['image']),
        'background.png',
        { sourceNodeId: 'source-node' },
      ),
    ).rejects.toThrow('缺少项目');
    expect(uploadAsset).not.toHaveBeenCalled();
  });
});
