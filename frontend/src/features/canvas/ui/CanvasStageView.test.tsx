// Copyright (c) 2026 AI anime
import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  CanvasStageView,
  type CanvasStageViewProps,
} from './CanvasStageView';

const stageMocks = vi.hoisted(() => ({
  reactFlowProps: vi.fn(),
  minimapProps: vi.fn(),
  selectedNodeOverlayProps: vi.fn(),
  nodeTypes: { uploadNode: vi.fn() },
  createCanvasNodeTypes: vi.fn(),
  edgeTypes: { disconnectableEdge: vi.fn() },
}));

stageMocks.createCanvasNodeTypes.mockReturnValue(stageMocks.nodeTypes);

vi.mock('@xyflow/react', () => ({
  BackgroundVariant: { Dots: 'dots' },
  ConnectionMode: { Loose: 'loose' },
  SelectionMode: { Partial: 'partial' },
  ReactFlow: ({
    children,
    ...props
  }: { children?: ReactNode } & Record<string, unknown>) => {
    stageMocks.reactFlowProps(props);
    return <div data-testid="react-flow">{children}</div>;
  },
  Background: () => <div data-testid="canvas-background" />,
  MiniMap: (props: Record<string, unknown>) => {
    stageMocks.minimapProps(props);
    const {
      onMouseEnter,
      onMouseLeave,
      position,
    } = props as {
      onMouseEnter?: () => void;
      onMouseLeave?: () => void;
      position?: string;
    };
    return (
      <div
        data-testid="canvas-minimap"
        data-position={position}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    );
  },
}));

vi.mock('@/components/credits/credit-visual', () => ({
  CreditDisplayHiddenProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/modules/creative_canvas/public', () => ({
  PAN_ACTIVATION_KEY_CODE: 'Space',
  CANVAS_CONTROL_GLASS_CLASS: 'control-glass',
  CANVAS_CONTROL_ICON_BUTTON_ACTIVE_CLASS: 'control-button-active',
  CANVAS_CONTROL_ICON_BUTTON_CLASS: 'control-button',
  CanvasContextMenu: () => <div data-testid="canvas-context-menu" />,
  canvasEdgeTypes: stageMocks.edgeTypes,
  CanvasConnectionPreviewOverlay: () => (
    <div data-testid="canvas-connection-preview" />
  ),
  CanvasFpsMeter: () => <div data-testid="canvas-fps-meter" />,
  CanvasMinimapButton: () => <div data-testid="canvas-minimap-button" />,
  CanvasQuickActionBar: () => <div data-testid="canvas-quick-action-bar" />,
  CanvasSnapAlignButton: () => <div data-testid="snap-align-button" />,
  CanvasSnapAlignGuides: () => <div data-testid="snap-align-guides" />,
  CanvasTransientOverlays: () => <div data-testid="canvas-transient-overlays" />,
  CanvasZoomControl: () => <div data-testid="canvas-zoom-control" />,
  ImageViewerModal: () => <div data-testid="image-viewer-modal" />,
  MultiSelectionConnectButton: () => (
    <div data-testid="multi-selection-connect-button" />
  ),
  NodeSelectionMenu: () => <div data-testid="node-selection-menu" />,
  VideoViewerModal: () => <div data-testid="video-viewer-modal" />,
}));
vi.mock('@/lib/runtime-config', () => ({ isCeRuntime: () => false }));
vi.mock('@/features/canvas/ui/CanvasMinimapBookmarksOverlayAdapter', () => ({
  CanvasMinimapBookmarksOverlayAdapter: () => (
    <div data-testid="canvas-minimap-bookmarks" />
  ),
}));
vi.mock('../nodes', () => ({
  createCanvasNodeTypes: stageMocks.createCanvasNodeTypes,
}));
vi.mock('./BackToNodesHint', () => ({
  BackToNodesHint: () => <div data-testid="back-to-nodes-hint" />,
}));
vi.mock('./CanvasHistoryAssetsModalAdapter', () => ({
  CanvasHistoryAssetsModalAdapter: () => null,
}));
vi.mock('./MultiSelectionToolbar', () => ({
  MultiSelectionToolbar: () => <div data-testid="multi-selection-toolbar" />,
}));
vi.mock('./NodeSpawnPlusOverlay', () => ({
  NodeSpawnPlusOverlay: () => <div data-testid="node-spawn-plus-overlay" />,
}));
vi.mock('./NodeToolDialog', () => ({
  NodeToolDialog: () => <div data-testid="node-tool-dialog" />,
}));
vi.mock('./SelectedNodeOverlay', () => ({
  SelectedNodeOverlay: (props: Record<string, unknown>) => {
    stageMocks.selectedNodeOverlayProps(props);
    return <div data-testid="selected-node-overlay" />;
  },
}));

