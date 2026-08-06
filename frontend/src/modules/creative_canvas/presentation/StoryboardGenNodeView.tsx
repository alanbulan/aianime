// Copyright (c) 2026 AI anime
import type { ReactNode } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Minus, Plus, Sparkles } from 'lucide-react';

import { CreditSparkIcon } from '@/components/credits/credit-visual';
import { UiButton } from '@/components/ui';
import { CanvasNodeImage } from './CanvasNodeImage';
import {
  CANVAS_NODE_INPUT_PLACEHOLDER_CLASS,
  CANVAS_NODE_PANEL_SURFACE_CLASS,
  canvasNodeFrameClass,
} from './canvasNodeFrameStyles';
import { NODE_CONTROL_PRIMARY_BUTTON_CLASS } from './canvasNodeControlStyles';
import { ModelParamsControls } from './ModelParamsControls';
import { NodePriceBadge } from './NodePriceBadge';
import { NodeResizeHandle } from './NodeResizeHandle';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from './NodeHeader';
import { STORYBOARD_GEN_FRAME_GRID_GAP_PX } from '../domain/storyboardGenNodeModel';
import { findReferenceTokens } from '../domain/referenceTokenEditing';
import type { StoryboardGenNodeController } from './useStoryboardGenNodeController';

const STORYBOARD_GEN_HEADER_ADJUST = { x: 0, y: 0, scale: 1 };
const STORYBOARD_GEN_ICON_ADJUST = { x: 0, y: 0, scale: 0.95 };
const STORYBOARD_GEN_TITLE_ADJUST = { x: 0, y: 0, scale: 1 };
const GRID_CONTROL_CONTAINER_CLASS =
  'flex h-7 items-center gap-1 rounded-full border border-border bg-muted px-1.5';
const GRID_CONTROL_LABEL_CLASS =
  'text-[13px] font-medium text-foreground/82';
const GRID_CONTROL_BUTTON_CLASS =
  'flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';
const GRID_CONTROL_ICON_CLASS = 'h-2 w-2';
const GRID_CONTROL_VALUE_CLASS =
  'min-w-[18px] text-center text-[11px] font-semibold text-foreground';
const GRID_SUMMARY_CLASS =
  'mr-2 flex h-7 items-center text-[13px] font-normal text-foreground/72';
const RATIO_CONTROL_MODE_BUTTON_CLASS =
  'flex h-5 items-center rounded-full border px-1.5 text-[9px] transition-colors';
const STORYBOARD_GEN_BOTTOM_PANEL_CLASS =
  '!border-border !bg-popover/96 shadow-2xl';
const STORYBOARD_GEN_TRIGGER_CLASS =
  '!h-9 !rounded-md !border-transparent !bg-transparent !px-2.5 !text-[14px] !shadow-none text-foreground/90 hover:!bg-muted hover:!text-foreground';
const STORYBOARD_GEN_MODEL_CHIP_CLASS =
  '!w-auto !justify-start !shrink-0 !mr-1';
const STORYBOARD_GEN_PARAMS_CHIP_CLASS =
  '!w-auto !justify-start !shrink-0 !gap-2';
const STORYBOARD_GEN_GENERATE_BUTTON_CLASS =
  '!h-9 !rounded-md !border-transparent !bg-transparent !px-2.5 !text-[14px] !gap-1.5 !text-foreground/94 hover:!bg-muted hover:!text-foreground';
const STORYBOARD_GEN_ACTION_ICON_CLASS = 'h-3.5 w-3.5';
const STORYBOARD_GEN_MODEL_OPTION_CLASS =
  '!min-h-0 !min-w-0 !justify-start !rounded-none !border-transparent !bg-transparent !px-0 !py-1 !text-left !text-[14px]';
const STORYBOARD_GEN_MODEL_ACTIVE_CLASS = '!text-foreground';
const STORYBOARD_GEN_MODEL_INACTIVE_CLASS =
  '!text-muted-foreground hover:!text-foreground';
const STORYBOARD_GEN_PARAM_GROUP_CLASS =
  'rounded-[8px] border border-border bg-muted/70 p-1';
const STORYBOARD_GEN_PARAM_ACTIVE_CLASS =
  'rounded-[5px] border border-primary/35 bg-primary/12 text-foreground shadow-sm';
const STORYBOARD_GEN_PARAM_INACTIVE_CLASS =
  'rounded-[7px] text-muted-foreground hover:bg-muted hover:text-foreground';
const STORYBOARD_GEN_EXTRA_PARAMS_GROUP_CLASS = 'space-y-2';
const STORYBOARD_GEN_EXTRA_PARAM_ITEM_CLASS = 'space-y-2 p-0';
const STORYBOARD_GEN_EXTRA_PARAM_LABEL_CLASS =
  'text-[13px] font-medium leading-none text-foreground';
