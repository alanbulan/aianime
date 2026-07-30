// Copyright (c) 2026 AI anime
import { memo } from "react";

import { useImageEditToolbarController } from "@/features/canvas/hooks/useImageEditToolbarController";

import { ImageEditToolbarActionsView } from "./ImageEditToolbarActionsView";

export interface ImageEditToolbarActionsProps {
  nodeId: string;
  isPresetLocked: boolean;
  onOpenRedraw: (nodeId: string) => void;
  onOpenErase: (nodeId: string) => void;
  onMatteImage: () => void;
  onOpenUpscale: (nodeId: string) => void;
  onOpenOutpaint: (nodeId: string) => void;
}

export const ImageEditToolbarActions = memo(
  ({
    nodeId,
    isPresetLocked,
    onOpenRedraw,
    onOpenErase,
    onMatteImage,
    onOpenUpscale,
    onOpenOutpaint,
  }: ImageEditToolbarActionsProps) => {
    const controller = useImageEditToolbarController({
      nodeId,
      isPresetLocked,
      onOpenRedraw,
      onOpenErase,
      onMatteImage,
      onOpenUpscale,
      onOpenOutpaint,
    });
    return <ImageEditToolbarActionsView controller={controller} />;
  },
);

ImageEditToolbarActions.displayName = "ImageEditToolbarActions";
