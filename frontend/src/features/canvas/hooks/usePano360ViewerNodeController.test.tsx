// Copyright (c) 2026 AI anime
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type Pano360ViewerNodeData,
} from '@/features/canvas/domain/canvasNodes';

import { usePano360ViewerNodeController } from './usePano360ViewerNodeController';

const mocks = vi.hoisted(() => ({
  upstreamNodes: [] as CanvasNode[],
  selectedNodeId: null as string | null,
  setSelectedNode: vi.fn(),
  updateNodeData: vi.fn(),
  addPanoCaptureGroup: vi.fn(),
  updateNodeInternals: vi.fn(),
  uploadLocalImageToBackend: vi.fn(),
  commitBackground: vi.fn(),
  getCanvasMetadata: vi.fn(),
  writeClipboard: vi.fn(),
  createViewer: vi.fn(),
}));

vi.mock('@xyflow/react', () => ({
  useUpdateNodeInternals: () => mocks.updateNodeInternals,
}));

vi.mock('@photo-sphere-viewer/core', () => ({
  Viewer: mocks.createViewer,
  CONSTANTS: {
    ACTIONS: {
      ROTATE_UP: 'rotate-up',
      ROTATE_DOWN: 'rotate-down',
      ROTATE_LEFT: 'rotate-left',
      ROTATE_RIGHT: 'rotate-right',
      ZOOM_IN: 'zoom-in',
      ZOOM_OUT: 'zoom-out',
    },
  },
}));

vi.mock('@/features/canvas/canvasStore', () => ({
  useCanvasStore: (
    selector: (state: {
      selectedNodeId: string | null;
      setSelectedNode: typeof mocks.setSelectedNode;
      updateNodeData: typeof mocks.updateNodeData;
      addPanoCaptureGroup: typeof mocks.addPanoCaptureGroup;
    }) => unknown,
  ) =>
    selector({
      selectedNodeId: mocks.selectedNodeId,
      setSelectedNode: mocks.setSelectedNode,
      updateNodeData: mocks.updateNodeData,
      addPanoCaptureGroup: mocks.addPanoCaptureGroup,
    }),
}));

vi.mock('@/features/canvas/hooks/useUpstreamGraph', () => ({
  useUpstreamNodes: () => mocks.upstreamNodes,
}));

vi.mock('@/features/canvas/composition', () => ({
  uploadLocalImageToBackend: (...args: unknown[]) =>
    mocks.uploadLocalImageToBackend(...args),
  uploadAndAutoCommitSelectedBackgroundCandidate: (...args: unknown[]) =>
    mocks.commitBackground(...args),
}));

vi.mock('@/features/freezone/public', () => ({
  getFreezoneCanvasMetadata: () => mocks.getCanvasMetadata(),
}));

function data(
  patch: Partial<Pano360ViewerNodeData> = {},
): Pano360ViewerNodeData {
  return {
    imageUrl: null,
    sphereCorrectionDeg: { roll: 0, pitch: 0, yaw: 0 },
    frontYawDeg: 0,
    fovDeg: 70,
    displayName: '全景查看器',
    ...patch,
  };
}

function upstreamNode({
  id,
  y,
  imageUrl,
}: {
  id: string;
  y: number;
  imageUrl: string;
}): CanvasNode {
  return {
    id,
    type: CANVAS_NODE_TYPES.upload,
    position: { x: 0, y },
    data: { imageUrl },
  } as CanvasNode;
}

function createViewerRuntime() {
  return {
    state: { ready: true },
    addEventListener: vi.fn(),
    setPanorama: vi.fn(async () => undefined),
    setOption: vi.fn(),
    zoom: vi.fn(),
    rotate: vi.fn(),
    getPosition: vi.fn(() => ({ yaw: 0, pitch: 0 })),
    getZoomLevel: vi.fn(() => 50),
    toggleFullscreen: vi.fn(),
    destroy: vi.fn(),
  };
}

function ViewerHarness({ nodeData }: { nodeData: Pano360ViewerNodeData }) {
  const controller = usePano360ViewerNodeController({
    id: 'pano-a',
    data: nodeData,
    selected: true,
  });
  return <div ref={controller.viewerHostRef}>{controller.status}</div>;
}

