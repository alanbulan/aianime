// Copyright (c) 2026 AI anime
import {
  canConnectCanvasNodesManually,
  canNodeBeManualConnectionSource,
  resolveAllowedNodeTypes,
} from '../domain/canvasConnection';
import {
  CANVAS_NODE_TYPES,
  type CanvasNode,
  type CanvasNodeType,
} from '../domain/canvasNodes';

export type CanvasHandleType = 'source' | 'target';

const MANUAL_DROP_PROXIMITY_PX = 56;

export interface CanvasPendingConnectionStart {
  nodeId: string;
  handleType: CanvasHandleType;
  handleId?: string | null;
  start?: { x: number; y: number };
}

export type CanvasConnectionEndResolution =
  | { kind: 'cancel' }
  | {
      kind: 'connect';
      source: string;
      target: string;
      sourceHandle: string;
      targetHandle: string;
    }
  | {
      kind: 'open_menu';
      clientPosition: { x: number; y: number };
      menuPosition: { x: number; y: number };
      allowedTypes: CanvasNodeType[];
      previewLine: PreviewConnectionLine | null;
      containerSize: { width: number; height: number };
    };

export interface PreviewConnectionLine {
  start: { x: number; y: number };
  end: { x: number; y: number };
  handleType: CanvasHandleType;
}

export function getClientPosition(
  event: MouseEvent | TouchEvent,
): { x: number; y: number } | null {
  if ('clientX' in event && 'clientY' in event) {
    return { x: event.clientX, y: event.clientY };
  }
  const touch = event.changedTouches[0] ?? event.touches[0];
  return touch ? { x: touch.clientX, y: touch.clientY } : null;
}

export function resolveCanvasConnectionStart({
  event,
  params,
  nodes,
  containerRect,
}: {
  event: MouseEvent | TouchEvent;
  params: {
    nodeId: string | null;
    handleType: CanvasHandleType | null;
    handleId?: string | null;
  };
  nodes: readonly CanvasNode[];
  containerRect: { left: number; top: number } | null | undefined;
}): CanvasPendingConnectionStart | null {
  if (!params.nodeId || !params.handleType) {
    return null;
  }
  if (
    params.handleType === 'source'
    && !canNodeBeManualConnectionSource(params.nodeId, nodes)
    && !canNodeBeManualConnectionSource(
      params.nodeId,
      nodes,
      CANVAS_NODE_TYPES.threeDWorld,
    )
  ) {
    return null;
  }

  const handleElement = (event.target as Element | null)
    ?.closest?.('.react-flow__handle') as HTMLElement | null;
  const clientPosition = getClientPosition(event);
  let start: { x: number; y: number } | undefined;
  if (containerRect && handleElement) {
    const handleRect = handleElement.getBoundingClientRect();
    start = {
      x: handleRect.left - containerRect.left + handleRect.width / 2,
      y: handleRect.top - containerRect.top + handleRect.height / 2,
    };
  } else if (containerRect && clientPosition) {
    start = {
      x: clientPosition.x - containerRect.left,
      y: clientPosition.y - containerRect.top,
    };
  }

  return {
    nodeId: params.nodeId,
    handleType: params.handleType,
    handleId: params.handleId,
    start,
  };
}

export function createPreviewPath(line: PreviewConnectionLine): string {
  const { start, end, handleType } = line;
  const deltaX = end.x - start.x;
  const curveStrength = Math.max(36, Math.min(120, Math.abs(deltaX) * 0.4));
  const handleDirection = handleType === 'source' ? 1 : -1;
  const isReverseDrag = deltaX * handleDirection < 0;
  const effectiveDirection = isReverseDrag ? -handleDirection : handleDirection;
  const startControlX = start.x + effectiveDirection * curveStrength;
  const endControlX = end.x - effectiveDirection * curveStrength;
  return `M ${start.x} ${start.y} C ${startControlX} ${start.y}, ${endControlX} ${end.y}, ${end.x} ${end.y}`;
}

export function cssEscape(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');
}

function handleIdFromElement(
  element: Element | null | undefined,
  nodeId: string,
  handleType: CanvasHandleType,
): string | null {
  const handleElement = element?.closest?.('.react-flow__handle') as HTMLElement | null;
  if (!handleElement) return null;
  if (handleElement.dataset.nodeid !== nodeId) return null;
  if (!handleElement.classList.contains(handleType)) return null;
  const handleId = handleElement.dataset.handleid;
  return typeof handleId === 'string' && handleId.trim() ? handleId.trim() : null;
}

