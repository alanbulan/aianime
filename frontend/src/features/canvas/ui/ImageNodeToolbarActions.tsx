// Copyright (c) 2026 AI anime
import { memo } from "react";

import type { CanvasNode } from "@/features/canvas/domain/canvasNodes";
import {
  ImageNodeToolbarActionsView,
  type GridActionRequest,
} from "@/modules/creative_canvas/public";
import { useImageNodeToolbarController } from "@/features/canvas/hooks/useImageNodeToolbarController";

import { ImageEditToolbarActions } from "./ImageEditToolbarActions";
import { ImageGridToolbarActions } from "./ImageGridToolbarActions";

export interface ImageNodeToolbarActionsProps {
  projectId: string;
  node: CanvasNode;
  isPresetLocked: boolean;
  onOpenMultiAngleEditor: (nodeId: string) => void;
  onOpenLightEditor: (nodeId: string) => void;
  onOpenScene360: (nodeId: string) => void;
  onOpenUpscale: (nodeId: string) => void;
  onOpenOutpaint: (nodeId: string) => void;
  onOpenGridAction: (request: GridActionRequest) => void;
  onOpenRedraw: (nodeId: string) => void;
  onOpenErase: (nodeId: string) => void;
  onOpenRotate: (nodeId: string) => void;
}

export const ImageNodeToolbarActions = memo(
  (props: ImageNodeToolbarActionsProps) => {
    const controller = useImageNodeToolbarController(props);
    return (
      <ImageNodeToolbarActionsView
        controller={controller}
        editActions={
          controller.canEdit ? (
            <ImageEditToolbarActions
              projectId={controller.projectId}
              nodeId={controller.nodeId}
              nodeData={controller.nodeData}
              imageSource={controller.imageSource}
              isPresetLocked={controller.isPresetLocked}
              onOpenRedraw={controller.onOpenRedraw}
              onOpenErase={controller.onOpenErase}
              onOpenUpscale={controller.onOpenUpscale}
              onOpenOutpaint={controller.onOpenOutpaint}
            />
          ) : null
        }
        gridActions={
          <ImageGridToolbarActions
            nodeId={controller.nodeId}
            onOpenGridAction={controller.onOpenGridAction}
          />
        }
      />
    );
  },
);

ImageNodeToolbarActions.displayName = "ImageNodeToolbarActions";
