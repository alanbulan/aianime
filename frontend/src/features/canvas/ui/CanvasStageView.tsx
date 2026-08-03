// Copyright (c) 2026 AI anime
import { useMemo, type ComponentProps } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  SelectionMode,
  type ReactFlowProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { CreditDisplayHiddenProvider } from '@/components/credits/credit-visual';
import type {
  CanvasEdge,
  CanvasNode,
} from '@/features/canvas/domain/canvasNodes';
import { isImmersiveViewerActive } from '@/features/viewer-kit/useViewerImmersiveBody';
import { isCeRuntime } from '@/lib/runtime-config';

import { edgeTypes as canvasEdgeTypes } from '../edges';
import { NodeSelectionMenu } from '../NodeSelectionMenu';
import { createCanvasNodeTypes } from '../nodes';
import {
  CanvasMinimapButton,
  CanvasSnapAlignButton,
  CanvasSnapAlignGuides,
  CanvasZoomControl,
  ImageViewerModal,
  PAN_ACTIVATION_KEY_CODE,
  VideoViewerModal,
} from '@/modules/creative_canvas/public';
import { BackToNodesHint } from './BackToNodesHint';
import { CanvasContextMenu } from './CanvasContextMenu';
import {
  CANVAS_CONTROL_ICON_BUTTON_ACTIVE_CLASS,
  CANVAS_CONTROL_ICON_BUTTON_CLASS,
  CANVAS_CONTROL_GLASS_CLASS,
} from './canvasControlStyles';
import { CanvasFpsMeter } from './CanvasFpsMeter';
import { CanvasMinimapBookmarksOverlayAdapter } from './CanvasMinimapBookmarksOverlayAdapter';
import { CanvasQuickActionBar } from './CanvasQuickActionBar';
import {
  CanvasConnectionPreviewOverlay,
  CanvasTransientOverlays,
} from './CanvasTransientOverlays';
import { MultiSelectionConnectButton } from './MultiSelectionConnectButton';
import { MultiSelectionToolbar } from './MultiSelectionToolbar';
import { NodeSpawnPlusOverlay } from './NodeSpawnPlusOverlay';
import { NodeToolDialog } from './NodeToolDialog';
import { SelectedNodeOverlay } from './SelectedNodeOverlay';

const DEFAULT_EDGE_OPTIONS: NonNullable<
  ReactFlowProps<CanvasNode, CanvasEdge>['defaultEdgeOptions']
> = { type: 'disconnectableEdge' };
const REACT_FLOW_PRO_OPTIONS: NonNullable<
  ReactFlowProps<CanvasNode, CanvasEdge>['proOptions']
> = { hideAttribution: true };
// Cover target handles when the pointer is over the middle of a 300-400px node.
const CONNECTION_SNAP_RADIUS = 160;
const MULTI_SELECTION_KEY_CODES = ['Control', 'Meta'];
// Left drag is marquee selection and right click opens the context menu.
const PAN_ON_DRAG_BUTTONS = [1];
const CANVAS_ICON_BUTTON_STYLES = {
  button: CANVAS_CONTROL_ICON_BUTTON_CLASS,
  activeButton: CANVAS_CONTROL_ICON_BUTTON_ACTIVE_CLASS,
};
const CANVAS_ZOOM_CONTROL_STYLES = {
  container: CANVAS_CONTROL_GLASS_CLASS,
};

export type CanvasControlsPlacement = 'bottom-right' | 'top-right';

type CanvasStageWrapperProps = Pick<
  ComponentProps<'div'>,
  | 'ref'
  | 'onDragEnter'
  | 'onDragOver'
  | 'onDragLeave'
  | 'onDrop'
  | 'onPointerMove'
>;

type CanvasStageFlowProps = Pick<
  ReactFlowProps<CanvasNode, CanvasEdge>,
  | 'nodes'
  | 'edges'
  | 'onNodesChange'
  | 'onEdgesChange'
  | 'onEdgeClick'
  | 'onEdgeDoubleClick'
  | 'onConnect'
  | 'onConnectStart'
  | 'onConnectEnd'
  | 'isValidConnection'
  | 'onNodeMouseEnter'
  | 'onNodeMouseLeave'
  | 'onNodeClick'
  | 'onNodeDragStart'
  | 'onNodeDrag'
  | 'onNodeDragStop'
  | 'onSelectionDragStart'
  | 'onSelectionDragStop'
  | 'onPaneClick'
  | 'onMove'
  | 'onMoveEnd'
  | 'defaultViewport'
  | 'panOnScroll'
  | 'zoomOnScroll'
>;

type CanvasStageMinimapProps = Omit<
  ComponentProps<typeof CanvasMinimapButton>,
  'placement' | 'styles'
> & {
  visible: boolean;
};