function isVisibleConnectionHandle(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  if (
    element.classList.contains('!pointer-events-none')
    || element.classList.contains('opacity-0')
    || element.classList.contains('!opacity-0')
  ) {
    return false;
  }
  const style = window.getComputedStyle(element);
  return style.pointerEvents !== 'none' && style.opacity !== '0' && style.display !== 'none';
}

function nearestHandleIdAtPoint({
  nodeElement,
  nodeId,
  handleType,
  clientPosition,
  maxDistance = 28,
}: {
  nodeElement: HTMLElement | null | undefined;
  nodeId: string;
  handleType: CanvasHandleType;
  clientPosition: { x: number; y: number };
  maxDistance?: number;
}): string | null {
  if (!nodeElement) return null;
  let best: { id: string; distance: number } | null = null;
  const handles = Array.from(
    nodeElement.querySelectorAll<HTMLElement>('.react-flow__handle'),
  );
  for (const handle of handles) {
    if (handle.dataset.nodeid !== nodeId || !handle.classList.contains(handleType)) {
      continue;
    }
    if (!isVisibleConnectionHandle(handle)) {
      continue;
    }
    const handleId = handle.dataset.handleid;
    if (!handleId) {
      continue;
    }
    const rect = handle.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const distance = Math.hypot(centerX - clientPosition.x, centerY - clientPosition.y);
    if (distance <= maxDistance && (!best || distance < best.distance)) {
      best = { id: handleId, distance };
    }
  }
  return best?.id ?? null;
}

export function resolveConnectEndHandleId({
  eventTarget,
  nodeElement,
  nodeId,
  handleType,
  clientPosition,
}: {
  eventTarget: Element | null;
  nodeElement: HTMLElement | null | undefined;
  nodeId: string;
  handleType: CanvasHandleType;
  clientPosition: { x: number; y: number };
}): string | null {
  return (
    handleIdFromElement(eventTarget, nodeId, handleType)
    ?? handleIdFromElement(
      document.elementFromPoint(clientPosition.x, clientPosition.y),
      nodeId,
      handleType,
    )
    ?? nearestHandleIdAtPoint({
      nodeElement,
      nodeId,
      handleType,
      clientPosition,
    })
  );
}

