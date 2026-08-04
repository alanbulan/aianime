// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ThreeDWorldNodeController } from '@/features/canvas/hooks/useThreeDWorldNodeController';
import { ThreeDWorldNodeView } from './ThreeDWorldNodeView';

vi.mock('@xyflow/react', () => ({
  Handle: ({ id }: { id: string }) => <div>handle:{id}</div>,
  Position: { Left: 'left', Right: 'right' },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      String(options?.defaultValue ?? key),
  }),
}));

vi.mock('@/features/canvas/ui/NodeHeader', () => ({
  NODE_HEADER_FLOATING_POSITION_CLASS: 'floating',
  NodeHeader: ({
    titleText,
    onTitleChange,
  }: {
    titleText: string;
    onTitleChange(value: string): void;
  }) => (
    <button type="button" onClick={() => onTitleChange('新标题')}>
      title:{titleText}
    </button>
  ),
}));

vi.mock('@/modules/creative_canvas/public', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/creative_canvas/public')>()),
  NodeGenerationOverlay: () => <div>generation-overlay</div>,
  ReferenceDetachButton: ({ nodeId }: { nodeId: string }) => (
    <span>detach:{nodeId}</span>
  ),
  ReferenceTextChip: ({ sourceLabel }: { sourceLabel: string }) => (
    <div>text-ref:{sourceLabel}</div>
  ),
  NodeResizeHandle: ({
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
  }: {
    minWidth: number;
    minHeight: number;
    maxWidth: number;
    maxHeight: number;
  }) => <div>resize:{minWidth}:{minHeight}:{maxWidth}:{maxHeight}</div>,
  NodeGenerationHistory: ({
    records,
    onRestore,
    onRefresh,
  }: {
    records: Array<Record<string, unknown>>;
    onRestore(record: Record<string, unknown>): void;
    onRefresh(): void;
  }) => (
    <div>
      <button type="button" onClick={() => onRestore(records[0])}>
        restore-history
      </button>
      <button type="button" onClick={onRefresh}>
        refresh-history
      </button>
    </div>
  ),
}));

