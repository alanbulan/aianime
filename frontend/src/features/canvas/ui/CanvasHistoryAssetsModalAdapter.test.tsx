// Copyright (c) 2026 AI anime
import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CanvasAssetBuckets, CanvasHistoryAssetsModalController, CanvasNode } from '@/modules/creative_canvas/public';
;

import { CanvasHistoryAssetsModalAdapter } from './CanvasHistoryAssetsModalAdapter';

import { CANVAS_NODE_TYPES } from "@/modules/creative_canvas/public";
const mocks = vi.hoisted(() => ({
  nodes: [] as CanvasNode[],
  liveBuckets: null as CanvasAssetBuckets | null,
  viewerController: null as unknown,
  modalProps: vi.fn(),
  extractLive: vi.fn(),
  download: vi.fn(),
  buildManifest: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));


vi.mock('@/modules/creative_canvas/public', () => ({
  useCanvasStore: (selector: (state: { nodes: CanvasNode[] }) => unknown) =>
    selector({ nodes: mocks.nodes }),
  CANVAS_NODE_TYPES: { upload: 'uploadNode', imageEdit: 'imageNode', imageGen: 'imageGenNode', exportImage: 'exportImageNode', beatContext: 'beatContextNode', textAnnotation: 'textAnnotationNode', group: 'groupNode', storyboardSplit: 'storyboardNode', storyboardGen: 'storyboardGenNode', video: 'videoNode', audio: 'audioNode', videoStory: 'videoStoryNode', videoCompose: 'videoComposeNode', script: 'scriptNode', pano360Viewer: 'pano360ViewerNode', threeDWorld: 'threeDWorldNode', skill: 'skillNode' },
  extractCanvasAssets: (...args: unknown[]) => {
    mocks.extractLive(...args);
    return mocks.liveBuckets;
  },
  CanvasHistoryAssetsModal: (props: {
    ViewerLayer: (input: { controller: unknown }) => ReactNode;
  }) => {
    mocks.modalProps(props);
    const ViewerLayer = props.ViewerLayer;
    return <ViewerLayer controller={mocks.viewerController} />;
  },
  ImageViewerModal: ({
    open,
    imageUrl,
    onClose,
    onNavigate,
  }: {
    open: boolean;
    imageUrl: string;
    onClose: () => void;
    onNavigate: (direction: 'prev' | 'next') => void;
  }) =>
    open ? (
      <div>
        <span>image:{imageUrl}</span>
        <button type="button" onClick={onClose}>close-image</button>
        <button type="button" onClick={() => onNavigate('next')}>next-image</button>
      </div>
    ) : null,
  VideoViewerModal: ({
    open,
    videoUrl,
    onClose,
  }: {
    open: boolean;
    videoUrl: string;
    onClose: () => void;
  }) =>
    open ? (
      <button type="button" onClick={onClose}>video:{videoUrl}</button>
    ) : null,
}));

vi.mock('@/lib/media-url', () => ({
  resolveMediaUrl: (url: string | null | undefined) => url ?? null,
}));

vi.mock('@/lib/browserDownload', () => ({
  downloadUrlAsFile: (url: string) => mocks.download(url),
}));

vi.mock('@/features/viewer-kit/three-d/directorManifest', () => ({
  buildStandaloneWorldManifest: (input: unknown) => mocks.buildManifest(input),
}));

vi.mock('@/features/viewer-kit/three-d/ThreeDDirectorDialog', () => ({
  ThreeDDirectorDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <button type="button" onClick={() => onOpenChange(false)}>
        close-world
      </button>
    ) : null,
}));

function emptyBuckets(): CanvasAssetBuckets {
  return { image: [], video: [], audio: [], model: [] };
}

function viewerController(
  overrides: Partial<CanvasHistoryAssetsModalController> = {},
): CanvasHistoryAssetsModalController {
  return {
    imageViewerIndex: null,
    orderedImageUrls: [],
    closeImageViewer: vi.fn(),
    navigateImageViewer: vi.fn(),
    videoViewerUrl: null,
    closeVideoViewer: vi.fn(),
    worldViewerRequest: null,
    setWorldViewerOpen: vi.fn(),
    ...overrides,
  } as CanvasHistoryAssetsModalController;
}

