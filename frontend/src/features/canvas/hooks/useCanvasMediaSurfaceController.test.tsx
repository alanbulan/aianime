// Copyright (c) 2026 AI anime
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CanvasHistoryAssetControllerOptions,
} from './useCanvasHistoryAssetController';
import type {
  CanvasMediaTransferControllerOptions,
} from './useCanvasMediaTransferController';
import {
  useCanvasMediaSurfaceController,
  type CanvasMediaSurfaceControllerOptions,
} from './useCanvasMediaSurfaceController';

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
    useMediaTransfer: vi.fn(
      (_options: CanvasMediaTransferControllerOptions) => mediaTransfer,
    ),
    useHistoryAssets: vi.fn(
      (_options: CanvasHistoryAssetControllerOptions) => historyAssets,
    ),
  };
});

vi.mock('./useCanvasMediaTransferController', () => ({
  useCanvasMediaTransferController: controllerMocks.useMediaTransfer,
}));
vi.mock('./useCanvasHistoryAssetController', () => ({
  useCanvasHistoryAssetController: controllerMocks.useHistoryAssets,
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
      createNode: options.createNode,
      selectNode: options.selectNode,
      eventBus: options.eventBus,
    });
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