function createProps(
  overrides: Partial<CanvasStageViewProps> = {},
): CanvasStageViewProps {
  const noop = vi.fn();
  return {
    projectId: 'project-1',
    canvasId: 'canvas-1',
    wrapperProps: {},
    flowProps: {
      nodes: [],
      edges: [],
      defaultViewport: { x: 10, y: 20, zoom: 1.5 },
      panOnScroll: true,
      zoomOnScroll: false,
    },
    controlsPlacement: 'top-right',
    minimapProps: {
      visible: true,
      pinned: false,
      onTogglePin: noop,
      onHoverChange: noop,
    },
    transientOverlayProps: {
      isCanvasEmpty: true,
      marqueeSelectionRect: null,
      nodePlacementPreview: null,
      isCanvasDropActive: false,
    },
    contextMenuProps: {
      position: { x: 10, y: 20 },
      sections: [],
      onClose: noop,
    },
    multiSelectionConnectProps: {
      onBatchOpenMenu: noop,
      onBatchDragStart: noop,
      onBatchDragMove: noop,
      onBatchDragEnd: noop,
    },
    nodeSpawnPlusProps: {},
    zoomControlProps: { onOrganize: noop },
    quickActionBarProps: {
      nodeDefinitions: [],
      skillItems: [],
      onAddNode: noop,
      onAddSkill: noop,
      onUseAsset: noop,
      onDeleteNode: noop,
    },
    connectionPreviewProps: { preview: null },
    nodeSelectionMenuProps: {
      position: { x: 30, y: 40 },
      nodeDefinitions: [],
      onSelect: noop,
      onClose: noop,
    },
    imageViewerProps: {
      open: false,
      imageUrl: '',
      imageList: [],
      currentIndex: 0,
      onClose: noop,
      onNavigate: noop,
    },
    videoViewerProps: {
      open: false,
      videoUrl: '',
      onClose: noop,
    },
    ...overrides,
  };
}

describe('CanvasStageView', () => {
  it('owns fixed React Flow chrome while forwarding runtime projection', () => {
    const props = createProps();
    render(<CanvasStageView {...props} />);

    expect(stageMocks.reactFlowProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        nodes: [],
        edges: [],
        defaultViewport: { x: 10, y: 20, zoom: 1.5 },
        nodeTypes: stageMocks.nodeTypes,
        edgeTypes: stageMocks.edgeTypes,
        defaultEdgeOptions: { type: 'disconnectableEdge' },
        connectionMode: 'loose',
        connectionRadius: 160,
        minZoom: 0.1,
        maxZoom: 8,
        panOnDrag: [1],
        panOnScroll: true,
        zoomOnScroll: false,
        panActivationKeyCode: 'Space',
        selectionMode: 'partial',
        multiSelectionKeyCode: ['Control', 'Meta'],
        selectionKeyCode: null,
        deleteKeyCode: null,
        onlyRenderVisibleElements: true,
        zoomOnDoubleClick: false,
        proOptions: { hideAttribution: true },
      }),
    );
    expect(stageMocks.createCanvasNodeTypes).toHaveBeenLastCalledWith({
      projectId: 'project-1',
      canvasId: 'canvas-1',
    });
    expect(screen.getByTestId('canvas-background')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-minimap')).toHaveAttribute(
      'data-position',
      'top-right',
    );
    expect(stageMocks.selectedNodeOverlayProps).toHaveBeenLastCalledWith({
      projectId: 'project-1',
      canvasId: 'canvas-1',
    });

    fireEvent.mouseEnter(screen.getByTestId('canvas-minimap'));
    fireEvent.mouseLeave(screen.getByTestId('canvas-minimap'));

    expect(props.minimapProps.onHoverChange).toHaveBeenNthCalledWith(1, true);
    expect(props.minimapProps.onHoverChange).toHaveBeenNthCalledWith(2, false);
  });

  it('keeps conditional chrome and overlay stacking order in the presentation view', () => {
    const props = createProps();
    const { rerender } = render(<CanvasStageView {...props} />);

    const quickActionBar = screen.getByTestId('canvas-quick-action-bar');
    const connectionPreview = screen.getByTestId('canvas-connection-preview');
    expect(
      quickActionBar.compareDocumentPosition(connectionPreview)
      & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(screen.getByTestId('canvas-context-menu')).toBeInTheDocument();
    expect(screen.getByTestId('node-selection-menu')).toBeInTheDocument();

    rerender(
      <CanvasStageView
        {...createProps({
          controlsPlacement: 'bottom-right',
          minimapProps: { ...props.minimapProps, visible: false },
          contextMenuProps: null,
          quickActionBarProps: null,
          nodeSelectionMenuProps: null,
        })}
      />,
    );

    expect(screen.queryByTestId('canvas-minimap')).not.toBeInTheDocument();
    expect(screen.queryByTestId('canvas-minimap-bookmarks')).not.toBeInTheDocument();
    expect(screen.queryByTestId('canvas-context-menu')).not.toBeInTheDocument();
    expect(screen.queryByTestId('canvas-quick-action-bar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('node-selection-menu')).not.toBeInTheDocument();
  });
});