function renderAdapter() {
  return render(
    <CanvasHistoryAssetsModalAdapter
      projectId="project-a"
      canvasId="canvas-a"
      onClose={vi.fn()}
      onUseAsset={vi.fn()}
      onDeleteNode={vi.fn()}
    />,
  );
}

describe('CanvasHistoryAssetsModalAdapter', () => {
  beforeEach(() => {
    mocks.nodes = [];
    mocks.liveBuckets = emptyBuckets();
    mocks.viewerController = viewerController();
    mocks.modalProps.mockReset();
    mocks.extractLive.mockReset();
    mocks.download.mockReset().mockResolvedValue(undefined);
    mocks.buildManifest.mockReset().mockReturnValue({ scene_id: 'world-a' });
  });

  it('adapts Canvas nodes, metadata, media, and browser ports', async () => {
    mocks.nodes = [
      {
        id: 'generated-image',
        type: CANVAS_NODE_TYPES.imageGen,
        data: {},
      },
      {
        id: 'world-a',
        type: CANVAS_NODE_TYPES.threeDWorld,
        data: {
          previewImageUrl: '/world-cover.png',
          sourceNodeId: 'source-a',
        },
      },
      {
        id: 'source-a',
        type: CANVAS_NODE_TYPES.upload,
        data: { displayName: '大学宿舍' },
      },
    ] as CanvasNode[];

    renderAdapter();

    const props = mocks.modalProps.mock.calls[0]?.[0] as {
      historyNodeIds: string[];
      resolveNodeMeta: (nodeId: string) => {
        cover: string | null;
        name: string | null;
      };
      liveAssetBuckets: CanvasAssetBuckets;
      resolveMediaUrl: (url: string) => string | null;
      downloadAsset: (url: string) => Promise<void>;
    };
    expect(props.historyNodeIds).toEqual(['generated-image', 'world-a']);
    expect(props.resolveNodeMeta('world-a')).toEqual({
      cover: '/world-cover.png',
      name: '大学宿舍',
    });
    expect(props.liveAssetBuckets).toBe(mocks.liveBuckets);
    expect(mocks.extractLive).toHaveBeenCalledWith(
      mocks.nodes,
      expect.any(Function),
    );
    expect(props.resolveMediaUrl('/image.png')).toBe('/image.png');
    await props.downloadAsset('/image.png');
    expect(mocks.download).toHaveBeenCalledWith('/image.png');
  });

  it('adapts image, video, and world viewer lifecycles', () => {
    const closeImageViewer = vi.fn();
    const navigateImageViewer = vi.fn();
    const closeVideoViewer = vi.fn();
    const setWorldViewerOpen = vi.fn();
    mocks.viewerController = viewerController({
      imageViewerIndex: 0,
      orderedImageUrls: ['/image-a.png'],
      closeImageViewer,
      navigateImageViewer,
      videoViewerUrl: '/video-a.mp4',
      closeVideoViewer,
      worldViewerRequest: {
        projectId: 'project-a',
        url: '/world-a.sog',
        displayName: '世界 A',
      },
      setWorldViewerOpen,
    });

    renderAdapter();

    expect(screen.getByText('image:/image-a.png')).toBeInTheDocument();
    expect(screen.getByText('video:/video-a.mp4')).toBeInTheDocument();
    expect(screen.getByText('close-world')).toBeInTheDocument();
    expect(mocks.buildManifest).toHaveBeenCalledWith({
      project: 'project-a',
      url: '/world-a.sog',
      displayName: '世界 A',
    });

    fireEvent.click(screen.getByText('close-image'));
    fireEvent.click(screen.getByText('next-image'));
    fireEvent.click(screen.getByText('video:/video-a.mp4'));
    fireEvent.click(screen.getByText('close-world'));
    expect(closeImageViewer).toHaveBeenCalledOnce();
    expect(navigateImageViewer).toHaveBeenCalledWith('next');
    expect(closeVideoViewer).toHaveBeenCalledOnce();
    expect(setWorldViewerOpen).toHaveBeenCalledWith(false);
  });
});
