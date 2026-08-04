// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { AudioNodeController } from '@/features/canvas/hooks/useAudioNodeController';

import { AudioNodeView } from './AudioNodeView';

vi.mock('@xyflow/react', () => ({
  Handle: ({ id }: { id: string }) => <div>handle:{id}</div>,
  Position: { Left: 'left', Right: 'right' },
}));

vi.mock('@/modules/creative_canvas/public', () => ({
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
  NodeGenerationOverlay: () => <div>generation-overlay</div>,
  RegenerateButton: ({
    onClick,
    label,
  }: {
    onClick(): void;
    label: string;
  }) => (
    <button type="button" onClick={onClick}>{label}</button>
  ),
  NodeContextBadges: () => <div>context-badges</div>,
  NodeResizeHandle: () => <div>resize-handle</div>,
  CANVAS_NODE_PANEL_SURFACE_CLASS: 'panel-surface',
  canvasNodeFrameClass: () => 'frame-class',
}));

vi.mock('@/features/canvas/ui/AudioWaveformPlayer', () => ({
  AudioWaveformPlayer: ({
    src,
    onLoadedDuration,
  }: {
    src: string;
    onLoadedDuration(durationMs: number): void;
  }) => (
    <button type="button" onClick={() => onLoadedDuration(2400)}>
      waveform:{src}
    </button>
  ),
}));

vi.mock('@/features/canvas/nodes/AudioOperationsPanel', () => ({
  AudioOperationsPanel: ({
    projectId,
    canvasId,
    nodeId,
  }: {
    projectId: string;
    canvasId: string;
    nodeId: string;
  }) => (
    <div>operations:{projectId}:{canvasId}:{nodeId}</div>
  ),
}));

function createController(): AudioNodeController {
  return {
    projectId: 'project-a',
    canvasId: 'canvas-a',
    id: 'audio-a',
    data: {
      audioUrl: '/voice.wav',
      durationMs: 1200,
      generationStartedAt: null,
    },
    selected: true,
    title: '音频节点',
    size: {
      width: 480,
      height: 210,
      minWidth: 360,
      minHeight: 190,
      maxWidth: 900,
      maxHeight: 360,
    },
    contexts: null,
    hasMainlineContext: false,
    audioSource: '/voice.wav',
    isGenerating: false,
    generationError: '',
    hasGenerationError: false,
    showOperationsPanel: false,
    select: vi.fn(),
    rename: vi.fn(),
    retry: vi.fn(async () => undefined),
    updateDuration: vi.fn(),
  } as AudioNodeController;
}

describe('AudioNodeView', () => {
  it('renders audio and forwards node, title, and duration commands', () => {
    const controller = createController();
    const { container } = render(<AudioNodeView controller={controller} />);

    expect(screen.getByText('handle:target')).toBeInTheDocument();
    expect(screen.getByText('handle:source')).toBeInTheDocument();
    expect(screen.getByText('context-badges')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {
      name: 'title:音频节点',
    }));
    fireEvent.click(screen.getByRole('button', {
      name: 'waveform:/voice.wav',
    }));
    fireEvent.click(container.firstElementChild as HTMLElement);

    expect(controller.rename).toHaveBeenCalledWith('新标题');
    expect(controller.updateDuration).toHaveBeenCalledWith(2400);
    expect(controller.select).toHaveBeenCalled();
    expect(screen.queryByText('operations:audio-a')).not.toBeInTheDocument();
  });

  it('renders generating and failed states with retry', () => {
    const controller = createController();
    controller.audioSource = null;
    controller.data.audioUrl = null;
    controller.isGenerating = true;
    const { rerender } = render(<AudioNodeView controller={controller} />);
    expect(screen.getByText('generation-overlay')).toBeInTheDocument();

    controller.isGenerating = false;
    controller.hasGenerationError = true;
    controller.generationError = '后端生成失败';
    rerender(<AudioNodeView controller={controller} />);
    expect(screen.getByText('生成失败')).toBeInTheDocument();
    expect(screen.getByText('后端生成失败')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(controller.retry).toHaveBeenCalledOnce();
  });

  it('renders the empty state and operations panel projection', () => {
    const controller = createController();
    controller.audioSource = null;
    controller.data.audioUrl = null;
    controller.showOperationsPanel = true;
    render(<AudioNodeView controller={controller} />);

    expect(screen.getByText('暂无音频')).toBeInTheDocument();
    expect(
      screen.getByText('operations:project-a:canvas-a:audio-a'),
    ).toBeInTheDocument();
  });
});
