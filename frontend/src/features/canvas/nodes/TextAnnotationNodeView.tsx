// Copyright (c) 2026 AI anime
import { Handle, Position } from '@xyflow/react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import {
  AlignJustify,
  ArrowUp,
  FileText,
  Image as ImageIcon,
  Languages,
  Loader2,
  Music,
  Music2,
  PlaySquare,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CreditCostInline } from '@/components/credit-cost-inline';
import type { TextAnnotationNodeController } from '@/features/canvas/hooks/useTextAnnotationNodeController';
import {
  CANVAS_NODE_INPUT_BODY_FRAME_CLASS,
  CANVAS_NODE_INPUT_BODY_SELECTED_FRAME_CLASS,
  CANVAS_NODE_INPUT_FRAME_CLASS,
  CANVAS_NODE_INPUT_PLACEHOLDER_CLASS,
  CANVAS_NODE_INPUT_SURFACE_CLASS,
  NODE_GENERATE_BUTTON_BASE_CLASS,
  NODE_GENERATE_BUTTON_DISABLED_CLASS,
  NODE_GENERATE_BUTTON_ENABLED_CLASS,
  NODE_INLINE_ICON_BUTTON_ACTIVE_CLASS,
  NODE_INLINE_ICON_BUTTON_CLASS,
  NodeGenerationOverlay,
  NodeResizeHandle,
  type TextNodeMode,
} from '@/modules/creative_canvas/public';
import {
  NodeHeader,
  NODE_HEADER_FLOATING_POSITION_CLASS,
} from '@/modules/creative_canvas/public';
import { ProviderModelPicker } from '@/features/canvas/ui/ProviderModelPicker';

const PICKER_INSET = 32;
const OPS_PANEL_HEIGHT = 140;
const OPS_PANEL_GAP = 12;
const OPS_PANEL_MIN_WIDTH = 480;

const MODE_OPTIONS: ReadonlyArray<{
  key: TextNodeMode;
  icon: typeof FileText;
  labelKey: string;
}> = [
  {
    key: 'writing',
    icon: FileText,
    labelKey: 'node.textNode.modes.writing',
  },
  {
    key: 'textToVideo',
    icon: PlaySquare,
    labelKey: 'node.textNode.modes.textToVideo',
  },
  {
    key: 'imageToPrompt',
    icon: ImageIcon,
    labelKey: 'node.textNode.modes.imageToPrompt',
  },
  {
    key: 'textToMusic',
    icon: Music,
    labelKey: 'node.textNode.modes.textToMusic',
  },
  {
    key: 'textToMusicGen',
    icon: Music2,
    labelKey: 'node.textNode.modes.textToMusicGen',
  },
];

function TextEditor({
  controller,
}: {
  controller: TextAnnotationNodeController;
}) {
  return (
    <textarea
      ref={controller.editTextareaRef}
      value={controller.content}
      onChange={(event) => controller.changeContent(event.target.value)}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          controller.cancelEditing();
        }
      }}
      onBlur={controller.finishEditing}
      placeholder={controller.textPlaceholder}
      className={`ui-scrollbar nodrag nowheel h-full w-full resize-none border-none bg-transparent px-4 py-4 text-sm leading-6 text-text-dark outline-none ${CANVAS_NODE_INPUT_PLACEHOLDER_CLASS}`}
    />
  );
}

