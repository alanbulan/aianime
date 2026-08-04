// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ImageNodeController } from '@/features/canvas/hooks/useImageNodeController';

import { ImageNodeView } from './ImageNodeView';

vi.mock('@xyflow/react', () => ({
  Handle: ({ id }: { id: string }) => <div>handle:{id}</div>,
  Position: { Left: 'left', Right: 'right' },
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

vi.mock('@/features/canvas/ui/CanvasNodeImage', () => ({
  CanvasNodeImage: ({
    src,
    alt,
    onLoad,
  }: {
    src: string;
    alt: string;
    onLoad(event: unknown): void;
  }) => (
    <button type="button" onClick={() => onLoad({ currentTarget: {} })}>
      image:{src}:{alt}
    </button>
  ),
}));

vi.mock('@/features/canvas/ui/DirectorControlBundleBadge', () => ({
  DirectorControlBundleBadge: () => <div>director-badge</div>,
}));

vi.mock('@/features/canvas/ui/NodeGenerationOverlay', () => ({
  NodeGenerationOverlay: () => <div>generation-overlay</div>,
}));

vi.mock('@/features/canvas/ui/RegenerateButton', () => ({
  RegenerateButton: ({ onClick }: { onClick(): void }) => (
    <button type="button" onClick={onClick}>retry</button>
  ),
}));

vi.mock('@/modules/creative_canvas/public', () => ({
  CANVAS_NODE_PANEL_SURFACE_CLASS: 'panel-surface',
  canvasNodeFrameClass: () => 'frame-class',
  CandidateBindingBadges: ({ roles }: { roles: string[] }) => (
    <div>bindings:{roles.join(',')}</div>
  ),
  NodeResizeHandle: () => <div>resize-handle</div>,
}));

function createController(): ImageNodeController {
  return {
    id: 'image-a',
    data: {
      imageUrl: '/original.png',
      previewImageUrl: '/preview.webp',
      aspectRatio: '16:9',
    },
    selected: true,
    isExportResultNode: true,
    title: '图像节点',
    size: {
      width: 480,
      height: 270,
      resizeMinWidth: 249,
      resizeMinHeight: 140,
      maxWidth: 1600,
      maxHeight: 1600,
    },
    hasMainlineContext: false,
    candidateBindingRoles: ['current_frame'],
    naturalSize: { width: 1920, height: 1080 },
    imageSource: '/preview.webp',
    originalImageUrl: '/original.png',
    isGenerating: false,
    generationError: '',
    generationErrorRequestId: '',
    hasGenerationError: false,
    generationStartedAt: null,
    generationDurationMs: 60000,
    waitingResultText: '等待结果',
    resolutionLabel: '分辨率',
    imageAlt: '图像结果',
    generationFailedLabel: '生成失败',
    canRetry: false,
    select: vi.fn(),
    rename: vi.fn(),
    handleImageLoad: vi.fn(),
    retry: vi.fn(async () => undefined),
  } as ImageNodeController;
}

describe('ImageNodeView', () => {
  it('renders image metadata and forwards node, title, and load commands', () => {
    const controller = createController();
    const { container } = render(<ImageNodeView controller={controller} />);

    expect(screen.getByText('1920×1080')).toHaveAttribute('title', '分辨率');
    expect(screen.getByText('bindings:current_frame')).toBeInTheDocument();
    expect(screen.getByText('director-badge')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'title:图像节点' }));
    fireEvent.click(screen.getByRole('button', {
      name: 'image:/preview.webp:图像结果',
    }));
    fireEvent.click(container.firstElementChild as HTMLElement);

    expect(controller.rename).toHaveBeenCalledWith('新标题');
    expect(controller.handleImageLoad).toHaveBeenCalledOnce();
    expect(controller.select).toHaveBeenCalled();
    expect(screen.getByText('handle:target')).toBeInTheDocument();
    expect(screen.getByText('handle:source')).toBeInTheDocument();
  });

  it('renders generation progress without the empty placeholder', () => {
    const controller = createController();
    controller.data.imageUrl = null;
    controller.imageSource = null;
    controller.naturalSize = null;
    controller.isGenerating = true;
    render(<ImageNodeView controller={controller} />);

    expect(screen.getByText('generation-overlay')).toBeInTheDocument();
    expect(screen.queryByText('等待结果')).not.toBeInTheDocument();
  });

  it('renders failure details and delegates retry', () => {
    const controller = createController();
    controller.data.imageUrl = null;
    controller.imageSource = null;
    controller.naturalSize = null;
    controller.hasGenerationError = true;
    controller.generationError = '后端失败';
    controller.generationErrorRequestId = 'request-552';
    controller.canRetry = true;
    render(<ImageNodeView controller={controller} />);

    expect(screen.getByText('生成失败')).toBeInTheDocument();
    expect(screen.getByText('后端失败')).toBeInTheDocument();
    expect(screen.getByText('request-552')).toHaveAttribute(
      'title',
      'request-552',
    );
    fireEvent.click(screen.getByRole('button', { name: 'retry' }));
    expect(controller.retry).toHaveBeenCalledOnce();
  });

  it('renders the projected empty-state text', () => {
    const controller = createController();
    controller.data.imageUrl = null;
    controller.imageSource = null;
    controller.naturalSize = null;
    controller.isExportResultNode = false;
    controller.waitingResultText = '选择节点进行编辑';
    render(<ImageNodeView controller={controller} />);

    expect(screen.getByText('选择节点进行编辑')).toBeInTheDocument();
  });
});