const STORYBOARD_GEN_EXTRA_PARAM_FIELD_CLASS =
  'h-9 rounded-[8px] !border-border bg-background text-sm hover:!border-foreground/30 focus:!border-primary/45';

function renderFrameDescriptionWithHighlights(
  description: string,
  maxImageCount: number,
): ReactNode {
  if (!description) return ' ';
  const segments: ReactNode[] = [];
  let lastIndex = 0;
  for (const token of findReferenceTokens(description, maxImageCount)) {
    if (token.start > lastIndex) {
      segments.push(
        <span key={`plain-${lastIndex}`}>
          {description.slice(lastIndex, token.start)}
        </span>,
      );
    }
    segments.push(
      <span
        key={`ref-${token.start}`}
        className="relative z-0 text-accent-foreground before:absolute before:-inset-x-[4px] before:-inset-y-[1px] before:-z-10 before:rounded-[7px] before:bg-accent before:content-['']"
      >
        {token.token}
      </span>,
    );
    lastIndex = token.end;
  }
  if (lastIndex < description.length) {
    segments.push(
      <span key={`plain-${lastIndex}`}>{description.slice(lastIndex)}</span>,
    );
  }
  return segments;
}

function GridStepperControl({
  label,
  value,
  onDecrease,
  onIncrease,
}: {
  label: string;
  value: number;
  onDecrease(): void;
  onIncrease(): void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={GRID_CONTROL_LABEL_CLASS}>{label}</span>
      <div className={GRID_CONTROL_CONTAINER_CLASS}>
        <button
          type="button"
          className={GRID_CONTROL_BUTTON_CLASS}
          onClick={(event) => {
            event.stopPropagation();
            onDecrease();
          }}
        >
          <Minus className={GRID_CONTROL_ICON_CLASS} />
        </button>
        <span className={GRID_CONTROL_VALUE_CLASS}>{value}</span>
        <button
          type="button"
          className={GRID_CONTROL_BUTTON_CLASS}
          onClick={(event) => {
            event.stopPropagation();
            onIncrease();
          }}
        >
          <Plus className={GRID_CONTROL_ICON_CLASS} />
        </button>
      </div>
    </div>
  );
}

