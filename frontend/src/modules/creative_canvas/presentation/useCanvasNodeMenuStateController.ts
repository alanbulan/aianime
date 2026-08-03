// Copyright (c) 2026 AI anime
import { useCallback, useState } from 'react';

import {
  createPreviewPath,
  type CanvasConnectionMenuRequest,
  type CanvasConnectionPreviewRequest,
  type CanvasPendingConnectionStart,
} from '@/modules/creative_canvas/domain/canvasConnectionPreview';

const PREVIEW_CONNECTION_STROKE = 'rgb(var(--text-rgb) / 0.82)';

export interface CanvasConnectionPreviewVisual {
  d: string;
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'butt' | 'round' | 'square';
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CanvasBatchNodeMenuRequest<
  TNodeType extends string = string,
> {
  sourceIds: string[];
  allowedTypes: TNodeType[];
  spawnFlowPosition: { x: number; y: number };
  menuPosition: { x: number; y: number };
}

export interface CanvasPlainNodeMenuRequest {
  flowPosition: { x: number; y: number };
  menuPosition: { x: number; y: number };
}

export interface CanvasNodeMenuStateController<
  TNodeType extends string = string,
> {
  showNodeMenu: boolean;
  menuPosition: { x: number; y: number };
  flowPosition: { x: number; y: number };
  menuAllowedTypes: TNodeType[] | undefined;
  pendingConnectStart: CanvasPendingConnectionStart | null;
  pendingBatchConnectIds: string[] | null;
  previewConnectionVisual: CanvasConnectionPreviewVisual | null;
  handleMarqueeStart: () => void;
  prepareBatchConnectionDrag: () => void;
  dismissNodeMenuForPaneClick: () => void;
  updateConnectionPreview: (
    preview: CanvasConnectionPreviewRequest | null,
  ) => void;
  prepareConnectionStart: (
    pending: CanvasPendingConnectionStart | null,
  ) => void;
  clearConnection: () => void;
  openConnectionMenu: (
    request: CanvasConnectionMenuRequest<TNodeType>,
    spawnFlowPosition: { x: number; y: number },
  ) => void;
  openBatchConnectionMenu: (
    request: CanvasBatchNodeMenuRequest<TNodeType>,
  ) => void;
  openPlainNodeMenu: (request: CanvasPlainNodeMenuRequest) => void;
  closeNodeMenu: () => void;
  hideNodeMenuForPlacement: () => void;
}

export function useCanvasNodeMenuStateController<
  TNodeType extends string,
>(): CanvasNodeMenuStateController<TNodeType> {
  const [showNodeMenu, setShowNodeMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [flowPosition, setFlowPosition] = useState({ x: 0, y: 0 });
  const [menuAllowedTypes, setMenuAllowedTypes] = useState<
    TNodeType[] | undefined
  >(undefined);
  const [pendingConnectStart, setPendingConnectStart] =
    useState<CanvasPendingConnectionStart | null>(null);
  const [pendingBatchConnectIds, setPendingBatchConnectIds] =
    useState<string[] | null>(null);
  const [previewConnectionVisual, setPreviewConnectionVisual] =
    useState<CanvasConnectionPreviewVisual | null>(null);

  const resetActiveConnectionMenu = useCallback(() => {
    setShowNodeMenu(false);
    setMenuAllowedTypes(undefined);
    setPendingConnectStart(null);
    setPreviewConnectionVisual(null);
  }, []);

  const updateConnectionPreview = useCallback(
    (preview: CanvasConnectionPreviewRequest | null) => {
      setPreviewConnectionVisual(
        preview
          ? {
              d: createPreviewPath(preview.line),
              stroke: PREVIEW_CONNECTION_STROKE,
              strokeWidth: 1,
              strokeLinecap: 'round',
              left: 0,
              top: 0,
              width: preview.containerSize.width,
              height: preview.containerSize.height,
            }
          : null,
      );
    },
    [],
  );

  const prepareConnectionStart = useCallback(
    (pending: CanvasPendingConnectionStart | null) => {
      setPendingConnectStart(pending);
      setShowNodeMenu(false);
      setMenuAllowedTypes(undefined);
      setPreviewConnectionVisual(null);
    },
    [],
  );

  const clearConnection = useCallback(() => {
    setPendingConnectStart(null);
    setPreviewConnectionVisual(null);
  }, []);

  const openConnectionMenu = useCallback(
    (
      request: CanvasConnectionMenuRequest<TNodeType>,
      spawnFlowPosition: { x: number; y: number },
    ) => {
      setPendingConnectStart(request.pending);
      updateConnectionPreview(request.preview);
      setFlowPosition(spawnFlowPosition);
      setMenuPosition(request.menuPosition);
      setMenuAllowedTypes(request.allowedTypes);
      setShowNodeMenu(true);
    },
    [updateConnectionPreview],
  );

  const openBatchConnectionMenu = useCallback(
    (request: CanvasBatchNodeMenuRequest<TNodeType>) => {
      setPendingConnectStart(null);
      setPendingBatchConnectIds(request.sourceIds);
      setFlowPosition(request.spawnFlowPosition);
      setMenuPosition(request.menuPosition);
      setMenuAllowedTypes(request.allowedTypes);
      setShowNodeMenu(true);
    },
    [],
  );

  const openPlainNodeMenu = useCallback(
    (request: CanvasPlainNodeMenuRequest) => {
      setFlowPosition(request.flowPosition);
      setMenuPosition(request.menuPosition);
      setMenuAllowedTypes(undefined);
      setPendingConnectStart(null);
      setPreviewConnectionVisual(null);
      setShowNodeMenu(true);
    },
    [],
  );

  const closeNodeMenu = useCallback(() => {
    setShowNodeMenu(false);
    setMenuAllowedTypes(undefined);
    setPendingConnectStart(null);
    setPendingBatchConnectIds(null);
    setPreviewConnectionVisual(null);
  }, []);

  const hideNodeMenuForPlacement = useCallback(() => {
    setShowNodeMenu(false);
    setMenuAllowedTypes(undefined);
  }, []);

  return {
    showNodeMenu,
    menuPosition,
    flowPosition,
    menuAllowedTypes,
    pendingConnectStart,
    pendingBatchConnectIds,
    previewConnectionVisual,
    handleMarqueeStart: resetActiveConnectionMenu,
    prepareBatchConnectionDrag: resetActiveConnectionMenu,
    dismissNodeMenuForPaneClick: resetActiveConnectionMenu,
    updateConnectionPreview,
    prepareConnectionStart,
    clearConnection,
    openConnectionMenu,
    openBatchConnectionMenu,
    openPlainNodeMenu,
    closeNodeMenu,
    hideNodeMenuForPlacement,
  };
}
