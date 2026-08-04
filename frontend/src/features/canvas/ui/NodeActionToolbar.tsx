// Copyright (c) 2026 AI anime
import { memo } from "react";

import {
  isAudioNode,
  isGroupNode,
  isImageEditNode,
  isProtectedProjectionGroupNode,
  isStoryboardGroupNode,
  isVideoNode,
  type CanvasNode,
} from "@/features/canvas/domain/canvasNodes";
import {
  NodeActionToolbarView,
  nodeMainlineFlags,
  projectNodeActionToolbarShell,
  type GridActionRequest,
} from "@/modules/creative_canvas/public";

import { AudioNodeToolbarActions } from "./AudioNodeToolbarActions";
import { CanvasGroupNodeToolbarActionsAdapter } from "./CanvasGroupNodeToolbarActionsAdapter";
import { CanvasStoryboardGroupToolbarAdapter } from "./CanvasStoryboardGroupToolbarAdapter";
import { ImageNodeToolbarActions } from "./ImageNodeToolbarActions";
import { NodeMainlineToolbarActions } from "./NodeMainlineToolbarActions";
import { NodeManagementToolbarActions } from "./NodeManagementToolbarActions";
import { NodeOutputToolbarActions } from "./NodeOutputToolbarActions";
import { VideoNodeToolbarActions } from "./VideoNodeToolbarActions";

export interface NodeActionToolbarProps {
  projectId: string;
  node: CanvasNode;
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

export const NodeActionToolbar = memo((props: NodeActionToolbarProps) => {
  const { node } = props;
  const isGroup = isGroupNode(node);
  const projection = projectNodeActionToolbarShell({
    isGroup,
    isProtectedProjectionGroup: isProtectedProjectionGroupNode(node),
    isStoryboardGroup: isStoryboardGroupNode(node),
    isImageEdit: isImageEditNode(node),
    videoData: isVideoNode(node) ? node.data : null,
    audioData: isAudioNode(node) ? node.data : null,
    groupBackgroundColor: isGroup ? node.data.backgroundColor : null,
    isPresetLocked: nodeMainlineFlags(node).isPresetManaged,
  });
  return (
    <NodeActionToolbarView
      nodeId={node.id}
      storyboardGroupToolbar={
        projection.isStoryboardGroup ? (
          <CanvasStoryboardGroupToolbarAdapter node={node} />
        ) : null
      }
      actions={
        <>
          <NodeMainlineToolbarActions
            projectId={props.projectId}
            node={node}
            isPresetLocked={projection.isPresetLocked}
          />
          <ImageNodeToolbarActions
            projectId={props.projectId}
            node={node}
            isPresetLocked={projection.isPresetLocked}
            onOpenMultiAngleEditor={props.onOpenMultiAngleEditor}
            onOpenLightEditor={props.onOpenLightEditor}
            onOpenScene360={props.onOpenScene360}
            onOpenUpscale={props.onOpenUpscale}
            onOpenOutpaint={props.onOpenOutpaint}
            onOpenGridAction={props.onOpenGridAction}
            onOpenRedraw={props.onOpenRedraw}
            onOpenErase={props.onOpenErase}
            onOpenRotate={props.onOpenRotate}
          />
          <NodeOutputToolbarActions node={node} />
          {projection.videoData && (
            <VideoNodeToolbarActions
              projectId={props.projectId}
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
        </>
      }
    />
  );
});

NodeActionToolbar.displayName = "NodeActionToolbar";
