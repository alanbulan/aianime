// Copyright (c) 2026 AI anime
import { memo } from 'react';
import { NodeToolbar as ReactFlowNodeToolbar } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';


;
import { NODE_TOOLBAR_ALIGN, NODE_TOOLBAR_CLASS, NODE_TOOLBAR_OFFSET, NODE_TOOLBAR_POSITION, StoryboardGroupToolbarView, ZoomScaledToolbar, useStoryboardGroupToolbarController, type CanvasNode, type GroupNodeData } from '@/modules/creative_canvas/public';

import { useCanvasStore } from "@/modules/creative_canvas/public";
const toolbarStyles = {
  panel:
    'flex animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 items-center gap-1.5 rounded-[18px] !border-border !bg-popover/95 px-2 py-1.5 text-sm shadow-xl backdrop-blur-2xl duration-200 ease-out motion-reduce:animate-none [&_svg]:h-4 [&_svg]:w-4',
  chip:
    'h-9 gap-1.5 rounded-[12px] !border-transparent !bg-transparent px-3 text-sm text-foreground hover:!bg-muted focus:!border-transparent focus:!shadow-none focus-visible:!ring-0',
  menuContent:
    'z-[120] min-w-[120px] border-border bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-3xl',
  menuItem:
    'gap-2 rounded-[10px] text-popover-foreground focus:bg-muted focus:text-popover-foreground',
};

export interface CanvasStoryboardGroupToolbarAdapterProps {
  node: CanvasNode;
}

export const CanvasStoryboardGroupToolbarAdapter = memo(
  ({ node }: CanvasStoryboardGroupToolbarAdapterProps) => {
    const { t } = useTranslation();
    const data = node.data as GroupNodeData;
    const configureGroup = useCanvasStore(
      (state) => state.setStoryboardGroupConfig,
    );
    const convertGroupToPlain = useCanvasStore(
      (state) => state.convertStoryboardGroupToPlain,
    );
    const ungroup = useCanvasStore((state) => state.ungroupNode);
    const childCount = useCanvasStore((state) =>
      state.nodes.reduce(
        (count, candidate) =>
          count + (candidate.parentId === node.id ? 1 : 0),
        0,
      ),
    );
    const controller = useStoryboardGroupToolbarController({
      groupNodeId: node.id,
      childCount,
      aspectKey: data.storyboardAspect,
      requestedCols: data.storyboardCols,
      showIndex: data.storyboardShowIndex === true,
      translate: (key, options) => String(t(key, options)),
      configureGroup,
      convertGroupToPlain,
      notifyStitchUnavailable: () => {
        toast(t('canvas.storyboardGroup.stitchComingSoon'));
      },
      ungroup,
    });

    return (
      <ReactFlowNodeToolbar
        nodeId={node.id}
        isVisible
        position={NODE_TOOLBAR_POSITION}
        align={NODE_TOOLBAR_ALIGN}
        offset={NODE_TOOLBAR_OFFSET}
        className={NODE_TOOLBAR_CLASS}
      >
        <ZoomScaledToolbar origin="bottom center">
          <StoryboardGroupToolbarView
            controller={controller}
            styles={toolbarStyles}
          />
        </ZoomScaledToolbar>
      </ReactFlowNodeToolbar>
    );
  },
);

CanvasStoryboardGroupToolbarAdapter.displayName =
  'CanvasStoryboardGroupToolbarAdapter';
