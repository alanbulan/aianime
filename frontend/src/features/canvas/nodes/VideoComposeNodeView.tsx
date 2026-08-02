// Copyright (c) 2026 AI anime
import { Handle, Position } from '@xyflow/react';
import { Film } from 'lucide-react';

import { VideoComposeModal } from '@/features/canvas/compose/VideoComposeModal';
import type { VideoComposeNodeController } from '@/features/canvas/hooks/useVideoComposeNodeController';
import {
  NodeHeader,
  NODE_HEADER_FLOATING_POSITION_CLASS,
} from '@/features/canvas/ui/NodeHeader';
import {
  CANVAS_NODE_INPUT_SURFACE_CLASS,
  canvasNodeFrameClass,
} from '@/features/canvas/ui/nodeFrameStyles';

export function VideoComposeNodeView({
  controller,
}: {
  controller: VideoComposeNodeController;
}) {
  const frameClass = canvasNodeFrameClass({
    selected: controller.selected,
  });

  return (
    <div
      className="group relative h-full w-full overflow-visible"
      style={{ width: controller.size.width, height: controller.size.height }}
      onClick={controller.select}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        className="!h-2 !w-2 !border-0 !bg-muted-foreground"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source"
        className="!h-2 !w-2 !border-0 !bg-muted-foreground"
      />

      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<Film className="h-4 w-4" />}
        titleText={controller.title}
        editable
        onTitleChange={controller.rename}
      />

      <div
        className={`relative flex h-full w-full flex-col overflow-hidden rounded-[var(--node-radius)] border ${CANVAS_NODE_INPUT_SURFACE_CLASS} transition-colors ${frameClass}`}
      >
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-5 py-4 text-center">
          <button
            type="button"
            disabled={!controller.canOpen}
            onClick={(event) => {
              event.stopPropagation();
              controller.openEditor();
            }}
            className="flex h-10 w-full items-center justify-center rounded-[12px] border border-border bg-muted px-4 text-center text-[13px] text-foreground transition-colors hover:border-foreground/25 hover:bg-accent disabled:cursor-not-allowed disabled:opacity-45"
          >
            {controller.openLabel}
          </button>
          <span className="text-[12px] text-text-muted/90">
            {controller.hintText}
          </span>
        </div>
      </div>

      {controller.isEditorOpen && controller.project && (
        <VideoComposeModal
          project={controller.project}
          canvasId={controller.canvasId}
          seedNodeIds={controller.seedNodeIds}
          sourceMedia={controller.sourceMedia}
          initialTimeline={controller.initialTimeline}
          onPersistDraft={controller.persistDraft}
          onClose={controller.closeEditor}
          onComposed={controller.completeComposition}
        />
      )}
    </div>
  );
}