export function StoryboardGenNodeView({
  controller,
}: {
  controller: StoryboardGenNodeController;
}) {
  const { data, layout } = controller;
  return (
    <div
      ref={controller.rootRef}
      className={`group relative flex h-full flex-col overflow-visible rounded-[var(--node-radius)] border ${CANVAS_NODE_PANEL_SURFACE_CLASS} p-3 transition-colors duration-150 ${canvasNodeFrameClass({ selected: controller.selected })}`}
      style={{
        width: `${layout.size.width}px`,
        height: `${layout.size.height}px`,
      }}
      onClick={controller.select}
    >
      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<Sparkles className="h-4 w-4" />}
        titleText={controller.title}
        headerAdjust={STORYBOARD_GEN_HEADER_ADJUST}
        iconAdjust={STORYBOARD_GEN_ICON_ADJUST}
        titleAdjust={STORYBOARD_GEN_TITLE_ADJUST}
        rightSlot={
          controller.resolvedPriceDisplay ? (
            <NodePriceBadge
              label={controller.resolvedPriceDisplay.label}
              title={controller.resolvedPriceTooltip}
            />
          ) : undefined
        }
        editable
        onTitleChange={controller.rename}
      />

      <div
        className="mx-auto mb-3 flex h-7 shrink-0 items-center justify-between gap-2"
        style={{ width: `${layout.paramsRowWidth}px` }}
      >
        <div className="flex min-w-0 items-center gap-5">
          <GridStepperControl
            label={controller.copy.rowsShort}
            value={data.gridRows}
            onDecrease={() => controller.adjustRows(-1)}
            onIncrease={() => controller.adjustRows(1)}
          />
          <GridStepperControl
            label={controller.copy.colsShort}
            value={data.gridCols}
            onDecrease={() => controller.adjustCols(-1)}
            onIncrease={() => controller.adjustCols(1)}
          />
        </div>

        <div className="flex min-w-0 items-center justify-end gap-1.5">
          {controller.showAdvancedRatioControls ? (
            <div className="flex h-7 items-center rounded-full border border-border bg-muted p-0.5">
              <button
                type="button"
                className={`${RATIO_CONTROL_MODE_BUTTON_CLASS} ${
                  controller.ratioControlMode === 'overall'
                    ? 'border-primary/45 bg-card text-foreground shadow-sm'
                    : 'border-transparent bg-transparent text-muted-foreground hover:bg-accent'
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  controller.setRatioControlMode('overall');
                }}
              >
                {controller.copy.ratioModeOverall}
              </button>
              <button
                type="button"
                className={`${RATIO_CONTROL_MODE_BUTTON_CLASS} ${
                  controller.ratioControlMode === 'cell'
                    ? 'border-primary/45 bg-card text-foreground shadow-sm'
                    : 'border-transparent bg-transparent text-muted-foreground hover:bg-accent'
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  controller.setRatioControlMode('cell');
                }}
              >
                {controller.copy.ratioModeCell}
              </button>
            </div>
          ) : null}
          <div className={GRID_SUMMARY_CLASS}>{controller.copy.frameCount}</div>
        </div>
      </div>

      {controller.showAdvancedRatioControls ? (
        <div
          className="mx-auto mb-2 flex shrink-0 items-center justify-center rounded-full border border-border bg-muted px-2 py-1 text-[10px] leading-none text-muted-foreground"
          style={{ width: `${layout.paramsRowWidth}px` }}
        >
          <span>
            {controller.copy.cellAspectRatio}:{' '}
            {controller.resolvedAspectRatios.cellAspectRatioLabel}
          </span>
          <span className="mx-1.5 text-border">|</span>
          <span>
            {controller.copy.overallAspectRatio}:{' '}
            {controller.resolvedAspectRatios.overallAspectRatioLabel}
          </span>
        </div>
      ) : null}

      <div className="mb-2.5 flex min-h-0 flex-1 items-center justify-center">
        <div
          className="grid"
          style={{
            width: `${layout.gridWidth}px`,
            gridTemplateColumns: `repeat(${data.gridCols}, ${layout.cellWidth}px)`,
            gap: `${STORYBOARD_GEN_FRAME_GRID_GAP_PX}px`,
          }}
        >
          {data.frames.map((frame, index) => {
            const description =
              controller.frameDescriptionDrafts[frame.id] ?? frame.description;
            return (
              <div
                key={frame.id}
                className="relative overflow-hidden rounded-[8px] border border-border bg-background transition-colors focus-within:border-primary/45 hover:border-foreground/30"
                style={{ aspectRatio: layout.cellAspectRatioCss }}
              >
                <div
                  ref={(element) =>
                    controller.setFrameHighlightRef(frame.id, element)
                  }
                  aria-hidden="true"
                  className="ui-scrollbar pointer-events-none absolute inset-0 overflow-y-auto overflow-x-hidden text-[11px] leading-4 text-foreground"
                  style={{ scrollbarGutter: 'stable' }}
                >
                  <div className="min-h-full whitespace-pre-wrap break-words px-2 py-2 text-left">
                    {renderFrameDescriptionWithHighlights(
                      description,
                      controller.incomingImages.length,
                    )}
                  </div>
                </div>
                <textarea
                  ref={(element) =>
                    controller.setFrameTextareaRef(frame.id, element)
                  }
                  value={description}
                  onChange={(event) =>
                    controller.changeFrameDescription(index, event.target.value)
                  }
                  onKeyDown={(event) =>
                    controller.handleFrameKeyDown(index, event)
                  }
                  onScroll={() =>
                    controller.syncFrameHighlightScroll(frame.id)
                  }
                  onPointerDown={(event) =>
                    controller.captureFramePointer(
                      index,
                      event.clientX,
                      event.clientY,
                    )
                  }
                  onFocus={(event) =>
                    controller.focusFrame(frame.id, event.currentTarget)
                  }
                  placeholder={controller.copy.framePlaceholders[index]}
                  wrap="soft"
                  className={`ui-scrollbar nodrag nowheel relative z-10 h-full w-full resize-none overflow-y-auto overflow-x-hidden bg-transparent px-2 py-2 text-left text-[11px] leading-4 text-transparent caret-text-dark focus:border-primary/50 focus:outline-none whitespace-pre-wrap break-words ${CANVAS_NODE_INPUT_PLACEHOLDER_CLASS}`}
                  style={{ scrollbarGutter: 'stable' }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {controller.showImagePicker &&
      controller.incomingImageItems.length > 0 ? (
        <div
          className="nowheel absolute z-30 w-[120px] overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
          style={{
            left: controller.pickerAnchor.left,
            top: controller.pickerAnchor.top,
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onWheelCapture={(event) => event.stopPropagation()}
        >
          <div
            className="ui-scrollbar nowheel max-h-[180px] overflow-y-auto"
            onWheelCapture={(event) => event.stopPropagation()}
          >
            {controller.incomingImageItems.map((item, imageIndex) => (
              <button
                key={`${item.imageUrl}-${imageIndex}`}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  controller.insertImageReference(imageIndex);
                }}
                onMouseEnter={() => controller.activatePickerItem(imageIndex)}
                className={`flex w-full items-center gap-2 border border-transparent bg-popover px-2 py-2 text-left text-sm text-popover-foreground transition-colors hover:border-foreground/25 hover:bg-muted ${
                  controller.pickerActiveIndex === imageIndex
                    ? 'border-primary/45 bg-muted'
                    : ''
                }`}
              >
                <CanvasNodeImage
                  src={item.displayUrl}
                  alt={item.label}
                  viewerSourceUrl={item.viewerUrl}
                  viewerImageList={controller.incomingImageViewerList}
                  className="h-8 w-8 rounded object-cover"
                />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {controller.error ? (
        <div className="mb-1.5 shrink-0 break-words text-[10px] text-destructive [overflow-wrap:anywhere]">
          {controller.error}
        </div>
      ) : null}

      <div
        className="relative mx-auto mt-auto flex h-[38px] shrink-0 items-center justify-between gap-2"
        style={{ width: `${layout.paramsRowWidth}px` }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <ModelParamsControls
            imageModels={controller.imageModels}
            selectedModel={controller.selectedModel}
            resolutionOptions={controller.resolutionOptions}
            selectedResolution={controller.selectedResolution}
            selectedAspectRatio={controller.selectedAspectRatio}
            aspectRatioOptions={controller.aspectRatioOptions}
            onModelChange={controller.changeModel}
            onResolutionChange={controller.changeResolution}
            onAspectRatioChange={controller.changeAspectRatio}
            extraParams={data.extraParams}
            onExtraParamChange={controller.changeExtraParam}
            showWebSearchToggle={controller.showWebSearchToggle}
            webSearchEnabled={controller.webSearchEnabled}
            onWebSearchToggle={controller.toggleWebSearch}
            triggerSize="md"
            chipClassName={STORYBOARD_GEN_TRIGGER_CLASS}
            modelChipClassName={STORYBOARD_GEN_MODEL_CHIP_CLASS}
            paramsChipClassName={STORYBOARD_GEN_PARAMS_CHIP_CLASS}
            modelPanelAlign="start"
            paramsPanelAlign="start"
            modelPanelClassName={`inline-block w-[430px] max-w-[calc(100vw-32px)] p-3 ${STORYBOARD_GEN_BOTTOM_PANEL_CLASS}`}
            paramsPanelClassName={`w-[430px] max-w-[calc(100vw-32px)] p-3 ${STORYBOARD_GEN_BOTTOM_PANEL_CLASS}`}
            modelOptionClassName={STORYBOARD_GEN_MODEL_OPTION_CLASS}
            activeModelOptionClassName={STORYBOARD_GEN_MODEL_ACTIVE_CLASS}
            inactiveModelOptionClassName={STORYBOARD_GEN_MODEL_INACTIVE_CLASS}
            optionGroupClassName={STORYBOARD_GEN_PARAM_GROUP_CLASS}
            activeParamOptionClassName={STORYBOARD_GEN_PARAM_ACTIVE_CLASS}
            inactiveParamOptionClassName={STORYBOARD_GEN_PARAM_INACTIVE_CLASS}
            extraParamsGroupClassName={STORYBOARD_GEN_EXTRA_PARAMS_GROUP_CLASS}
            extraParamItemClassName={STORYBOARD_GEN_EXTRA_PARAM_ITEM_CLASS}
            extraParamLabelClassName={STORYBOARD_GEN_EXTRA_PARAM_LABEL_CLASS}
            extraParamFieldClassName={STORYBOARD_GEN_EXTRA_PARAM_FIELD_CLASS}
            showExtraParamsHeading={false}
            showExtraParamDescription={false}
            panelRenderMode="inline"
            inlinePanelClassName="absolute bottom-full left-0 z-[80] mb-2"
          />
        </div>

        <UiButton
          disabled={!controller.selectedModel}
          onClick={(event) => {
            event.stopPropagation();
            void controller.generateFromModifiers({
              ctrlKey: event.ctrlKey,
              altKey: event.altKey,
              shiftKey: event.shiftKey,
            });
          }}
          variant="primary"
          size="sm"
          className={`!min-w-0 shrink-0 ${NODE_CONTROL_PRIMARY_BUTTON_CLASS} ${STORYBOARD_GEN_GENERATE_BUTTON_CLASS}`}
        >
          <CreditSparkIcon className={STORYBOARD_GEN_ACTION_ICON_CLASS} />
          {controller.copy.generate}
        </UiButton>
      </div>

      <Handle
        type="target"
        id="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-surface-dark !bg-muted-foreground"
      />
      <Handle
        type="source"
        id="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-surface-dark !bg-muted-foreground"
      />
      <NodeResizeHandle
        minWidth={layout.baseSize.width}
        minHeight={layout.baseSize.height}
        maxWidth={1800}
        maxHeight={1400}
      />
    </div>
  );
}
