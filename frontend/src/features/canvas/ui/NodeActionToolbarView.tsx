// Copyright (c) 2026 AI anime
import { NodeToolbar as ReactFlowNodeToolbar } from "@xyflow/react";

import { UiPanel } from "@/components/ui";
import type {
  AudioNodeData,
  CanvasNode,
  VideoNodeData,
} from "@/features/canvas/domain/canvasNodes";
import type {
  GridActionRequest,
  NodeActionToolbarShellProjection,
} from "@/modules/creative_canvas/public";
import { AudioNodeToolbarActions } from "@/features/canvas/ui/AudioNodeToolbarActions";
import { CanvasGroupNodeToolbarActionsAdapter } from "@/features/canvas/ui/CanvasGroupNodeToolbarActionsAdapter";
import { ImageNodeToolbarActions } from "@/features/canvas/ui/ImageNodeToolbarActions";
import { NodeMainlineToolbarActions } from "@/features/canvas/ui/NodeMainlineToolbarActions";
import { NodeManagementToolbarActions } from "@/features/canvas/ui/NodeManagementToolbarActions";
import { NodeOutputToolbarActions } from "@/features/canvas/ui/NodeOutputToolbarActions";
import { CanvasStoryboardGroupToolbarAdapter } from "@/features/canvas/ui/CanvasStoryboardGroupToolbarAdapter";
import { VideoNodeToolbarActions } from "@/features/canvas/ui/VideoNodeToolbarActions";
import { ZoomScaledToolbar } from "@/features/canvas/ui/ZoomScaledToolbar";

import {
  NODE_TOOLBAR_ALIGN,
  NODE_TOOLBAR_CLASS,
  NODE_TOOLBAR_OFFSET,
  NODE_TOOLBAR_POSITION,
} from "./nodeToolbarConfig";

export interface NodeActionToolbarViewProps {
  projectId: string;
  node: CanvasNode;
  projection: NodeActionToolbarShellProjection<VideoNodeData, AudioNodeData>;
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

export function NodeActionToolbarView({
  projectId,
  node,
  projection,
  onOpenMultiAngleEditor,
  onOpenLightEditor,
  onOpenScene360,
  onOpenUpscale,
  onOpenOutpaint,
  onOpenGridAction,
  onOpenRedraw,
  onOpenErase,
  onOpenRotate,
}: NodeActionToolbarViewProps) {
  if (projection.isStoryboardGroup) {
    return <CanvasStoryboardGroupToolbarAdapter node={node} />;
  }

  return (
    <ReactFlowNodeToolbar
      nodeId={node.id}
      isVisible
      position={NODE_TOOLBAR_POSITION}
      align={NODE_TOOLBAR_ALIGN}
      offset={NODE_TOOLBAR_OFFSET}
      className={NODE_TOOLBAR_CLASS}
    >
      <ZoomScaledToolbar origin="bottom center" mode="counter" counterMax={1}>
        <UiPanel className="flex animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 items-center gap-1.5 rounded-[18px] !border-border !bg-popover/95 px-2 py-1.5 text-sm shadow-xl backdrop-blur-2xl duration-200 ease-out motion-reduce:animate-none [&_svg]:h-4 [&_svg]:w-4">
          <NodeMainlineToolbarActions
            projectId={projectId}
            node={node}
            isPresetLocked={projection.isPresetLocked}
          />
          <ImageNodeToolbarActions
            projectId={projectId}
            node={node}
            isPresetLocked={projection.isPresetLocked}
            onOpenMultiAngleEditor={onOpenMultiAngleEditor}
            onOpenLightEditor={onOpenLightEditor}
            onOpenScene360={onOpenScene360}
            onOpenUpscale={onOpenUpscale}
            onOpenOutpaint={onOpenOutpaint}
            onOpenGridAction={onOpenGridAction}
            onOpenRedraw={onOpenRedraw}
            onOpenErase={onOpenErase}
            onOpenRotate={onOpenRotate}
          />
          <NodeOutputToolbarActions node={node} />
          {projection.videoData && (
            <VideoNodeToolbarActions
              projectId={projectId}
              nodeId={node.id}
              data={projection.videoData}
            />
          )}
          {projection.audioData && (
            <AudioNodeToolbarActions
              nodeId={node.id}
              data={projection.audioData}
            />
          )}
          {!projection.isImageEdit && projection.isUngroupableGroup && (
            <CanvasGroupNodeToolbarActionsAdapter
              nodeId={node.id}
              backgroundColor={projection.groupBackgroundColor}
            />
          )}
          <NodeManagementToolbarActions node={node} />
        </UiPanel>
      </ZoomScaledToolbar>
    </ReactFlowNodeToolbar>
  );
}
