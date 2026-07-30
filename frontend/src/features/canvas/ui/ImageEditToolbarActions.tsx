// Copyright (c) 2026 AI anime
import { memo } from "react";

import type { CanvasNodeData } from "@/features/canvas/domain/canvasNodes";
import { useImageEditToolbarController } from "@/features/canvas/hooks/useImageEditToolbarController";

import { ImageEditToolbarActionsView } from "./ImageEditToolbarActionsView";

export interface ImageEditToolbarActionsProps {
  nodeId: string;
  nodeData: CanvasNodeData;
  imageSource: string | null;
  isPresetLocked: boolean;
  onOpenRedraw: (nodeId: string) => void;
  onOpenErase: (nodeId: string) => void;
  onOpenUpscale: (nodeId: string) => void;
  onOpenOutpaint: (nodeId: string) => void;
}

export const ImageEditToolbarActions = memo(
  ({
    nodeId,
    nodeData,
    imageSource,
    isPresetLocked,
    onOpenRedraw,
    onOpenErase,
    onOpenUpscale,
    onOpenOutpaint,
  }: ImageEditToolbarActionsProps) => {
    const controller = useImageEditToolbarController({
      nodeId,
      nodeData,
      imageSource,
      isPresetLocked,
      onOpenRedraw,
      onOpenErase,
      onOpenUpscale,
      onOpenOutpaint,
    });
    return <ImageEditToolbarActionsView controller={controller} />;
  },
);

ImageEditToolbarActions.displayName = "ImageEditToolbarActions";
