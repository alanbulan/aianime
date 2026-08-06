// Copyright (c) 2026 AI anime
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UploadImageNodeData } from '../domain/canvasNodeData';
import type { CanvasEdge } from '../domain/canvasNodeData';
import {
  createUseUploadNodeController,
  type UploadNodeStore,
  type UploadNodeStoreHook,
  type UploadNodeSettingsStore,
  type UploadNodeSettingsStoreHook,
} from './useUploadNodeController';

const mocks = vi.hoisted(() => ({
  edges: [] as Array<{ source: string; target: string }>,
  subscribers: new Map<string, Set<(payload: unknown) => void>>(),
  setSelectedNode: vi.fn(),
  updateNodeData: vi.fn(),
  convertNodeType: vi.fn(),
  addPanoCaptureGroup: vi.fn(),
  updateNodeInternals: vi.fn(),
  prepareNodeImageFromFile: vi.fn(),
  uploadCanvasAsset: vi.fn(),
  uploadLocalImageToBackend: vi.fn(),
  getCanvasBeatDirectorManifest: vi.fn(),
  createObjectURL: vi.fn(),
  revokeObjectURL: vi.fn(),
  useUploadFilenameAsNodeTitle: false,
}));

const NODE_CONTEXT = { projectId: 'project-a' } as const;

vi.mock('@xyflow/react', () => ({
  useStore: (selector: (state: { transform: [number, number, number] }) => unknown) =>
    selector({ transform: [0, 0, 1] }),
  useUpdateNodeInternals: () => mocks.updateNodeInternals,
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn() },
}));

vi.mock('zustand/react/shallow', () => ({
  useShallow: (selector: unknown) => selector,
}));

vi.mock('../domain/mainlineContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../domain/mainlineContext')>()),
  hasMainlineContexts: (value: unknown) => Array.isArray(value) && value.length > 0,
}));

const useStore = ((
  selector: (state: UploadNodeStore) => unknown,
) =>
  selector({
    edges: mocks.edges as unknown as readonly CanvasEdge[],
    setSelectedNode: mocks.setSelectedNode,
    updateNodeData: mocks.updateNodeData,
    convertNodeType: mocks.convertNodeType,
    addPanoCaptureGroup: mocks.addPanoCaptureGroup,
  })) as unknown as UploadNodeStoreHook;

const useSettingsStore = ((
  selector: (state: UploadNodeSettingsStore) => unknown,
) =>
  selector({
    useUploadFilenameAsNodeTitle: mocks.useUploadFilenameAsNodeTitle,
  })) as unknown as UploadNodeSettingsStoreHook;

const eventPort = {
  publish: vi.fn((topic: string, payload: unknown) => {
    for (const subscriber of mocks.subscribers.get(topic) ?? []) {
      subscriber(payload);
    }
  }),
  subscribe: (topic: string, subscriber: (payload: unknown) => void) => {
    const subscribers = mocks.subscribers.get(topic) ?? new Set();
    subscribers.add(subscriber);
    mocks.subscribers.set(topic, subscribers);
    return () => subscribers.delete(subscriber);
  },
} as unknown as Parameters<typeof createUseUploadNodeController>[0]['eventPort'];

const useUploadNodeController = createUseUploadNodeController({
  useStore,
  useSettingsStore,
  eventPort,
  uploadCanvasAsset: mocks.uploadCanvasAsset,
  prepareNodeImageFromFile: mocks.prepareNodeImageFromFile,
  uploadLocalImageToBackend: mocks.uploadLocalImageToBackend,
  getCanvasBeatDirectorManifest: mocks.getCanvasBeatDirectorManifest,
  directorCaptureBlobToDataUrl: vi.fn(async (blob: Blob) => `data:${blob.size}`),
  readDirectorCaptureImageSize: vi.fn(async () => ({ width: 1920, height: 1080 })),
});

function data(
  patch: Partial<UploadImageNodeData> = {},
): UploadImageNodeData {
  return {
    label: '上传资源',
    displayName: '上传资源',
    imageUrl: null,
    aspectRatio: '1:1',
    ...patch,
  };
}