describe('usePano360ViewerNodeController', () => {
  beforeEach(() => {
    mocks.upstreamNodes.splice(0);
    mocks.selectedNodeId = null;
    mocks.setSelectedNode.mockReset();
    mocks.updateNodeData.mockReset();
    mocks.addPanoCaptureGroup.mockReset();
    mocks.updateNodeInternals.mockReset();
    mocks.uploadLocalImageToBackend.mockReset();
    mocks.commitBackground.mockReset();
    mocks.getCanvasMetadata.mockReset();
    mocks.writeClipboard.mockReset().mockResolvedValue(undefined);
    mocks.createViewer.mockReset();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: mocks.writeClipboard },
    });
  });

  it('projects active state and synchronizes the first upstream panorama', () => {
    mocks.selectedNodeId = 'pano-a';
    mocks.upstreamNodes.push(
      upstreamNode({ id: 'late', y: 200, imageUrl: '/late.png' }),
      upstreamNode({ id: 'first', y: 20, imageUrl: '/first.png' }),
    );

    const { result } = renderHook(() =>
      usePano360ViewerNodeController({
        id: 'pano-a',
        data: data(),
        selected: true,
        width: 1100.4,
        height: 650.6,
      }),
    );

    expect(result.current).toMatchObject({
      id: 'pano-a',
      title: '全景查看器',
      isActive: true,
      size: { width: 1100, height: 651 },
      liveFov: 70,
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('pano-a', {
      imageUrl: '/first.png',
      sourceNodeId: 'first',
    });
    expect(mocks.updateNodeInternals).toHaveBeenCalledWith('pano-a');

    act(() => result.current.select());
    act(() => result.current.rename('新全景'));
    expect(mocks.setSelectedNode).toHaveBeenCalledWith('pano-a');
    expect(mocks.updateNodeData).toHaveBeenCalledWith('pano-a', {
      displayName: '新全景',
    });
  });

  it('clears disconnected upstream data without activating grouped selection', () => {
    mocks.selectedNodeId = 'group-a';
    const { result } = renderHook(() =>
      usePano360ViewerNodeController({
        id: 'pano-a',
        data: data({ imageUrl: '/old.png', sourceNodeId: 'upload-a' }),
        selected: true,
      }),
    );

    expect(result.current.isActive).toBe(false);
    expect(mocks.updateNodeData).toHaveBeenCalledWith('pano-a', {
      imageUrl: null,
      sourceNodeId: null,
    });
  });

  it('owns correction, FOV, front direction, and panel commands', () => {
    const { result } = renderHook(() =>
      usePano360ViewerNodeController({ id: 'pano-a', data: data() }),
    );

    act(() => result.current.updateCorrectionAxis('pitch', 120));
    act(() => result.current.setFovDeg(200));
    act(() => result.current.setFrontYaw(270));
    act(() => result.current.togglePanel());

    expect(mocks.updateNodeData).toHaveBeenCalledWith('pano-a', {
      sphereCorrectionDeg: { roll: 0, pitch: 90, yaw: 0 },
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('pano-a', {
      fovDeg: 170,
    });
    expect(mocks.updateNodeData).toHaveBeenCalledWith('pano-a', {
      frontYawDeg: -90,
    });
    expect(result.current.isPanelOpen).toBe(false);
  });

  it('persists and copies the current correction contract', async () => {
    const { result } = renderHook(() =>
      usePano360ViewerNodeController({
        id: 'pano-a',
        data: data({
          imageUrl: '/pano.png',
          sphereCorrectionDeg: { roll: 10, pitch: 20, yaw: 30 },
          frontYawDeg: 45,
        }),
      }),
    );

    await act(async () => result.current.copyCorrectionJson());

    const exported = mocks.updateNodeData.mock.calls.find(
      ([, patch]) => 'lastExportedEntry' in patch,
    )?.[1].lastExportedEntry as Record<string, unknown>;
    expect(exported).toMatchObject({
      pano_url: '/pano.png',
      front_yaw_deg: 45,
      sphere_correction_deg: { roll: 10, pitch: 20, yaw: 30 },
    });
    expect(mocks.writeClipboard).toHaveBeenCalledWith(
      expect.stringContaining('"sphere_correction_deg"'),
    );
  });

  it('creates one viewer for the mounted host and destroys it on unmount', async () => {
    mocks.selectedNodeId = 'pano-a';
    const viewer = createViewerRuntime();
    mocks.createViewer.mockImplementation(function createMockViewer() {
      return viewer;
    });

    const { unmount } = render(
      <ViewerHarness nodeData={data({ imageUrl: '/pano.png' })} />,
    );

    await waitFor(() => expect(viewer.setPanorama).toHaveBeenCalledOnce());
    expect(mocks.createViewer).toHaveBeenCalledWith(
      expect.objectContaining({
        navbar: false,
        minFov: 5,
        maxFov: 170,
        mousemove: true,
        mousewheel: true,
        rendererParameters: { preserveDrawingBuffer: true },
      }),
    );
    expect(viewer.setPanorama).toHaveBeenCalledWith(
      expect.any(String),
      { showLoader: false, transition: false },
    );

    unmount();
    expect(viewer.destroy).toHaveBeenCalledOnce();
  });
});
