// Copyright (c) 2026 AI anime
import { createElement } from "react";
import { useTranslation } from "react-i18next";
import { useReactFlow } from "@xyflow/react";

import { Canvas } from "@/features/canvas/Canvas";
import {
  useCanvasStore,
  type CanvasEdge,
  type CanvasNode,
  type CanvasNodeData,
} from "@/features/canvas/canvasStore";
import {
  generateCanvasRedraw,
  hydrateAssetDragPayload,
  uploadCanvasAsset,
} from "@/features/canvas/composition";
import { spawnAssetNode } from "@/features/canvas/domain/assetDrag";
import {
  CANVAS_NODE_TYPES,
  DEFAULT_NODE_WIDTH,
} from "@/features/canvas/domain/canvasNodes";
import { prefetchFreezoneCameraOptions } from "@/features/canvas/hooks/useFreezoneCameraOptions";
import {
  prefetchFreezoneImageModels,
  useFreezoneImageModels,
} from "@/features/canvas/hooks/useFreezoneImageModels";
import { prefetchFreezoneStyleTemplates } from "@/features/canvas/hooks/useFreezoneStyleTemplates";
import { prefetchFreezoneVideoCameraTemplates } from "@/features/canvas/hooks/useFreezoneVideoCameraTemplates";
import { prefetchFreezoneVideoModels } from "@/features/canvas/hooks/useFreezoneVideoModels";
import { NodeReplaceDragPreview } from "@/features/canvas/ui/NodeReplaceDragPreview";
import {
  createCanvasCommitControllerHook,
  createCanvasSyncHook,
  createUseFreezoneCanvasEntryLifecycle,
  createUseFreezoneShellController,
  FreezoneShellView,
  insertAssetLibraryAsset,
  MaskEditor,
  useCanvasProjectionCommandController,
  useCanvasProjectionStatusLifecycle,
  type FreezoneShellCanvasRenderProps,
  type FreezoneShellMaskEditorRenderProps,
  type LibraryAsset,
  type MaskEditorControllerDependencies,
} from "@/modules/creative_canvas/public";
import type { ProjectSummary } from "@/modules/project_workspace/public";
import { currentCanvasParam } from "@/lib/app-router";
import { isCeRuntime } from "@/lib/runtime-config";
import { rememberLastCanvas, writeUrl } from "@/lib/url-params";
import { withImageCacheBust } from "@/shared/media/image-cache";

interface FreezoneShellProps {
  project: ProjectSummary;
  canvasId: string;
}

const useCanvasSync = createCanvasSyncHook<CanvasNode, CanvasEdge>({
  useCanvasState: (selector) => useCanvasStore((state) => selector(state)),
  readCanvasState: useCanvasStore.getState,
  subscribeCanvasState: (listener) =>
    useCanvasStore.subscribe((state, previous) => listener(state, previous)),
  useViewportPort: useReactFlow,
});

const useCanvasCommitController = createCanvasCommitControllerHook({
  store: {
    read() {
      const state = useCanvasStore.getState();
      return {
        nodes: state.nodes,
        updateNodeData: (nodeId, patch) => {
          state.updateNodeData(nodeId, patch as Partial<CanvasNodeData>);
        },
      };
    },
  },
  cacheBustImage: withImageCacheBust,
});

const useFreezoneCanvasEntryLifecycle =
  createUseFreezoneCanvasEntryLifecycle({
    readCanvasNodeCount: () => useCanvasStore.getState().nodes.length,
    prefetchImageModels: prefetchFreezoneImageModels,
    prefetchVideoModels: prefetchFreezoneVideoModels,
    prefetchCameraOptions: prefetchFreezoneCameraOptions,
    prefetchStyleTemplates: prefetchFreezoneStyleTemplates,
    prefetchVideoCameraTemplates: prefetchFreezoneVideoCameraTemplates,
    readCurrentCanvasParam: currentCanvasParam,
    rememberLastCanvas,
    replaceCanvasParam: (canvasId) =>
      writeUrl({ canvas: canvasId }, { replace: true, notify: false }),
  });

function useTranslate() {
  const { t } = useTranslation();
  return (key: string) => t(key);
}

function addMaskResultNode(url: string, label: string): void {
  useCanvasStore.getState().addNode(
    CANVAS_NODE_TYPES.upload,
    { x: 100, y: 1100 },
    {
      displayName: `${label} (mask)`,
      imageUrl: url,
      previewImageUrl: url,
      aspectRatio: "1:1",
      sourceFileName: `${label}-mask`,
    } as Record<string, unknown>,
  );
}

function addAssetToCanvas(asset: LibraryAsset, index: number): void {
  const canvasState = useCanvasStore.getState();
  void insertAssetLibraryAsset({
    asset,
    index,
    nodeWidth: DEFAULT_NODE_WIDTH,
    canvas: {
      canvasViewportSize: canvasState.canvasViewportSize,
      currentViewport: canvasState.currentViewport,
      nodes: canvasState.nodes,
      spawnAsset: (payload, position) =>
        spawnAssetNode(canvasState, payload, position),
      requestFocusNode: canvasState.requestFocusNode,
    },
    hydratePayload: hydrateAssetDragPayload,
    onHydrationError: (error) => {
      console.warn(
        "[freezone] scene director world manifest unavailable during import",
        error,
      );
    },
  });
}

const maskEditorDependencies: MaskEditorControllerDependencies = {
  useImageModels: (projectId) =>
    useFreezoneImageModels(projectId, "edit"),
  uploadAsset: uploadCanvasAsset,
  generateRedraw: (request, onTaskSubmitted) =>
    generateCanvasRedraw(request, onTaskSubmitted),
  createImage: () => new Image(),
  createCanvas: () => document.createElement("canvas"),
  createMaskFile: (blob) =>
    new File([blob], "mask.png", { type: "image/png" }),
};

const useFreezoneShellController = createUseFreezoneShellController({
  useTranslate,
  isChatDockVisible: () => !isCeRuntime(),
  useCanvasSync,
  useFreezoneCanvasEntryLifecycle,
  useCanvasProjectionStatusLifecycle,
  useCanvasCommitController,
  useCanvasProjectionCommandController,
  writeCanvasParam: (canvasId) => writeUrl({ canvas: canvasId }),
  addMaskResultNode,
});

function renderCanvas(props: FreezoneShellCanvasRenderProps) {
  return createElement(Canvas, props);
}

function renderNodeReplaceDragPreview() {
  return createElement(NodeReplaceDragPreview);
}

function renderMaskEditor(props: FreezoneShellMaskEditorRenderProps) {
  return createElement(MaskEditor, {
    ...props,
    dependencies: maskEditorDependencies,
  });
}

/** Mounts the shared xyflow canvas inside the Creative Canvas application shell. */
export function FreezoneShell({ project, canvasId }: FreezoneShellProps) {
  const controller = useFreezoneShellController({
    projectId: project.id,
    canvasId,
  });

  return createElement(FreezoneShellView, {
    controller,
    renderCanvas,
    renderNodeReplaceDragPreview,
    renderMaskEditor,
    addAssetToCanvas,
  });
}
