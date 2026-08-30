// Copyright (c) 2026 AI anime
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  type Position,
} from '@xyflow/react';
import { Scissors } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { buildCanvasOrthogonalRoute } from '../domain/canvasEdgeRouting';
import { CANVAS_CONNECTION_NODE_TYPES } from '../domain/canvasConnection';
import type { CanvasGeometryNode } from '../domain/canvasGeometry';
import { isPresetManagedEdge } from '../domain/mainlineNodeFlags';

export type CanvasEdgeRoutingMode = 'spline' | 'orthogonal' | 'smartOrthogonal';

export interface CanvasEdgeRenderNode extends CanvasGeometryNode {
  type?: string | null;
  data?: unknown;
}

export interface CanvasEdgeRenderStore {
  nodes: readonly CanvasEdgeRenderNode[];
  selectedNodeId: string | null;
  deleteEdge: (edgeId: string) => void;
}

export type CanvasEdgeRenderStoreHook = <TSelected>(
  selector: (state: CanvasEdgeRenderStore) => TSelected,
) => TSelected;

export interface CreateDisconnectableEdgeOptions {
  useStore: CanvasEdgeRenderStoreHook;
  useRoutingMode: () => CanvasEdgeRoutingMode;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const EDGE_ACTIVE_TRANSITION_MS = 300;
const PORT_DOT_RADIUS = 4;
const PORT_DOT_OFFSET = 4;
const EDGE_DISCONNECT_HOVER_DELAY_MS = 500;
const EDGE_DISCONNECT_LEAVE_GRACE_MS = 160;
const EDGE_DISCONNECT_ACTION_SIZE = 40;
const EXPORT_IMAGE_NODE_TYPE = CANVAS_CONNECTION_NODE_TYPES.exportImage;
const PROCESSING_SOURCE_NODE_TYPES = new Set<string>([
  CANVAS_CONNECTION_NODE_TYPES.storyboardGen,
  CANVAS_CONNECTION_NODE_TYPES.imageEdit,
]);
const NO_ROUTING_NODES: readonly CanvasEdgeRenderNode[] = [];
const NODE_INDEX_CACHE = new WeakMap<
  readonly CanvasEdgeRenderNode[],
  ReadonlyMap<string, CanvasEdgeRenderNode>
>();

function indexNodes(
  nodes: readonly CanvasEdgeRenderNode[],
): ReadonlyMap<string, CanvasEdgeRenderNode> {
  const cached = NODE_INDEX_CACHE.get(nodes);
  if (cached) return cached;
  const index = new Map(nodes.map((node) => [node.id, node] as const));
  NODE_INDEX_CACHE.set(nodes, index);
  return index;
}

function portDotOffset(position: Position | undefined): { dx: number; dy: number } {
  switch (position) {
    case 'left':
      return { dx: -PORT_DOT_OFFSET, dy: 0 };
    case 'right':
      return { dx: PORT_DOT_OFFSET, dy: 0 };
    case 'top':
      return { dx: 0, dy: -PORT_DOT_OFFSET };
    case 'bottom':
      return { dx: 0, dy: PORT_DOT_OFFSET };
    default:
      return { dx: 0, dy: 0 };
  }
}

export function createDisconnectableEdge({
  useStore,
  useRoutingMode,
}: CreateDisconnectableEdgeOptions) {
  return memo(function DisconnectableEdge(props: EdgeProps) {
    const {
      id,
      source,
      target,
      selected,
      sourceX,
      sourceY,
      sourcePosition,
      targetX,
      targetY,
      targetPosition,
      markerEnd,
      style,
      data,
    } = props;
    const deleteEdge = useStore((state) => state.deleteEdge);
    const selectedNodeId = useStore((state) => state.selectedNodeId);
    const routingMode = useRoutingMode();
    const routingNodes = useStore(
      useShallow((state) =>
        routingMode === 'smartOrthogonal' ? state.nodes : NO_ROUTING_NODES,
      ),
    );
    const [isHovered, setIsHovered] = useState(false);
    const [showDisconnectAction, setShowDisconnectAction] = useState(false);
    const disconnectHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const disconnectLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const edgeIsPresetManaged = isPresetManagedEdge({ data });

    const clearDisconnectHoverTimer = () => {
      if (disconnectHoverTimerRef.current === null) return;
      clearTimeout(disconnectHoverTimerRef.current);
      disconnectHoverTimerRef.current = null;
    };
    const clearDisconnectLeaveTimer = () => {
      if (disconnectLeaveTimerRef.current === null) return;
      clearTimeout(disconnectLeaveTimerRef.current);
      disconnectLeaveTimerRef.current = null;
    };
    const handleInteractiveEnter = () => {
      clearDisconnectLeaveTimer();
      setIsHovered(true);
      if (edgeIsPresetManaged || showDisconnectAction || disconnectHoverTimerRef.current !== null) {
        return;
      }
      disconnectHoverTimerRef.current = setTimeout(() => {
        setShowDisconnectAction(true);
        disconnectHoverTimerRef.current = null;
      }, EDGE_DISCONNECT_HOVER_DELAY_MS);
    };
    const handleInteractiveLeave = () => {
      clearDisconnectHoverTimer();
      clearDisconnectLeaveTimer();
      disconnectLeaveTimerRef.current = setTimeout(() => {
        setIsHovered(false);
        setShowDisconnectAction(false);
        disconnectLeaveTimerRef.current = null;
      }, EDGE_DISCONNECT_LEAVE_GRACE_MS);
    };

    useEffect(() => () => {
      clearDisconnectHoverTimer();
      clearDisconnectLeaveTimer();
    }, []);

    const hasSelection = selectedNodeId != null;
    const isConnectedToSelected =
      hasSelection && (source === selectedNodeId || target === selectedNodeId);
    const { edgePath, labelX, labelY } = useMemo(() => {
      if (routingMode === 'spline') {
        const [path, nextLabelX, nextLabelY] = getBezierPath({
          sourceX,
          sourceY,
          sourcePosition,
          targetX,
          targetY,
          targetPosition,
        });
        return { edgePath: path, labelX: nextLabelX, labelY: nextLabelY };
      }
      const route = buildCanvasOrthogonalRoute({
        sourceId: source,
        targetId: target,
        sourceX,
        sourceY,
        sourcePosition: sourcePosition ?? 'right',
        targetX,
        targetY,
        targetPosition: targetPosition ?? 'left',
        nodes: routingNodes,
        smartAvoidance: routingMode === 'smartOrthogonal',
      });
      return { edgePath: route.path, labelX: route.labelX, labelY: route.labelY };
    }, [
      routingMode,
      routingNodes,
      source,
      sourcePosition,
      sourceX,
      sourceY,
      target,
      targetPosition,
      targetX,
      targetY,
    ]);

    const isProcessingEdge = useStore((state) => {
      const nodesById = indexNodes(state.nodes);
      const sourceNode = nodesById.get(source);
      const targetNode = nodesById.get(target);
      return Boolean(
        sourceNode &&
          targetNode?.type === EXPORT_IMAGE_NODE_TYPE &&
          PROCESSING_SOURCE_NODE_TYPES.has(sourceNode.type ?? '') &&
          recordValue(targetNode.data).isGenerating === true,
      );
    });
    const dataRecord = recordValue(data);
    const bindingRole =
      ['candidate_binding', 'role_binding'].includes(String(dataRecord.edgeKind || '')) &&
      typeof dataRecord.role === 'string'
        ? dataRecord.role
        : null;
    const processingStroke = 'rgb(var(--accent-rgb) / 0.94)';
    const processingDashStroke = 'rgb(var(--accent-rgb) / 1)';
    const highlightStroke = 'rgb(var(--text-rgb) / 0.78)';
    const bindingStroke = 'rgb(var(--accent-rgb) / 0.72)';
    const bindingHighlightStroke = 'rgb(var(--accent-rgb) / 0.96)';
    const baseStroke = 'rgb(var(--text-rgb) / 0.48)';
    const dimStroke = 'rgb(var(--text-rgb) / 0.25)';
    const resolvedStroke = isProcessingEdge
      ? processingStroke
      : isConnectedToSelected || selected || isHovered
        ? (bindingRole ? bindingHighlightStroke : highlightStroke)
        : hasSelection
          ? dimStroke
          : (bindingRole ? bindingStroke : baseStroke);
    const shouldShowDataFlow =
      !isProcessingEdge && (isHovered || selected || isConnectedToSelected);
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const flowPathId = `canvas-data-flow-path-${safeId}`;
    const flowGradientId = `canvas-data-flow-gradient-${safeId}`;
    const flowGlowId = `canvas-data-flow-glow-${safeId}`;
    const sourceDotOffset = portDotOffset(sourcePosition ?? 'right');
    const targetDotOffset = portDotOffset(targetPosition ?? 'left');

    return (
      <>
        {isProcessingEdge && (
          <path
            d={edgePath}
            fill="none"
            stroke={processingDashStroke}
            strokeWidth={selected ? 2.5 : 2.1}
            strokeLinecap="round"
            strokeDasharray="8 10"
            className="canvas-processing-edge__flow"
            style={{ pointerEvents: 'none' }}
          />
        )}
        <BaseEdge
          id={id}
          path={edgePath}
          markerEnd={markerEnd}
          style={{
            ...style,
            stroke: resolvedStroke,
            strokeWidth: isProcessingEdge ? (selected ? 2.7 : 2.2) : 2,
            transition: `stroke ${EDGE_ACTIVE_TRANSITION_MS}ms ease, stroke-width ${EDGE_ACTIVE_TRANSITION_MS}ms ease`,
          }}
        />
        <g style={{ pointerEvents: 'none' }}>
          <circle
            cx={sourceX + sourceDotOffset.dx}
            cy={sourceY + sourceDotOffset.dy}
            r={PORT_DOT_RADIUS}
            fill={resolvedStroke}
            stroke="rgb(var(--bg-rgb) / 0.85)"
            strokeWidth={1}
            style={{ transition: `fill ${EDGE_ACTIVE_TRANSITION_MS}ms ease` }}
          />
          <circle
            cx={targetX + targetDotOffset.dx}
            cy={targetY + targetDotOffset.dy}
            r={PORT_DOT_RADIUS}
            fill={resolvedStroke}
            stroke="rgb(var(--bg-rgb) / 0.85)"
            strokeWidth={1}
            style={{ transition: `fill ${EDGE_ACTIVE_TRANSITION_MS}ms ease` }}
          />
        </g>
        {!isProcessingEdge && (
          <path
            className="nodrag nopan"
            d={edgePath}
            fill="none"
            stroke="transparent"
            strokeWidth={24}
            strokeLinecap="round"
            style={{ pointerEvents: 'stroke', cursor: 'default' }}
            onPointerEnter={handleInteractiveEnter}
            onPointerLeave={handleInteractiveLeave}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          />
        )}
        {shouldShowDataFlow && (
          <>
            <defs>
              <path id={flowPathId} d={edgePath} />
              <linearGradient id={flowGradientId} gradientUnits="userSpaceOnUse" x1="-48" y1="0" x2="48" y2="0">
                <stop offset="0%" stopColor="rgb(var(--text-rgb))" stopOpacity="0" />
                <stop offset="42%" stopColor="rgb(var(--text-rgb))" stopOpacity="0.28" />
                <stop offset="100%" stopColor="rgb(var(--text-rgb))" stopOpacity="0.72" />
              </linearGradient>
              <filter id={flowGlowId} x="-80%" y="-240%" width="260%" height="580%">
                <feGaussianBlur stdDeviation="14" />
              </filter>
            </defs>
            {[0, -2.33, -4.67].map((begin) => (
              <g key={begin} className="canvas-data-edge__packet" style={{ pointerEvents: 'none', opacity: 0.72 }}>
                <g transform="scale(0.45, 1)">
                  <line x1="-46" y1="0" x2="46" y2="0" fill="none" stroke={`url(#${flowGradientId})`} strokeLinecap="round" strokeWidth={12} opacity={0.34} filter={`url(#${flowGlowId})`} />
                  <line x1="-42" y1="0" x2="42" y2="0" fill="none" stroke={`url(#${flowGradientId})`} strokeLinecap="round" strokeWidth={4} />
                </g>
                <animateMotion className="canvas-data-edge__packet-motion" dur="7s" begin={`${begin}s`} repeatCount="indefinite" rotate="auto">
                  <mpath href={`#${flowPathId}`} />
                </animateMotion>
              </g>
            ))}
          </>
        )}
        {showDisconnectAction && !edgeIsPresetManaged && (
          <EdgeLabelRenderer>
            <div
              className="nodrag nopan absolute"
              style={{
                height: EDGE_DISCONNECT_ACTION_SIZE,
                width: EDGE_DISCONNECT_ACTION_SIZE + 16,
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                pointerEvents: 'all',
              }}
              onPointerEnter={handleInteractiveEnter}
              onPointerLeave={handleInteractiveLeave}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              <button
                type="button"
                className="absolute left-1/2 top-0 flex h-10 w-10 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-popover/95 text-popover-foreground/85 shadow-xl backdrop-blur transition-[border-color,color,box-shadow] duration-150 hover:border-primary/45 hover:text-popover-foreground hover:shadow-[0_0_22px_rgb(var(--accent-rgb)/0.20)]"
                onClick={(event) => {
                  event.stopPropagation();
                  deleteEdge(id);
                }}
                aria-label="断开连线"
              >
                <Scissors className="h-6 w-6 stroke-[2.35]" />
              </button>
            </div>
          </EdgeLabelRenderer>
        )}
      </>
    );
  });
}
