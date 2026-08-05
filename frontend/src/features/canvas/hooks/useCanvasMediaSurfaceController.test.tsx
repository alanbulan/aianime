// Copyright (c) 2026 AI anime
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CanvasHistoryAssetControllerOptions,
  CanvasMediaTransferControllerOptions,
} from '@/modules/creative_canvas/public';
;
import {
  useCanvasMediaSurfaceController,
  type CanvasMediaSurfaceControllerOptions,
} from './useCanvasMediaSurfaceController';

import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
const controllerMocks = vi.hoisted(() => {
  const mediaTransfer = {
    queueSnapshotPaste: vi.fn(),
    spawnAsset: vi.fn(() => 'spawned-node'),
    isCanvasDropActive: false,
    handleCanvasDragEnter: vi.fn(),
    handleCanvasDragOver: vi.fn(),
    handleCanvasDragLeave: vi.fn(),
    handleCanvasDrop: vi.fn(),
  };
  const historyAssets = {
    useHistoryAsset: vi.fn(),
    deleteHistoryNode: vi.fn(),
  };
  return {
    mediaTransfer,
    historyAssets,
    hydrateAsset: vi.fn(async (payload) => payload),
    isImmersiveViewerActive: vi.fn(() => false),
    spawnCanvasAssetNode: vi.fn(() => 'spawned-asset-node'),
    useMediaTransfer: vi.fn(
      (_options: CanvasMediaTransferControllerOptions) => mediaTransfer,
    ),
    useHistoryAssets: vi.fn(
      (_options: CanvasHistoryAssetControllerOptions) => historyAssets,
    ),
  };
});

vi.mock('@/modules/creative_canvas/public', () => ({
  CANVAS_NODE_TYPES: { upload: 'uploadNode', imageEdit: 'imageNode', imageGen: 'imageGenNode', exportImage: 'exportImageNode', beatContext: 'beatContextNode', textAnnotation: 'textAnnotationNode', group: 'groupNode', storyboardSplit: 'storyboardNode', storyboardGen: 'storyboardGenNode', video: 'videoNode', audio: 'audioNode', videoStory: 'videoStoryNode', videoCompose: 'videoComposeNode', script: 'scriptNode', pano360Viewer: 'pano360ViewerNode', threeDWorld: 'threeDWorldNode', skill: 'skillNode' },
  spawnCanvasAssetNode: controllerMocks.spawnCanvasAssetNode,
  useCanvasHistoryAssetController: controllerMocks.useHistoryAssets,
  useCanvasMediaTransferController: controllerMocks.useMediaTransfer,
}));
vi.mock('@/features/canvas/composition', () => ({
  hydrateAssetDragPayload: controllerMocks.hydrateAsset,
}));
vi.mock('@/features/viewer-kit/useViewerImmersiveBody', () => ({
  isImmersiveViewerActive: controllerMocks.isImmersiveViewerActive,
}));

function createOptions(): CanvasMediaSurfaceControllerOptions {
  return {
    selectedUploadNodeId: 'upload-node',
    getPreferredClientPosition: vi.fn(() => ({ x: 10, y: 20 })),
    screenToFlowPosition: vi.fn((position) => position),
    createNode: vi.fn(() => 'created-node'),
    selectNode: vi.fn(),
    eventBus: {
      publish: vi.fn(),
    } as unknown as CanvasMediaSurfaceControllerOptions['eventBus'],
    getViewportCenter: vi.fn(() => ({ x: 100, y: 200 })),
    deleteNode: vi.fn(),
  };
}

describe('useCanvasMediaSurfaceController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assembles transfer and history commands through one media surface', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasMediaSurfaceController(options),
    );

    expect(controllerMocks.useMediaTransfer).toHaveBeenCalledWith({
      selectedUploadNodeId: options.selectedUploadNodeId,
      getPreferredClientPosition: options.getPreferredClientPosition,
      screenToFlowPosition: options.screenToFlowPosition,
      selectNode: options.selectNode,
      createUploadNode: expect.any(Function),
      eventPort: expect.objectContaining({
        pasteImageIntoNode: expect.any(Function),
        attachExternalFile: expect.any(Function),
      }),
      hydrateAsset: expect.any(Function),
      spawnAsset: expect.any(Function),
      isImmersiveViewerActive: controllerMocks.isImmersiveViewerActive,
    });
    const transferOptions = controllerMocks.useMediaTransfer.mock.calls[0]?.[0];
    expect(transferOptions?.createUploadNode({ x: 3, y: 4 })).toBe('created-node');
    expect(options.createNode).toHaveBeenCalledWith(
      CANVAS_NODE_TYPES.upload,
      { x: 3, y: 4 },
      { user_spawned: true },
    );
    const image = new File(['image'], 'image.png', { type: 'image/png' });
    transferOptions?.eventPort.pasteImageIntoNode('upload-node', image);
    expect(options.eventBus.publish).toHaveBeenCalledWith(
      'upload-node/paste-image',
      { nodeId: 'upload-node', file: image },
    );
    expect(result.current).toEqual({
      queueSnapshotPaste: controllerMocks.mediaTransfer.queueSnapshotPaste,
      isCanvasDropActive: false,
      handleCanvasDragEnter:
        controllerMocks.mediaTransfer.handleCanvasDragEnter,
      handleCanvasDragOver: controllerMocks.mediaTransfer.handleCanvasDragOver,
      handleCanvasDragLeave:
        controllerMocks.mediaTransfer.handleCanvasDragLeave,
      handleCanvasDrop: controllerMocks.mediaTransfer.handleCanvasDrop,
      ...controllerMocks.historyAssets,
    });
  });

  it('keeps the shared spawn command internal to history-asset assembly', () => {
    const options = createOptions();
    const { result } = renderHook(() =>
      useCanvasMediaSurfaceController(options),
    );

    expect(controllerMocks.useHistoryAssets).toHaveBeenCalledWith({
      getViewportCenter: options.getViewportCenter,
      spawnAsset: controllerMocks.mediaTransfer.spawnAsset,
      selectNode: options.selectNode,
      deleteNode: options.deleteNode,
    });
    expect(result.current).not.toHaveProperty('spawnAsset');
  });
});
