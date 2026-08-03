// Copyright (c) 2026 AI anime
import { useCallback, useEffect } from "react";

import { useCanvasStore } from "@/features/canvas/canvasStore";
import { uploadCanvasAsset } from "@/features/canvas/composition";
import {
  CANVAS_NODE_TYPES,
  type CanvasNodeData,
} from "@/features/canvas/domain/canvasNodes";
import {
  matteInWorker,
  preloadMatteWorker,
} from "@/features/canvas/infrastructure/matteClient";
import {
  buildImageMatteFailurePatch,
  buildImageMatteInitialData,
  buildImageMatteSuccessPatch,
  EXPORT_RESULT_NODE_DEFAULT_WIDTH,
  EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
  resolveImageMatteUploadFilename,
} from "@/modules/creative_canvas/public";

export interface ImageMatteControllerOptions {
  projectId: string;
  nodeId: string;
  nodeData: CanvasNodeData;
  imageSource: string | null;
  displayName: string;
}

export function useImageMatteController({
  projectId,
  nodeId,
  nodeData,
  imageSource,
  displayName,
}: ImageMatteControllerOptions) {
  const addNode = useCanvasStore((state) => state.addNode);
  const addEdge = useCanvasStore((state) => state.addEdge);
  const findNodePosition = useCanvasStore((state) => state.findNodePosition);
  const setSelectedNode = useCanvasStore((state) => state.setSelectedNode);
  const updateNodeData = useCanvasStore((state) => state.updateNodeData);

  useEffect(() => {
    if (!imageSource) return;
    const win = window as unknown as {
      requestIdleCallback?: (callback: () => void) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    if (typeof win.requestIdleCallback === "function") {
      const handle = win.requestIdleCallback(preloadMatteWorker);
      return () => win.cancelIdleCallback?.(handle);
    }
    const timer = setTimeout(preloadMatteWorker, 1200);
    return () => clearTimeout(timer);
  }, [imageSource]);

  const matte = useCallback(() => {
    if (!imageSource) return;

    const nextNodeId = addNode(
      CANVAS_NODE_TYPES.exportImage,
      findNodePosition(
        nodeId,
        EXPORT_RESULT_NODE_DEFAULT_WIDTH,
        EXPORT_RESULT_NODE_LAYOUT_HEIGHT,
      ),
      buildImageMatteInitialData(nodeData, displayName, Date.now()),
    );
    addEdge(nodeId, nextNodeId);
    setSelectedNode(nextNodeId);

    const sourceUrl = imageSource;
    void (async () => {
      try {
        const sourceResponse = await fetch(sourceUrl);
        if (!sourceResponse.ok) {
          throw new Error(`fetch source failed: ${sourceResponse.status}`);
        }
        const sourceBlob = await sourceResponse.blob();
        const mattedBlob = await matteInWorker(sourceBlob);
        const uploaded = await uploadCanvasAsset(
          projectId,
          mattedBlob,
          resolveImageMatteUploadFilename(nodeId, Date.now()),
        );
        updateNodeData(
          nextNodeId,
          buildImageMatteSuccessPatch(uploaded.url),
        );
      } catch (error) {
        console.error("[matte] failed", error);
        const message = error instanceof Error ? error.message : String(error);
        updateNodeData(nextNodeId, buildImageMatteFailurePatch(message));
      }
    })();
  }, [
    addEdge,
    addNode,
    displayName,
    findNodePosition,
    imageSource,
    nodeData,
    nodeId,
    projectId,
    setSelectedNode,
    updateNodeData,
  ]);

  return { matte };
}
