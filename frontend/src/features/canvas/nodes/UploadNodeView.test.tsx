// Copyright (c) 2026 AI anime
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { UploadNodeController } from '@/features/canvas/hooks/useUploadNodeController';

import { UploadNodeView } from './UploadNodeView';

const mocks = vi.hoisted(() => ({
  directorDialogProps: null as Record<string, unknown> | null,
}));

vi.mock('@xyflow/react', () => ({
  Handle: ({ id }: { id: string }) => <div>handle:{id}</div>,
  Position: { Right: 'right' },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

vi.mock('@/features/canvas/ui/NodeSideActionRail', () => ({
  NODE_SIDE_ACTION_BUTTON_CLASS: 'side-action',
  NODE_SIDE_ACTION_ICON_CLASS: 'side-icon',
  NodeSideActionRail: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('@/features/canvas/ui/CanvasNodeImage', () => ({
  CanvasNodeImage: ({ src }: { src: string }) => (
    <img src={src} alt="uploaded" />
  ),
}));

vi.mock('@/features/canvas/ui/DirectorControlBundleBadge', () => ({
  DirectorControlBundleBadge: () => <div>bundle-badge</div>,
}));

vi.mock('@/modules/creative_canvas/public', () => ({
  CANVAS_NODE_INPUT_BODY_FRAME_CLASS: 'body-frame',
  CANVAS_NODE_INPUT_BODY_SELECTED_FRAME_CLASS: 'selected-frame',
  CANVAS_NODE_INPUT_SURFACE_CLASS: 'input-surface',
  CANVAS_NODE_PANEL_SURFACE_CLASS: 'panel-surface',
  VIDEO_FILE_ACCEPT: 'video/*',
  canvasNodeFrameClass: () => 'frame-class',
  CandidateBindingBadges: ({ roles }: { roles: string[] }) => (
    <div>roles:{roles.join(',')}</div>
  ),
  NodeResizeHandle: ({
    minWidth,
    minHeight,
  }: {
    minWidth: number;
    minHeight: number;
  }) => <div>resize:{minWidth}:{minHeight}</div>,
}));

vi.mock('@/features/viewer-kit/three-d/ThreeDDirectorDialog', () => ({
  ThreeDDirectorDialog: (props: Record<string, unknown>) => {
    mocks.directorDialogProps = props;
    return <div>director-dialog</div>;
  },
}));

function createController(): UploadNodeController {
  return {
    id: 'upload-a',
    data: {
      label: '上传资源',
      displayName: '上传资源',
      imageUrl: null,
      aspectRatio: '1:1',
    },
    selected: true,
    imageOnly: false,
    size: {
      width: 320,
      height: 320,
      resizeMinWidth: 140,
      resizeMinHeight: 140,
    },
    title: '上传资源',
    hasMainlineContext: false,
    candidateBindingRoles: ['frame_candidate'],
    transientPreviewUrl: null,
    imageSource: null,
    viewerSourceUrl: null,
    hasMediaContent: false,
    directorStageBusy: false,
    directorStageOpen: false,
    directorStageManifest: null,
    canOpenDirectorStage: false,
    directorInitialScene: null,
    directorInitialScenesBySourceId: null,
    inputRef: createRef<HTMLInputElement>(),
    select: vi.fn(),
    rename: vi.fn(),
    pickFile: vi.fn(),
    drop: vi.fn(),
    dragOver: vi.fn(),
    changeFile: vi.fn(),
    imageLoad: vi.fn(),
    openDirectorStage: vi.fn(async () => undefined),
    changeDirectorStageOpen: vi.fn(),
    submitDirectorCombined: vi.fn(async () => undefined),
    captureDirectorCanvasNode: vi.fn(async () => undefined),
  } as UploadNodeController;
}

describe('UploadNodeView', () => {
  it('renders the empty upload surface and forwards selection, rename, and file picking', () => {
    const controller = createController();
    const { container } = render(<UploadNodeView controller={controller} />);

    expect(screen.getByText('roles:frame_candidate')).toBeInTheDocument();
    expect(screen.getByText('handle:source')).toBeInTheDocument();
    expect(screen.getByText('resize:140:140')).toBeInTheDocument();
    expect(screen.getByText('node.upload.hint')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'title:上传资源' }));
    fireEvent.click(screen.getByRole('button', { name: '上传资源' }));
    fireEvent.click(container.firstElementChild as HTMLElement);

    expect(controller.rename).toHaveBeenCalledWith('新标题');
    expect(controller.pickFile).toHaveBeenCalledOnce();
    expect(controller.select).toHaveBeenCalled();
    expect(container.querySelector('input[type="file"]')).toHaveAttribute(
      'accept',
      expect.stringContaining('audio/*'),
    );
  });

  it('renders media and wires Director commands and restored scene into the dialog', () => {
    const controller = createController();
    controller.data.imageUrl = '/image.png';
    controller.imageSource = '/display.png';
    controller.viewerSourceUrl = '/viewer.png';
    controller.hasMediaContent = true;
    controller.canOpenDirectorStage = true;
    controller.directorInitialScene = {
      schemaVersion: 1,
      savedAt: 1,
      actors: [],
      props: [],
      stagings: [],
    };
    controller.directorInitialScenesBySourceId = {
      source: controller.directorInitialScene,
    };
    render(<UploadNodeView controller={controller} />);

    expect(screen.getByRole('img', { name: 'uploaded' })).toHaveAttribute(
      'src',
      '/display.png',
    );
    expect(screen.getByText('bundle-badge')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'viewer.threeD.directorWorld',
      }),
    );
    expect(controller.openDirectorStage).toHaveBeenCalledOnce();
    expect(screen.getByText('director-dialog')).toBeInTheDocument();
    expect(mocks.directorDialogProps).toMatchObject({
      onSubmitDirectorCombined: controller.submitDirectorCombined,
      onCaptureCanvasNode: controller.captureDirectorCanvasNode,
      initialScene: controller.directorInitialScene,
      initialScenesBySourceId: controller.directorInitialScenesBySourceId,
    });
  });
});
