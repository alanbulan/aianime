// Copyright (c) 2026 AI anime
import { Handle, Position } from '@xyflow/react';
import { AlertTriangle, Music2 } from 'lucide-react';

import type { AudioNodeController } from './useAudioNodeController';
import { AudioOperationsPanel } from './AudioOperationsPanel';
import { AudioWaveformPlayer } from './AudioWaveformPlayer';
import { NodeContextBadges } from './NodeContextBadges';
import { NodeGenerationOverlay } from './NodeGenerationOverlay';
import { NodeResizeHandle } from './NodeResizeHandle';
import { RegenerateButton } from './RegenerateButton';
import {
  CANVAS_NODE_PANEL_SURFACE_CLASS,
  canvasNodeFrameClass,
} from './canvasNodeFrameStyles';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from './NodeHeader';

export function AudioNodeView({
  controller,
}: {
  controller: AudioNodeController;
}) {
  const toneClass = canvasNodeFrameClass({
    selected: controller.selected,
    mainline: controller.hasMainlineContext,
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
        icon={<Music2 className="h-4 w-4" />}
        titleText={controller.title}
        editable
        onTitleChange={controller.rename}
      />
      <NodeContextBadges contexts={controller.contexts} />

      <NodeResizeHandle
        minWidth={controller.size.minWidth}
        minHeight={controller.size.minHeight}
        maxWidth={controller.size.maxWidth}
        maxHeight={controller.size.maxHeight}
      />

      <div
        className={`relative flex h-full w-full items-center justify-center ${controller.audioSource ? 'overflow-hidden' : 'overflow-visible'} rounded-[var(--node-radius)] border ${CANVAS_NODE_PANEL_SURFACE_CLASS} transition-colors ${toneClass}`}
      >
        {controller.isGenerating ? (
          <NodeGenerationOverlay
            progress={controller.generationProgress}
          />
        ) : controller.audioSource ? (
          <AudioWaveformPlayer
            src={controller.audioSource}
            durationMs={controller.data.durationMs}
            onLoadedDuration={controller.updateDuration}
          />
        ) : controller.hasGenerationError ? (
          <div className="nodrag flex flex-col items-center px-5 text-center">
            <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
              <span>生成失败</span>
            </div>
            <div
              className="mt-1 max-h-12 max-w-full overflow-y-auto break-words text-[11px] leading-4 text-destructive [overflow-wrap:anywhere]"
              data-ui-tooltip={controller.generationError}
            >
              {controller.generationError}
            </div>
            <div className="mt-2 flex justify-center">
              <RegenerateButton
                onClick={() => void controller.retry()}
                busy={controller.isGenerating}
                label="重试"
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-text-muted/70">
            <Music2 className="h-7 w-7 opacity-60" />
            <span className="text-[12px]">暂无音频</span>
          </div>
        )}
      </div>

      {controller.showOperationsPanel && (
        <AudioOperationsPanel
          projectId={controller.projectId}
          canvasId={controller.canvasId}
          nodeId={controller.id}
          data={controller.data}
        />
      )}
    </div>
  );
}
