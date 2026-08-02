// Copyright (c) 2026 AI anime
import { createElement } from "react";
import { useTranslation } from "react-i18next";

import { Canvas } from "@/features/canvas/Canvas";
import {
  useCanvasStore,
  type CanvasNodeData,
} from "@/features/canvas/canvasStore";
import { prefetchFreezoneCameraOptions } from "@/features/canvas/hooks/useFreezoneCameraOptions";
import { prefetchFreezoneImageModels } from "@/features/canvas/hooks/useFreezoneImageModels";
import { prefetchFreezoneStyleTemplates } from "@/features/canvas/hooks/useFreezoneStyleTemplates";
import { prefetchFreezoneVideoCameraTemplates } from "@/features/canvas/hooks/useFreezoneVideoCameraTemplates";
import { prefetchFreezoneVideoModels } from "@/features/canvas/hooks/useFreezoneVideoModels";
import { CANVAS_NODE_TYPES } from "@/features/canvas/domain/canvasNodes";
import { NodeReplaceDragPreview } from "@/features/canvas/ui/NodeReplaceDragPreview";
import {
  createCanvasCommitControllerHook,
  createUseFreezoneCanvasEntryLifecycle,
  createUseFreezoneShellController,
  FreezoneShellView,
  useCanvasProjectionCommandController,
  useCanvasProjectionStatusLifecycle,
  type FreezoneShellCanvasRenderProps,
  type FreezoneShellMaskEditorRenderProps,
} from "@/modules/creative_canvas/public";
import type { ProjectSummary } from "@/modules/project_workspace/public";
import { currentCanvasParam } from "@/lib/app-router";
import { isCeRuntime } from "@/lib/runtime-config";
import { rememberLastCanvas, writeUrl } from "@/lib/url-params";
import { withImageCacheBust } from "@/shared/media/image-cache";

import { addAssetToCanvas } from "./assetLibraryCanvasInsertionComposition";
import { useCanvasSync } from "./hooks/useCanvasSync";
import { MaskEditor } from "./presentation/MaskEditor";

interface FreezoneShellProps {
  project: ProjectSummary;
  canvasId: string;
}

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
  return createElement(MaskEditor, props);
}

/** Mounts the shared xyflow canvas inside the Beat Workbench shell. */
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
