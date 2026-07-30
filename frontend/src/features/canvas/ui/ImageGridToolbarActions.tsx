// Copyright (c) 2026 AI anime
import { memo } from "react";

import type { GridActionRequest } from "@/features/canvas/domain/gridAction";
import { useImageGridToolbarController } from "@/features/canvas/hooks/useImageGridToolbarController";

import { ImageGridToolbarActionsView } from "./ImageGridToolbarActionsView";

export interface ImageGridToolbarActionsProps {
  nodeId: string;
  onOpenGridAction: (request: GridActionRequest) => void;
}

export const ImageGridToolbarActions = memo(
  ({ nodeId, onOpenGridAction }: ImageGridToolbarActionsProps) => {
    const controller = useImageGridToolbarController({
      nodeId,
      onOpenGridAction,
    });
    return <ImageGridToolbarActionsView controller={controller} />;
  },
);

ImageGridToolbarActions.displayName = "ImageGridToolbarActions";
