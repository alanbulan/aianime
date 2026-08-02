// Copyright (c) 2026 AI anime
import { memo } from "react";

import type { CanvasNode } from "@/features/canvas/domain/canvasNodes";
import type { GridActionRequest } from "@/features/canvas/domain/gridAction";
import { useImageNodeToolbarController } from "@/features/canvas/hooks/useImageNodeToolbarController";

import { ImageNodeToolbarActionsView } from "./ImageNodeToolbarActionsView";

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
    return <ImageNodeToolbarActionsView controller={controller} />;
  },
);

ImageNodeToolbarActions.displayName = "ImageNodeToolbarActions";
