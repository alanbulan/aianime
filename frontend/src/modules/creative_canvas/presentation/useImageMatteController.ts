// Copyright (c) 2026 AI anime
import { useCallback, useEffect } from 'react';

import {
  buildImageMatteFailurePatch,
  buildImageMatteInitialData,
  buildImageMatteSuccessPatch,
  resolveImageMatteUploadFilename,
  type ImageMatteNodePatch,
} from '../domain/imageMatteNodeModel';

export interface ImageMattePosition {
  x: number;
  y: number;
}

export interface ImageMatteControllerOptions {
  projectId: string;
  nodeId: string;
  nodeData: object;
  imageSource: string | null;
  displayName: string;
}

export interface ImageMatteControllerDependencies {
  addExportImageNode: (
    position: ImageMattePosition,
    data: ImageMatteNodePatch,
  ) => string;
  addEdge: (sourceNodeId: string, targetNodeId: string) => void;
  findNodePosition: (
    nodeId: string,
    width: number,
    height: number,
  ) => ImageMattePosition;
  selectNode: (nodeId: string) => void;
  updateNodeData: (nodeId: string, patch: ImageMatteNodePatch) => void;
  uploadAsset: (
    projectId: string,
    blob: Blob,
    filename: string,
  ) => Promise<{ url: string }>;
  fetchBlob: (sourceUrl: string) => Promise<Blob>;
  matteImage: (blob: Blob) => Promise<Blob>;
  preloadWorker: () => void;
  schedulePreload: (callback: () => void) => () => void;
  now: () => number;
  exportNodeWidth: number;
  exportNodeHeight: number;
  reportError: (message: string, error: unknown) => void;
}

export function createUseImageMatteController(
  dependencies: ImageMatteControllerDependencies,
) {
  return function useImageMatteController({
    projectId,
    nodeId,
    nodeData,
    imageSource,
    displayName,
  }: ImageMatteControllerOptions) {
    useEffect(() => {
      if (!imageSource) {
        return;
      }
      return dependencies.schedulePreload(dependencies.preloadWorker);
    }, [imageSource]);

    const matte = useCallback(() => {
      if (!imageSource) {
        return;
      }

      const startedAt = dependencies.now();
      const nextNodeId = dependencies.addExportImageNode(
        dependencies.findNodePosition(
          nodeId,
          dependencies.exportNodeWidth,
          dependencies.exportNodeHeight,
        ),
        buildImageMatteInitialData(nodeData, displayName, startedAt),
      );
      dependencies.addEdge(nodeId, nextNodeId);
      dependencies.selectNode(nextNodeId);

      void (async () => {
        try {
          const sourceBlob = await dependencies.fetchBlob(imageSource);
          const mattedBlob = await dependencies.matteImage(sourceBlob);
          const uploaded = await dependencies.uploadAsset(
            projectId,
            mattedBlob,
            resolveImageMatteUploadFilename(nodeId, dependencies.now()),
          );
          dependencies.updateNodeData(
            nextNodeId,
            buildImageMatteSuccessPatch(uploaded.url),
          );
        } catch (error) {
          dependencies.reportError('[matte] failed', error);
          const message = error instanceof Error ? error.message : String(error);
          dependencies.updateNodeData(
            nextNodeId,
            buildImageMatteFailurePatch(message),
          );
        }
      })();
    }, [displayName, imageSource, nodeData, nodeId, projectId]);

    return { matte };
  };
}
