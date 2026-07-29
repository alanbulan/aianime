// Copyright (c) 2026 AI anime
import { createRef, type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Pano360ViewerNodeController } from '@/features/canvas/hooks/usePano360ViewerNodeController';

import { Pano360ViewerNodeView } from './Pano360ViewerNodeView';

vi.mock('@xyflow/react', () => ({
  Handle: ({ id }: { id: string }) => <div>handle:{id}</div>,
  NodeToolbar: ({
    isVisible,
    children,
  }: {
    isVisible: boolean;
    children: ReactNode;
  }) => (isVisible ? <div>toolbar:{children}</div> : null),
  Position: { Top: 'top', Left: 'left', Right: 'right' },
}));

vi.mock('@/features/canvas/ui/NodeHeader', () => ({
  NODE_HEADER_FLOATING_POSITION_CLASS: 'floating',
  NodeHeader: ({
    titleText,
    metaText,
    onTitleChange,
  }: {
    titleText: string;
    metaText: string;
    onTitleChange(value: string): void;
  }) => (
    <button type="button" onClick={() => onTitleChange('新标题')}>
      title:{titleText}:{metaText}
    </button>
  ),
}));

vi.mock('@/features/canvas/ui/NodeResizeHandle', () => ({
  NodeResizeHandle: ({
    minWidth,
    minHeight,
  }: {
    minWidth: number;
    minHeight: number;
  }) => <div>resize:{minWidth}:{minHeight}</div>,
}));

function createController(): Pano360ViewerNodeController {
  return {
    id: 'pano-a',
    data: {
      imageUrl: null,
      sphereCorrectionDeg: { roll: 0, pitch: 0, yaw: 0 },
      frontYawDeg: 0,
      fovDeg: 70,
      displayName: '全景查看器',
    },
    selected: true,
    isActive: true,
    size: { width: 900, height: 540 },
    title: '全景查看器',
    status: '',
    viewerError: '',
    livePosition: { yawDeg: 10, pitchDeg: -5, fovDeg: 70 },
    liveFov: 70,
    focal: 26,
    isPanelOpen: true,
    isCapturing: false,
    planetBackup: null,
    viewerHostRef: createRef<HTMLDivElement>(),
    select: vi.fn(),
    rename: vi.fn(),
    togglePanel: vi.fn(),
    updateCorrectionAxis: vi.fn(),
    resetCorrection: vi.fn(),
    resetView: vi.fn(),
    toggleFullscreen: vi.fn(),
    lockCurrentView: vi.fn(),
    setFrontYawFromView: vi.fn(),
    setFrontYaw: vi.fn(),
    setFovDeg: vi.fn(),
    rotateToDirection: vi.fn(),
    enterPlanet: vi.fn(),
    exitPlanet: vi.fn(),
    copyCorrectionJson: vi.fn(async () => undefined),
    snapCurrent: vi.fn(async () => undefined),
    snapAsBackgroundAnchor: vi.fn(async () => undefined),
    snap2x2: vi.fn(async () => undefined),
    snap4x3: vi.fn(async () => undefined),
    zoomViewportBy: vi.fn(),
    rotateViewportBy: vi.fn(),
  } as unknown as Pano360ViewerNodeController;
}

describe('Pano360ViewerNodeView', () => {
  it('renders the empty node and forwards selection and title commands', () => {
    const controller = createController();
    const { container } = render(
      <Pano360ViewerNodeView controller={controller} />,
    );

    expect(screen.getByText('连接上游图片节点开始浏览全景')).toBeInTheDocument();
    expect(screen.getByText('handle:target')).toBeInTheDocument();
    expect(screen.getByText('handle:source')).toBeInTheDocument();
    expect(screen.getByText('resize:900:540')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'title:全景查看器:等待上游连接全景图',
      }),
    );
    fireEvent.click(container.firstElementChild as HTMLElement);

    expect(controller.rename).toHaveBeenCalledWith('新标题');
    expect(controller.select).toHaveBeenCalled();
  });

  it('renders viewer tools and forwards capture and viewport commands', () => {
    const controller = createController();
    controller.data.imageUrl = '/pano.png';
    render(<Pano360ViewerNodeView controller={controller} />);

    fireEvent.click(screen.getByTitle('当前视角截图'));
    fireEvent.click(screen.getByTitle('4 大视角截图'));
    fireEvent.click(screen.getByTitle('12 大视角截图'));
    fireEvent.click(
      screen.getByTitle('用作背景源(写入本 beat selected_background)'),
    );
    fireEvent.click(screen.getByTitle('缩小'));
    fireEvent.click(screen.getByTitle('向左'));
    fireEvent.click(screen.getByTitle('进入全屏'));
    fireEvent.click(screen.getByTitle('收起控制面板'));

    expect(controller.snapCurrent).toHaveBeenCalledOnce();
    expect(controller.snap2x2).toHaveBeenCalledOnce();
    expect(controller.snap4x3).toHaveBeenCalledOnce();
    expect(controller.snapAsBackgroundAnchor).toHaveBeenCalledOnce();
    expect(controller.zoomViewportBy).toHaveBeenCalledWith(10);
    expect(controller.rotateViewportBy).toHaveBeenCalledWith(-12, 0);
    expect(controller.toggleFullscreen).toHaveBeenCalledOnce();
    expect(controller.togglePanel).toHaveBeenCalledOnce();
  });

  it('renders correction controls and forwards editing commands', () => {
    const controller = createController();
    controller.data.imageUrl = '/pano.png';
    const { container } = render(
      <Pano360ViewerNodeView controller={controller} />,
    );

    const sliders = container.querySelectorAll<HTMLInputElement>(
      'input[type="range"]',
    );
    fireEvent.change(sliders[0], { target: { value: '90' } });
    fireEvent.change(sliders[2], { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: '重置' }));
    fireEvent.click(screen.getByRole('button', { name: /锁定当前视角/ }));
    fireEvent.click(screen.getByRole('button', { name: '设为当前视角' }));
    fireEvent.click(screen.getByRole('button', { name: 'right' }));
    fireEvent.click(screen.getByRole('button', { name: '小行星模式' }));
    fireEvent.click(screen.getByRole('button', { name: /复制校正 JSON/ }));

    expect(controller.setFovDeg).toHaveBeenCalledWith(90);
    expect(controller.updateCorrectionAxis).toHaveBeenCalledWith('pitch', 30);
    expect(controller.resetCorrection).toHaveBeenCalledOnce();
    expect(controller.lockCurrentView).toHaveBeenCalledOnce();
    expect(controller.setFrontYawFromView).toHaveBeenCalledOnce();
    expect(controller.rotateToDirection).toHaveBeenCalledWith('right');
    expect(controller.enterPlanet).toHaveBeenCalledOnce();
    expect(controller.copyCorrectionJson).toHaveBeenCalledOnce();
  });
});
