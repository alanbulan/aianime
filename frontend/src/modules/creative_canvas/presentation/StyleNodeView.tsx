// Copyright (c) 2026 AI anime
import { Handle, Position } from '@xyflow/react';
import { Images, Palette } from 'lucide-react';

import { canvasNodeFrameClass, CANVAS_NODE_INPUT_SURFACE_CLASS } from './canvasNodeFrameStyles';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from './NodeHeader';
import { StylePickerPopover } from './StylePickerPopover';
import type {
  StyleNodeController,
  StyleSelectionState,
} from './useStyleNodeController';
import {
  STYLE_NODE_HEIGHT,
  STYLE_NODE_WIDTH,
} from '../domain/styleNodeModel';

const PLACEHOLDER_TEXT: Record<StyleSelectionState, string> = {
  none: '未选择风格',
  ready: '',
  loading: '加载中…',
  failed: '风格清单加载失败，点一下重试',
  missing: '风格已失效，点一下重选',
};

export function StyleNodeView({
  controller,
}: {
  controller: StyleNodeController;
}) {
  const {
    id,
    selected,
    projectId,
    templateId,
    template,
    selectionState,
    resolvedTitle,
    isOrphan,
    galleryOpen,
    setGalleryOpen,
    openGallery,
    handleSelectStyle,
    setSelectedNode,
    updateNodeData,
  } = controller;
  const cardToneClass = canvasNodeFrameClass({ selected });

  return (
    <div
      className="group relative h-full w-full overflow-visible"
      style={{ width: STYLE_NODE_WIDTH, height: STYLE_NODE_HEIGHT }}
      onClick={() => setSelectedNode(id)}
    >
      <Handle
        type="source"
        position={Position.Right}
        id="source"
        className="!h-2 !w-2 !border-0 !bg-muted-foreground"
      />

      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<Palette className="h-4 w-4" />}
        titleText={resolvedTitle}
        editable
        onTitleChange={(next) => updateNodeData(id, { displayName: next })}
      />

      <div
        role="button"
        tabIndex={0}
        aria-label={template ? `风格 ${template.label}` : '选择风格'}
        aria-disabled={isOrphan}
        onClick={(event) => {
          event.stopPropagation();
          openGallery();
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          openGallery();
        }}
        className={`relative flex h-full w-full flex-col overflow-hidden rounded-[var(--node-radius)] border ${CANVAS_NODE_INPUT_SURFACE_CLASS} transition-colors ${cardToneClass} ${
          isOrphan ? 'cursor-default' : 'cursor-pointer'
        }`}
      >
        <div className="relative flex-1 overflow-hidden bg-white/[0.04]">
          {template?.coverUrl ? (
            <img
              src={template.coverUrl}
              alt={template.label}
              draggable={false}
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          ) : template ? (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted via-muted/80 to-primary/15 text-sm font-medium text-muted-foreground">
              {template.label}
            </div>
          ) : (
            <div
              className={`flex h-full w-full items-center justify-center text-[12px] ${
                selectionState === 'failed' || selectionState === 'missing'
                  ? 'text-amber-300/90'
                  : 'text-text-muted/90'
              }`}
            >
              {PLACEHOLDER_TEXT[selectionState]}
            </div>
          )}
        </div>
        {isOrphan && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-center text-[11px] text-white/80">
            未连接图片节点
          </span>
        )}
      </div>

      {!isOrphan && (
        <button
          type="button"
          aria-label="更换风格"
          title="更换风格"
          onClick={(event) => {
            event.stopPropagation();
            openGallery();
          }}
          className="nodrag absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-md bg-black/55 text-white opacity-0 transition-opacity hover:bg-black/75 focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Images className="size-4" />
        </button>
      )}

      {galleryOpen && (
        <div
          className="absolute left-full top-0 z-[300] ml-3"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <StylePickerPopover
            projectId={projectId}
            selectedId={templateId}
            onSelect={handleSelectStyle}
            onClose={() => setGalleryOpen(false)}
          />
        </div>
      )}
    </div>
  );
}