export interface CanvasStageViewProps {
  projectId: string;
  canvasId: string;
  wrapperProps: CanvasStageWrapperProps;
  flowProps: CanvasStageFlowProps;
  controlsPlacement: CanvasControlsPlacement;
  minimapProps: CanvasStageMinimapProps;
  transientOverlayProps: ComponentProps<typeof CanvasTransientOverlays>;
  contextMenuProps: ComponentProps<typeof CanvasContextMenu> | null;
  multiSelectionConnectProps: ComponentProps<typeof MultiSelectionConnectButton>;
  nodeSpawnPlusProps: ComponentProps<typeof NodeSpawnPlusOverlay>;
  zoomControlProps: Omit<
    ComponentProps<typeof CanvasZoomControl>,
    'isImmersiveViewerActive' | 'placement' | 'styles'
  >;
  quickActionBarProps: Omit<
    ComponentProps<typeof CanvasQuickActionBar>,
    'placement' | 'projectId' | 'canvasId'
  > | null;
  connectionPreviewProps: ComponentProps<typeof CanvasConnectionPreviewOverlay>;
  nodeSelectionMenuProps: ComponentProps<typeof NodeSelectionMenu> | null;
  imageViewerProps: ComponentProps<typeof ImageViewerModal>;
  videoViewerProps: ComponentProps<typeof VideoViewerModal>;
}

export function CanvasStageView({
  projectId,
  canvasId,
  wrapperProps,
  flowProps,
  controlsPlacement,
  minimapProps,
  transientOverlayProps,
  contextMenuProps,
  multiSelectionConnectProps,
  nodeSpawnPlusProps,
  zoomControlProps,
  quickActionBarProps,
  connectionPreviewProps,
  nodeSelectionMenuProps,
  imageViewerProps,
  videoViewerProps,
}: CanvasStageViewProps) {
  const canvasNodeTypes = useMemo(
    () => createCanvasNodeTypes({ projectId, canvasId }),
    [canvasId, projectId],
  );

  return (
    <CreditDisplayHiddenProvider value={isCeRuntime()}>
      <div
        {...wrapperProps}
        className="relative h-full w-full bg-background"
      >
        <ReactFlow<CanvasNode, CanvasEdge>
          {...flowProps}
          nodeTypes={canvasNodeTypes}
          edgeTypes={canvasEdgeTypes}
          defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
          connectionMode={ConnectionMode.Loose}
          connectionRadius={CONNECTION_SNAP_RADIUS}
          minZoom={0.1}
          maxZoom={8}
          nodesDraggable
          nodesConnectable
          edgesReconnectable
          panOnDrag={PAN_ON_DRAG_BUTTONS}
          panActivationKeyCode={PAN_ACTIVATION_KEY_CODE}
          selectionMode={SelectionMode.Partial}
          multiSelectionKeyCode={MULTI_SELECTION_KEY_CODES}
          selectionKeyCode={null}
          deleteKeyCode={null}
          onlyRenderVisibleElements
          zoomOnDoubleClick={false}
          proOptions={REACT_FLOW_PRO_OPTIONS}
          className="bg-background"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={2}
            color="var(--canvas-grid-dot)"
          />
          {minimapProps.visible && (
            <MiniMap
              position={
                controlsPlacement === 'top-right' ? 'top-right' : 'bottom-right'
              }
              className="canvas-minimap canvas-minimap--popover nopan nowheel !border-border !bg-card"
              style={{ pointerEvents: 'all', zIndex: 10000 }}
              nodeColor="var(--canvas-minimap-node)"
              maskColor="var(--canvas-minimap-mask)"
              pannable
              zoomable
              onMouseEnter={() => minimapProps.onHoverChange(true)}
              onMouseLeave={() => minimapProps.onHoverChange(false)}
            />
          )}
          {minimapProps.visible && (
            <CanvasMinimapBookmarksOverlayAdapter
              onHoverChange={minimapProps.onHoverChange}
            />
          )}

          <SelectedNodeOverlay projectId={projectId} canvasId={canvasId} />
          <MultiSelectionToolbar />
          <MultiSelectionConnectButton {...multiSelectionConnectProps} />
          <NodeSpawnPlusOverlay {...nodeSpawnPlusProps} />
          <CanvasSnapAlignGuides />
        </ReactFlow>

        <CanvasTransientOverlays {...transientOverlayProps} />

        {contextMenuProps && <CanvasContextMenu {...contextMenuProps} />}

        <CanvasMinimapButton
          pinned={minimapProps.pinned}
          onTogglePin={minimapProps.onTogglePin}
          onHoverChange={minimapProps.onHoverChange}
          placement={controlsPlacement}
          styles={CANVAS_ICON_BUTTON_STYLES}
        />

        <CanvasSnapAlignButton
          placement={controlsPlacement}
          styles={CANVAS_ICON_BUTTON_STYLES}
        />

        <CanvasFpsMeter />

        <BackToNodesHint />

        <CanvasZoomControl
          {...zoomControlProps}
          isImmersiveViewerActive={isImmersiveViewerActive}
          placement={controlsPlacement}
          styles={CANVAS_ZOOM_CONTROL_STYLES}
        />

        {quickActionBarProps && (
          <CanvasQuickActionBar
            {...quickActionBarProps}
            projectId={projectId}
            canvasId={canvasId}
            placement={controlsPlacement}
          />
        )}

        <CanvasConnectionPreviewOverlay {...connectionPreviewProps} />

        {nodeSelectionMenuProps && (
          <NodeSelectionMenu {...nodeSelectionMenuProps} />
        )}

        <NodeToolDialog projectId={projectId} />

        <ImageViewerModal {...imageViewerProps} />

        <VideoViewerModal {...videoViewerProps} />
      </div>
    </CreditDisplayHiddenProvider>
  );
}
