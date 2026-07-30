// Copyright (c) 2026 AI anime
import { memo } from "react";
import { NodeToolbar as ReactFlowNodeToolbar } from "@xyflow/react";

import { nodeMainlineFlags } from "@/features/canvas/domain/mainlineNodeFlags";

import {
  isAudioNode,
  isGroupNode,
  isImageEditNode,
  isProtectedProjectionGroupNode,
  isStoryboardGroupNode,
  isVideoNode,
  type CanvasNode,
  type GroupNodeData,
} from "@/features/canvas/domain/canvasNodes";
import type { GridActionRequest } from "@/features/canvas/domain/gridAction";
import { AudioNodeToolbarActions } from "@/features/canvas/ui/AudioNodeToolbarActions";
import { GroupNodeToolbarActions } from "@/features/canvas/ui/GroupNodeToolbarActions";
import { ImageNodeToolbarActions } from "@/features/canvas/ui/ImageNodeToolbarActions";
import { NodeManagementToolbarActions } from "@/features/canvas/ui/NodeManagementToolbarActions";
import { NodeMainlineToolbarActions } from "@/features/canvas/ui/NodeMainlineToolbarActions";
import { NodeOutputToolbarActions } from "@/features/canvas/ui/NodeOutputToolbarActions";
import { StoryboardGroupToolbar } from "@/features/canvas/ui/StoryboardGroupToolbar";
import { VideoNodeToolbarActions } from "@/features/canvas/ui/VideoNodeToolbarActions";
import { UiPanel } from "@/components/ui";
import { ZoomScaledToolbar } from "@/features/canvas/ui/ZoomScaledToolbar";
import {
  NODE_TOOLBAR_ALIGN,
  NODE_TOOLBAR_CLASS,
  NODE_TOOLBAR_OFFSET,
  NODE_TOOLBAR_POSITION,
} from "./nodeToolbarConfig";
interface NodeActionToolbarProps {
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

export const NodeActionToolbar = memo(
  ({
    node,
    onOpenMultiAngleEditor,
    onOpenLightEditor,
    onOpenScene360,
    onOpenUpscale,
    onOpenOutpaint,
    onOpenGridAction,
    onOpenRedraw,
    onOpenErase,
    onOpenRotate,
  }: NodeActionToolbarProps) => {
    const isImageEdit = isImageEditNode(node);
    // Plain (non-protected) group → eligible for ungroup. Captured up here as a
    // boolean + a plain id while `node` still has its full type: over-broad node
    // type guards below narrow `node` to `never` by the time the ungroup button
    // renders, so reading `node.id` at the call site fails to type-check.
    const nodeId = node.id;
    const isUngroupableGroup = isGroupNode(node) && !isProtectedProjectionGroupNode(node);
    // 同 nodeId:在 node 仍是完整类型时捕获组背景色。下方过宽的类型守卫会把 node
    // 收窄成 never,到 ungroup 按钮渲染处再读 node.data 会编译失败(tsc -b)。
    const groupBackgroundColor = isGroupNode(node)
      ? ((node.data as GroupNodeData).backgroundColor ?? null)
      : null;
    const isPresetLocked = nodeMainlineFlags(node).isPresetManaged;

    // 分镜组 has its own dedicated toolbar (aspect / grid / index / convert /
    // ungroup) — render it instead of the generic node toolbar.
    if (isStoryboardGroupNode(node)) {
      return <StoryboardGroupToolbar node={node} />;
    }

    return (
      <>
        <ReactFlowNodeToolbar
          nodeId={node.id}
          isVisible
          position={NODE_TOOLBAR_POSITION}
          align={NODE_TOOLBAR_ALIGN}
          offset={NODE_TOOLBAR_OFFSET}
          className={NODE_TOOLBAR_CLASS}
        >
          <ZoomScaledToolbar origin="bottom center" mode="counter" counterMax={1}>
          {/* 节点激活时，顶部菜单从节点上沿淡入+轻微上滑浮现（而非生硬地直接出现），
              与下方操作区的入场动画呼应。motion-reduce 下退化为无动画。 */}
          <UiPanel className="flex animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 items-center gap-1.5 rounded-[18px] !border-border !bg-popover/95 px-2 py-1.5 text-sm shadow-xl backdrop-blur-2xl duration-200 ease-out motion-reduce:animate-none [&_svg]:h-4 [&_svg]:w-4">
            <NodeMainlineToolbarActions
              node={node}
              isPresetLocked={isPresetLocked}
            />
            <ImageNodeToolbarActions
              node={node}
              isPresetLocked={isPresetLocked}
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
            {isVideoNode(node) && (
              <VideoNodeToolbarActions nodeId={node.id} data={node.data} />
            )}
            {isAudioNode(node) && (
              <AudioNodeToolbarActions nodeId={node.id} data={node.data} />
            )}
            {!isImageEdit && isUngroupableGroup && (
              <GroupNodeToolbarActions
                nodeId={nodeId}
                backgroundColor={groupBackgroundColor}
              />
            )}
            <NodeManagementToolbarActions node={node} />
          </UiPanel>
          </ZoomScaledToolbar>
        </ReactFlowNodeToolbar>
      </>
    );
  },
);

NodeActionToolbar.displayName = "NodeActionToolbar";