export function resolveCanvasConnectionEnd({
  event,
  connectionState,
  pending,
  nodes,
  wrapperElement,
}: {
  event: MouseEvent | TouchEvent;
  connectionState: {
    isValid: boolean | null;
    from?: { x: number; y: number } | null;
  };
  pending: CanvasPendingConnectionStart | null;
  nodes: readonly CanvasNode[];
  wrapperElement: HTMLElement | null;
}): CanvasConnectionEndResolution {
  if (connectionState.isValid || !pending) {
    return { kind: 'cancel' };
  }

  const clientPosition = getClientPosition(event);
  const containerRect = wrapperElement?.getBoundingClientRect();
  if (!clientPosition || !containerRect || !wrapperElement) {
    return { kind: 'cancel' };
  }

  const eventTarget = event.target as Element | null;
  const nodeElementFromTarget = eventTarget
    ?.closest?.('.react-flow__node[data-id]') as HTMLElement | null;
  const nodeElementFromPoint = document
    .elementFromPoint(clientPosition.x, clientPosition.y)
    ?.closest?.('.react-flow__node[data-id]') as HTMLElement | null;
  const dropNodeElement = nodeElementFromTarget ?? nodeElementFromPoint;
  const dropNodeId = dropNodeElement?.dataset.id ?? null;

  if (dropNodeId && dropNodeId !== pending.nodeId) {
    const sourceNode = pending.handleType === 'source'
      ? nodes.find((node) => node.id === pending.nodeId)
      : nodes.find((node) => node.id === dropNodeId);
    const targetNode = pending.handleType === 'source'
      ? nodes.find((node) => node.id === dropNodeId)
      : nodes.find((node) => node.id === pending.nodeId);

    if (
      sourceNode
      && targetNode
      && canConnectCanvasNodesManually(sourceNode, targetNode)
    ) {
      const sourceHandle = pending.handleType === 'source'
        ? pending.handleId ?? 'source'
        : resolveConnectEndHandleId({
            eventTarget,
            nodeElement: dropNodeElement,
            nodeId: sourceNode.id,
            handleType: 'source',
            clientPosition,
          }) ?? 'source';
      const targetHandle = pending.handleType === 'source'
        ? resolveConnectEndHandleId({
            eventTarget,
            nodeElement: dropNodeElement,
            nodeId: targetNode.id,
            handleType: 'target',
            clientPosition,
          }) ?? 'target'
        : pending.handleId ?? 'target';
      return {
        kind: 'connect',
        source: sourceNode.id,
        target: targetNode.id,
        sourceHandle,
        targetHandle,
      };
    }
  }

  const originNode = nodes.find((node) => node.id === pending.nodeId);
  const allowedTypes = resolveAllowedNodeTypes(pending.handleType, originNode?.type);
  if (allowedTypes.length === 0) {
    return { kind: 'cancel' };
  }

  const end = {
    x: clientPosition.x - containerRect.left,
    y: clientPosition.y - containerRect.top,
  };
  let start = pending.start ?? null;
  if (!start) {
    const nodeElement = wrapperElement.querySelector<HTMLElement>(
      `.react-flow__node[data-id="${pending.nodeId}"]`,
    );
    const handleElement = nodeElement?.querySelector<HTMLElement>(
      `.react-flow__handle-${pending.handleType}`,
    );
    if (handleElement) {
      const handleRect = handleElement.getBoundingClientRect();
      start = {
        x: handleRect.left - containerRect.left + handleRect.width / 2,
        y: handleRect.top - containerRect.top + handleRect.height / 2,
      };
    } else if (nodeElement) {
      const nodeRect = nodeElement.getBoundingClientRect();
      start = {
        x: (
          pending.handleType === 'source'
            ? nodeRect.right
            : nodeRect.left
        ) - containerRect.left,
        y: nodeRect.top - containerRect.top + nodeRect.height / 2,
      };
    } else if (connectionState.from) {
      start = { x: connectionState.from.x, y: connectionState.from.y };
    }
  }

  return {
    kind: 'open_menu',
    clientPosition,
    menuPosition: end,
    allowedTypes,
    previewLine: start
      ? { start, end, handleType: pending.handleType }
      : null,
    containerSize: {
      width: containerRect.width,
      height: containerRect.height,
    },
  };
}

export function resolveManualDropTargetElement({
  clientPosition,
  pending,
  nodes,
  wrapperElement,
  maxDistance = MANUAL_DROP_PROXIMITY_PX,
}: {
  clientPosition: { x: number; y: number };
  pending: { nodeId: string; handleType: CanvasHandleType };
  nodes: readonly CanvasNode[];
  wrapperElement: HTMLElement | null;
  maxDistance?: number;
}): HTMLElement | null {
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  const originNode = nodeById.get(pending.nodeId);
  if (!originNode) {
    return null;
  }

  const validate = (element: HTMLElement | null): HTMLElement | null => {
    const dropNodeId = element?.dataset.id ?? null;
    if (!element || !dropNodeId || dropNodeId === pending.nodeId) {
      return null;
    }
    const dropNode = nodeById.get(dropNodeId);
    if (!dropNode) {
      return null;
    }
    const sourceNode = pending.handleType === 'source' ? originNode : dropNode;
    const targetNode = pending.handleType === 'source' ? dropNode : originNode;
    return canConnectCanvasNodesManually(sourceNode, targetNode) ? element : null;
  };

  const direct = validate(
    document
      .elementFromPoint(clientPosition.x, clientPosition.y)
      ?.closest?.('.react-flow__node[data-id]') as HTMLElement | null,
  );
  if (direct) {
    return direct;
  }
  if (!wrapperElement) {
    return null;
  }

  let best: HTMLElement | null = null;
  let bestDistance = Infinity;
  wrapperElement
    .querySelectorAll<HTMLElement>('.react-flow__node[data-id]')
    .forEach((element) => {
      const rect = element.getBoundingClientRect();
      const dx = clientPosition.x < rect.left
        ? rect.left - clientPosition.x
        : clientPosition.x > rect.right
          ? clientPosition.x - rect.right
          : 0;
      const dy = clientPosition.y < rect.top
        ? rect.top - clientPosition.y
        : clientPosition.y > rect.bottom
          ? clientPosition.y - rect.bottom
          : 0;
      const distance = Math.hypot(dx, dy);
      if (distance > maxDistance || distance >= bestDistance || !validate(element)) {
        return;
      }
      best = element;
      bestDistance = distance;
    });
  return best;
}