vi.mock('@/features/viewer-kit/three-d/ThreeDDirectorDialog', () => ({
  ThreeDDirectorDialog: ({
    viewerPurpose,
    onOpenChange,
    onCaptureSelectedBackground,
    onSubmitDirectorCombined,
    onCaptureCanvasNode,
  }: {
    viewerPurpose: string;
    onOpenChange(value: boolean): void;
    onCaptureSelectedBackground?: (blob: Blob) => void;
    onSubmitDirectorCombined?: (blob: Blob, meta: unknown) => void;
    onCaptureCanvasNode(blob: Blob, meta: unknown): void;
  }) => (
    <div>
      <span>dialog:{viewerPurpose}</span>
      <button type="button" onClick={() => onOpenChange(false)}>
        close-dialog
      </button>
      {onCaptureSelectedBackground ? (
        <button
          type="button"
          onClick={() => onCaptureSelectedBackground(new Blob())}
        >
          capture-background
        </button>
      ) : null}
      {onSubmitDirectorCombined ? (
        <button
          type="button"
          onClick={() => onSubmitDirectorCombined(new Blob(), {})}
        >
          submit-combined
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onCaptureCanvasNode(new Blob(), {})}
      >
        capture-canvas
      </button>
    </div>
  ),
}));

function createController(): ThreeDWorldNodeController {
  return {
    data: { errorMessage: null },
    selected: true,
    size: { width: 340, height: 210 },
    title: '导演世界',
    nodeContexts: [],
    isGenerating: false,
    hasUpstream: true,
    referenceImages: [
      { nodeId: 'image-a', url: '/a.png', displayName: '图片 A' },
      { nodeId: 'image-b', url: '/b.png', displayName: '图片 B' },
    ],
    selectedReferenceNodeId: 'image-a',
    referenceImage: {
      nodeId: 'image-a',
      url: '/a.png',
      displayName: '图片 A',
    },
    referenceText: null,
    selectedImageSourceKind: 'master',
    historyRecords: [{ id: 'history-a', result: { ply_url: '/a.sog' } }],
    historyLoading: false,
    preview: {
      hasMainlineContext: false,
      previewUrl: null,
      hasPreview: false,
    },
    directorBusy: false,
    directorDialogOpen: false,
    directorManifest: null,
    beatContext: null,
    initialScene: null,
    initialScenesBySourceId: {},
    select: vi.fn(),
    rename: vi.fn(),
    openDirector: vi.fn(),
    changeDirectorDialogOpen: vi.fn(),
    changeReferenceImage: vi.fn(),
    changeSourceKind: vi.fn(),
    submitGeneration: vi.fn(),
    focusUpstream: vi.fn(),
    detachUpstream: vi.fn(),
    restoreHistory: vi.fn(),
    refreshHistory: vi.fn(),
    captureSelectedBackground: vi.fn(),
    submitDirectorCombined: vi.fn(),
    captureCanvasNode: vi.fn(),
    saveScene: vi.fn(),
    registerSaveSceneHandler: vi.fn(),
    clearScene: vi.fn(),
    currentPlyUrl: '/a.sog',
    previewThumbnailUrl: '/a.png',
  } as unknown as ThreeDWorldNodeController;
}

describe('ThreeDWorldNodeView', () => {
  it('renders the selected editor and forwards node, source, and history commands', () => {
    const controller = createController();
    render(<ThreeDWorldNodeView controller={controller} />);

    fireEvent.click(screen.getByRole('button', { name: 'title:导演世界' }));
    fireEvent.click(
      screen.getByRole('button', {
        name: 'viewer.threeD.enterDirectorWorld',
      }),
    );
    const reference = screen.getByTitle('引用上游图片');
    fireEvent.click(reference);
    fireEvent.mouseEnter(reference);
    fireEvent.change(
      screen.getByRole('combobox', { name: '3DGS 来源类型' }),
      { target: { value: 'pano' } },
    );
    fireEvent.change(screen.getAllByRole('combobox')[0], {
      target: { value: 'image-b' },
    });
    fireEvent.click(
      screen.getByRole('button', {
        name: /nodeToolbar.generateDirectorWorld/,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'restore-history' }));
    fireEvent.click(screen.getByRole('button', { name: 'refresh-history' }));
    fireEvent.click(screen.getByRole('button', { name: 'close-dialog' }));

    expect(controller.rename).toHaveBeenCalledWith('新标题');
    expect(controller.openDirector).toHaveBeenCalled();
    expect(controller.focusUpstream).toHaveBeenCalledWith('image-a');
    expect(controller.changeSourceKind).toHaveBeenCalledWith('pano');
    expect(controller.changeReferenceImage).toHaveBeenCalledWith('image-b');
    expect(controller.submitGeneration).toHaveBeenCalled();
    expect(controller.restoreHistory).toHaveBeenCalledWith(
      controller.historyRecords[0],
    );
    expect(controller.refreshHistory).toHaveBeenCalled();
    expect(controller.changeDirectorDialogOpen).toHaveBeenCalledWith(false);
    expect(screen.getByAltText('上游图片引用预览')).toBeInTheDocument();
    expect(screen.getByText('resize:280:170:1200:900')).toBeInTheDocument();
    expect(screen.getByText('handle:target')).toBeInTheDocument();
    expect(screen.getByText('handle:source')).toBeInTheDocument();
    expect(screen.getByText('dialog:freezone')).toBeInTheDocument();
  });

  it('renders beat capture actions and a stable generated preview', () => {
    const controller = createController();
    controller.beatContext = { episode: 1, beat: 2 };
    controller.isGenerating = true;
    controller.preview = {
      ...controller.preview,
      previewUrl: '/combined.png',
      hasPreview: true,
    };
    render(<ThreeDWorldNodeView controller={controller} />);

    fireEvent.click(screen.getByRole('button', { name: 'capture-background' }));
    fireEvent.click(screen.getByRole('button', { name: 'submit-combined' }));
    fireEvent.click(screen.getByRole('button', { name: 'capture-canvas' }));

    expect(screen.getByAltText('导演世界缩略图')).toHaveAttribute(
      'src',
      '/combined.png',
    );
    expect(screen.getByText('generation-overlay')).toBeInTheDocument();
    expect(screen.getByText('dialog:beat')).toBeInTheDocument();
    expect(controller.captureSelectedBackground).toHaveBeenCalled();
    expect(controller.submitDirectorCombined).toHaveBeenCalled();
    expect(controller.captureCanvasNode).toHaveBeenCalled();
  });
});