function TextMarkdown({
  content,
  className,
}: {
  content: string;
  className: string;
}) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{
          h1: ({ ...props }) => (
            <h1 className="mb-1 mt-2 text-base font-semibold" {...props} />
          ),
          h2: ({ ...props }) => (
            <h2 className="mb-1 mt-2 text-sm font-semibold" {...props} />
          ),
          h3: ({ ...props }) => (
            <h3 className="mb-1 mt-1 text-sm font-semibold" {...props} />
          ),
          p: ({ ...props }) => <p className="my-1" {...props} />,
          strong: ({ ...props }) => (
            <strong className="font-semibold text-foreground" {...props} />
          ),
          em: ({ ...props }) => <em className="italic" {...props} />,
          ul: ({ ...props }) => (
            <ul className="my-1 ml-5 list-disc" {...props} />
          ),
          ol: ({ ...props }) => (
            <ol className="my-1 ml-5 list-decimal" {...props} />
          ),
          li: ({ ...props }) => <li className="my-0.5" {...props} />,
          code: ({ ...props }) => (
            <code className="rounded bg-muted px-1 py-0.5 text-xs" {...props} />
          ),
          hr: () => <hr className="my-2 border-border" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function CompactOpsPanel({
  controller,
}: {
  controller: TextAnnotationNodeController;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={`nodrag absolute left-1/2 z-[300] flex -translate-x-1/2 flex-col rounded-[var(--node-radius)] border ${CANVAS_NODE_INPUT_SURFACE_CLASS} ${CANVAS_NODE_INPUT_FRAME_CLASS}`}
      style={{
        top: `calc(100% + ${OPS_PANEL_GAP}px)`,
        height: OPS_PANEL_HEIGHT,
        width: Math.max(controller.size.width, OPS_PANEL_MIN_WIDTH),
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {controller.upstreamImageDisplayUrl ? (
        <div className="flex shrink-0 items-center px-3 pt-3">
          <div className="group relative h-9 w-9 overflow-hidden rounded-md border border-border">
            <img
              src={controller.upstreamImageDisplayUrl}
              alt=""
              className="h-full w-full object-cover"
              draggable={false}
            />
            <button
              type="button"
              title="取消引用此素材"
              className="nodrag absolute right-0 top-0 z-10 hidden h-4 w-4 items-center justify-center rounded-bl-md bg-media/75 text-media-foreground transition-colors hover:bg-destructive group-hover:flex"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                controller.detachUpstreamImage();
              }}
            >
              <X className="h-3 w-3" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      ) : null}
      <textarea
        value={controller.compactInputValue}
        onChange={(event) => controller.changeCompactInput(event.target.value)}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        placeholder={controller.compactInputPlaceholder}
        className={`ui-scrollbar nodrag nowheel min-h-0 w-full flex-1 resize-none border-none bg-transparent px-3 pt-3 text-sm leading-6 text-text-dark outline-none ${CANVAS_NODE_INPUT_PLACEHOLDER_CLASS}`}
      />
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
        {controller.mode === 'textToVideo' ||
        controller.mode === 'imageToPrompt' ? (
          <span />
        ) : (
          <ProviderModelPicker
            projectId={controller.projectId}
            selectedModelId={controller.modelId}
            onChange={controller.changeModel}
            popoverPlacement="top"
          />
        )}
        <div className="flex items-center gap-1.5">
          {controller.mode === 'imageToPrompt' ? (
            <CreditCostInline display={controller.reversePromptCostDisplay} />
          ) : null}
          <button
            type="button"
            disabled={controller.submitDisabled}
            title={t('node.textNode.submit')}
            onClick={(event) => {
              event.stopPropagation();
              controller.submit();
            }}
            className={`${NODE_GENERATE_BUTTON_BASE_CLASS} ${
              controller.submitDisabled
                ? NODE_GENERATE_BUTTON_DISABLED_CLASS
                : NODE_GENERATE_BUTTON_ENABLED_CLASS
            }`}
          >
            {controller.isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function WritingOpsPanel({
  controller,
}: {
  controller: TextAnnotationNodeController;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={`nodrag absolute left-1/2 z-[300] flex -translate-x-1/2 flex-col rounded-[var(--node-radius)] border ${CANVAS_NODE_INPUT_SURFACE_CLASS} ${CANVAS_NODE_INPUT_FRAME_CLASS}`}
      style={{
        top: `calc(100% + ${OPS_PANEL_GAP}px)`,
        height: OPS_PANEL_HEIGHT,
        width: Math.max(controller.size.width, OPS_PANEL_MIN_WIDTH),
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <textarea
        value={controller.content}
        onChange={(event) => controller.changeContent(event.target.value)}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        placeholder={controller.textPlaceholder}
        className={`ui-scrollbar nodrag nowheel min-h-0 w-full flex-1 resize-none border-none bg-transparent px-3 pt-3 text-sm leading-6 text-text-dark outline-none ${CANVAS_NODE_INPUT_PLACEHOLDER_CLASS}`}
        disabled={controller.isGenerating}
      />
      <div className="flex shrink-0 items-center justify-end gap-1 px-3 py-2">
        <button
          type="button"
          title={t('node.textNode.translate')}
          onClick={(event) => {
            event.stopPropagation();
            void controller.translate();
          }}
          disabled={controller.translateDisabled}
          className={`${NODE_INLINE_ICON_BUTTON_CLASS} ${
            controller.isTranslating
              ? NODE_INLINE_ICON_BUTTON_ACTIVE_CLASS
              : ''
          }`}
        >
          {controller.isTranslating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Languages className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}

function ModePicker({
  controller,
}: {
  controller: TextAnnotationNodeController;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex min-h-0 flex-1 flex-col justify-center gap-2 py-4"
      style={{ marginInline: PICKER_INSET }}
    >
      <div className="text-xs text-[var(--canvas-node-input-helper)]">
        {t('node.textNode.tryHint')}
      </div>
      <div className="flex flex-col gap-0.5">
        {MODE_OPTIONS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                controller.selectMode(item.key);
              }}
              className="-mx-2 inline-flex items-center gap-3 rounded-lg px-2 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <Icon className="h-4 w-4 text-text-muted/90" />
              <span>{t(item.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TextAnnotationNodeView({
  controller,
}: {
  controller: TextAnnotationNodeController;
}) {
  const inputBodyToneClass = `${CANVAS_NODE_INPUT_SURFACE_CLASS} ${
    controller.selected
      ? CANVAS_NODE_INPUT_BODY_SELECTED_FRAME_CLASS
      : CANVAS_NODE_INPUT_BODY_FRAME_CLASS
  }`;

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
        icon={<FileText className="h-4 w-4" />}
        titleText={controller.title}
        editable={!controller.isSystemManaged}
        onTitleChange={controller.rename}
      />
      <NodeResizeHandle
        minWidth={controller.size.minWidth}
        minHeight={controller.size.minHeight}
        maxWidth={controller.size.maxWidth}
        maxHeight={controller.size.maxHeight}
      />

      {controller.showWritingOpsPanel ? (
        <WritingOpsPanel controller={controller} />
      ) : null}

      {controller.isCompactView ? (
        <>
          <div
            className={`flex h-full w-full flex-col items-center justify-center rounded-[var(--node-radius)] border transition-colors ${inputBodyToneClass}`}
            onDoubleClick={(event) => {
              if (
                controller.isEditingContent ||
                controller.isSystemManaged
              ) {
                return;
              }
              event.stopPropagation();
              controller.enterEditMode();
            }}
          >
            {controller.isEditingContent ? (
              <TextEditor controller={controller} />
            ) : controller.hasUserContent ? (
              <TextMarkdown
                content={controller.content}
                className="ui-scrollbar nowheel max-h-full w-full overflow-y-auto px-4 py-4 text-sm leading-6 text-text-dark"
              />
            ) : (
              <AlignJustify className="h-12 w-12 stroke-[1.5] text-text-muted" />
            )}
            {controller.isGenerating ? (
              <NodeGenerationOverlay
                startedAt={controller.data.generationStartedAt}
                durationMs={controller.reversePromptDurationMs}
                hasBackground={controller.hasUserContent}
              />
            ) : null}
          </div>
          {controller.showCompactOpsPanel ? (
            <CompactOpsPanel controller={controller} />
          ) : null}
        </>
      ) : (
        <div
          className={`flex h-full w-full flex-col rounded-[var(--node-radius)] border transition-colors ${inputBodyToneClass}`}
          onDoubleClick={(event) => {
            if (
              controller.isEditingContent ||
              controller.isSystemManaged
            ) {
              return;
            }
            event.stopPropagation();
            controller.enterEditMode();
          }}
        >
          {controller.isEditingContent ? (
            <TextEditor controller={controller} />
          ) : controller.hasUserContent ? (
            <TextMarkdown
              content={controller.content}
              className="ui-scrollbar nowheel max-h-full w-full flex-1 overflow-y-auto px-4 py-4 text-sm leading-6 text-text-dark"
            />
          ) : controller.isSystemManaged ? (
            <div className="flex min-h-0 flex-1 items-center justify-center py-4">
              <AlignJustify className="h-12 w-12 stroke-[1.5] text-text-muted" />
            </div>
          ) : controller.pickerDismissed ? (
            <div
              className={`flex min-h-0 flex-1 cursor-text items-start px-4 py-4 text-sm leading-6 ${CANVAS_NODE_INPUT_PLACEHOLDER_CLASS}`}
              onClick={(event) => {
                event.stopPropagation();
                controller.enterEditMode();
              }}
            >
              {controller.textPlaceholder}
            </div>
          ) : (
            <ModePicker controller={controller} />
          )}
        </div>
      )}
    </div>
  );
}
