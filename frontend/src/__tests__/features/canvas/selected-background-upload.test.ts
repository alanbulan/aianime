// Copyright (c) 2026 AI anime
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { uploadAndAutoCommitSelectedBackgroundCandidate } from '@/features/canvas/application/selectedBackgroundSlot';
import type { CanvasAssetGateway } from '@/features/canvas/application/ports';

const mocks = vi.hoisted(() => ({
  addEdgeWithData: vi.fn(),
  addNode: vi.fn(),
  publish: vi.fn(),
}));

vi.mock('@/stores/canvasStore', () => ({
  useCanvasStore: {
    getState: () => ({
      addEdgeWithData: mocks.addEdgeWithData,
      addNode: mocks.addNode,
      edges: [],
      nodes: [
        {
          data: {},
          id: 'source-node',
          position: { x: 20, y: 30 },
          type: 'imageGen',
        },
      ],
    }),
  },
}));

vi.mock('@/features/canvas/application/canvasServices', () => ({
  canvasEventBus: { publish: mocks.publish },
}));

const uploadAsset = vi.fn();
const assetGateway: CanvasAssetGateway = {
  upload: (projectId, file, filename, options) =>
    uploadAsset(projectId, file, filename, options),
};

describe('uploadAndAutoCommitSelectedBackgroundCandidate', () => {
  beforeEach(() => {
    mocks.addEdgeWithData.mockReset();
    mocks.addNode.mockReset().mockReturnValue('candidate-node');
    mocks.publish.mockReset();
    uploadAsset.mockReset().mockResolvedValue('/static/proj/background.png');
    window.history.replaceState({}, '', '/projects/proj/freezone');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('uploads, stages, and auto-commits the selected background', async () => {
    const blob = new Blob(['image'], { type: 'image/png' });

    await expect(
      uploadAndAutoCommitSelectedBackgroundCandidate(
        assetGateway,
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
    expect(mocks.addNode).toHaveBeenCalledOnce();
    expect(mocks.addEdgeWithData).toHaveBeenCalledOnce();
    expect(mocks.publish).toHaveBeenCalledWith('freezone/commit-node', {
      auto: true,
      nodeId: 'candidate-node',
      successMessage: '设置完成',
    });
  });

  it('rejects before uploading when no project is selected', async () => {
    window.history.replaceState({}, '', '/');

    await expect(
      uploadAndAutoCommitSelectedBackgroundCandidate(
        assetGateway,
        { episode: 2, beat: 3 },
        new Blob(['image']),
        'background.png',
        { sourceNodeId: 'source-node' },
      ),
    ).rejects.toThrow('缺少项目');
    expect(uploadAsset).not.toHaveBeenCalled();
  });
});