function fileChange(file: File) {
  return {
    target: { files: [file], value: file.name },
  } as never;
}

describe('useUploadNodeController', () => {
  beforeEach(() => {
    mocks.edges.splice(0);
    mocks.subscribers.clear();
    mocks.setSelectedNode.mockReset();
    mocks.updateNodeData.mockReset();
    mocks.convertNodeType.mockReset().mockReturnValue(true);
    mocks.addPanoCaptureGroup.mockReset().mockReturnValue('group-a');
    mocks.updateNodeInternals.mockReset();
    mocks.prepareNodeImageFromFile
      .mockReset()
      .mockResolvedValue({ aspectRatio: '16:9' });
    mocks.uploadCanvasAsset.mockReset().mockImplementation(
      async (_projectId: string, _file: Blob, filename: string) => ({
        filename,
        url: `/assets/${filename}`,
      }),
    );
    mocks.uploadLocalImageToBackend.mockReset();
    mocks.getCanvasBeatDirectorManifest.mockReset();
    mocks.createObjectURL.mockReset().mockImplementation(
      (file: File) => `blob:${file.name}`,
    );
    mocks.revokeObjectURL.mockReset();
    mocks.useUploadFilenameAsNodeTitle = false;
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: mocks.createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: mocks.revokeObjectURL,
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('projects state and owns selection, rename, and node-internals updates', () => {
    const { result } = renderHook(() =>
      useUploadNodeController({
        ...NODE_CONTEXT,
        id: 'upload-a',
        data: data({
          imageUrl: '/original.png',
          previewImageUrl: '/preview.png',
          mainline_context: [{ kind: 'frame' }],
        }),
        selected: true,
        width: 450.4,
        height: 300.4,
      }),
    );

    expect(result.current).toMatchObject({
      id: 'upload-a',
      selected: true,
      title: '上传资源',
      hasMainlineContext: true,
      hasMediaContent: true,
      size: { width: 450, height: 300 },
    });
    expect(result.current.imageSource).toContain('/preview.png');
    expect(mocks.updateNodeInternals).toHaveBeenCalledWith('upload-a');

    act(() => result.current.select());
    act(() => result.current.rename('新标题'));
    expect(mocks.setSelectedNode).toHaveBeenCalledWith('upload-a');
    expect(mocks.updateNodeData).toHaveBeenCalledWith('upload-a', {
      displayName: '新标题',
    });
  });

  it('routes empty-MIME video and audio files while image-only nodes reject both', () => {
    const video = new File(['video'], 'source.mxf', { type: '' });
    const audio = new File(['audio'], 'voice.wav', { type: 'audio/wav' });
    const { unmount } = renderHook(() =>
      useUploadNodeController({
        ...NODE_CONTEXT,
        id: 'upload-a',
        data: data(),
      }),
    );

    act(() => {
      for (const subscriber of mocks.subscribers.get(
        'upload-node/external-file',
      ) ?? []) {
        subscriber({ nodeId: 'upload-a', file: video });
        subscriber({ nodeId: 'upload-a', file: audio });
      }
    });
    expect(mocks.convertNodeType).toHaveBeenNthCalledWith(
      1,
      'upload-a',
      'videoNode',
      { referenceOnly: true, sourceFileName: 'source.mxf' },
    );
    expect(mocks.convertNodeType).toHaveBeenNthCalledWith(
      2,
      'upload-a',
      'audioNode',
      { sourceFileName: 'voice.wav' },
    );

    unmount();
    mocks.convertNodeType.mockClear();
    renderHook(() =>
      useUploadNodeController({
        ...NODE_CONTEXT,
        id: 'upload-image',
        data: data({ imageOnly: true }),
      }),
    );
    act(() => {
      for (const subscriber of mocks.subscribers.get(
        'upload-node/external-file',
      ) ?? []) {
        subscriber({ nodeId: 'upload-image', file: video });
        subscriber({ nodeId: 'upload-image', file: audio });
      }
    });
    expect(mocks.convertNodeType).not.toHaveBeenCalled();
  });

  it('lets the newest image upload win and prevents the stale request from writing back', async () => {
    const first = new File(['first'], 'first.png', { type: 'image/png' });
    const second = new File(['second'], 'second.png', { type: 'image/png' });
    let resolveFirst: ((value: { filename: string; url: string }) => void) | null =
      null;
    let resolveSecond: ((value: { filename: string; url: string }) => void) | null =
      null;
    mocks.uploadCanvasAsset.mockImplementation(
      (_projectId: string, file: File, _filename: string) =>
        new Promise<{ filename: string; url: string }>((resolve) => {
          if (file.name === 'first.png') resolveFirst = resolve;
          else resolveSecond = resolve;
        }),
    );
    const { result } = renderHook(() =>
      useUploadNodeController({
        ...NODE_CONTEXT,
        id: 'upload-a',
        data: data(),
      }),
    );

    let firstUpload!: Promise<void>;
    let secondUpload!: Promise<void>;
    act(() => {
      firstUpload = result.current.changeFile(fileChange(first));
      secondUpload = result.current.changeFile(fileChange(second));
    });
    await act(async () => {
      resolveSecond?.({ filename: 'second.png', url: '/second.png' });
      await secondUpload;
    });
    await act(async () => {
      resolveFirst?.({ filename: 'first.png', url: '/first.png' });
      await firstUpload;
    });

    expect(mocks.updateNodeData).toHaveBeenCalledWith(
      'upload-a',
      expect.objectContaining({
        imageUrl: '/second.png',
        sourceFileName: 'second.png',
      }),
    );
    expect(mocks.updateNodeData).not.toHaveBeenCalledWith(
      'upload-a',
      expect.objectContaining({ imageUrl: '/first.png' }),
    );
  });

  it('loads a Director manifest with the bundle source and persists combined output', async () => {
    mocks.getCanvasBeatDirectorManifest.mockResolvedValue({
      allowed_destinations: ['mainline'],
    });
    const { result } = renderHook(() =>
      useUploadNodeController({
        ...NODE_CONTEXT,
        id: 'upload-a',
        data: data({
          __freezone_source: {
            role: 'director_combined',
            meta: { episode: 3, beat: 5 },
          },
          director_control_bundle: {
            schema_version: 'director_control_bundle_v1',
            dir: 'freezone/director-world',
            paths: {},
            rel_paths: {},
            source: {
              source_id: 'director-source',
              source_type: 'sog',
              source_kind: 'master',
            },
          },
        }),
      }),
    );

    await act(async () => result.current.openDirectorStage());
    expect(mocks.getCanvasBeatDirectorManifest).toHaveBeenCalledWith({
      projectId: 'project-a',
      episode: 3,
      beat: 5,
    });
    expect(result.current.directorStageManifest).toMatchObject({
      active_source_id: 'director-source',
      allowed_destinations: ['mainline', 'canvas_screenshot_node'],
    });
    expect(result.current.directorStageOpen).toBe(true);

    const frameMeta = {
      schema_version: 'director_frame_meta_v1',
      source: {
        source_id: 'director-source',
        source_type: 'sog',
        source_kind: 'master',
      },
      camera: { mode: 'sog', frame_aspect: '16:9', state: {} },
      layer: {
        source_id: 'director-source',
        actors: [],
        props: [],
        stagings: [],
      },
    } as const;
    await act(async () =>
      result.current.submitDirectorCombined(new Blob(), {
        captureBundle: {
          combined: new Blob(['combined']),
          env_only: new Blob(['environment']),
          frame_meta: frameMeta,
        },
      } as never),
    );
    expect(mocks.uploadCanvasAsset).toHaveBeenCalledTimes(3);
    expect(mocks.updateNodeData).toHaveBeenLastCalledWith(
      'upload-a',
      expect.objectContaining({
        imageUrl: expect.stringContaining('director-world-upload-a-combined-'),
        director_control_bundle: expect.objectContaining({
          schema_version: 'director_control_bundle_v1',
        }),
        slot_target: { kind: 'director_render', episode: 3, beat: 5 },
        uploadError: null,
      }),
    );
  });
});
