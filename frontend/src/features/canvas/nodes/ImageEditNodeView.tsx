// Copyright (c) 2026 AI anime
import { Handle, Position } from '@xyflow/react';
import { ImageIcon, Maximize2, Sparkles, UploadCloud } from 'lucide-react';

import {
  IMAGE_EDIT_NODE_SIZE_LIMITS,
  projectImageEditPromptSegments,
} from '@/features/canvas/application/imageEditNodeModel';
import type { ImageEditNodeController } from '@/features/canvas/hooks/useImageEditNodeController';
import { AssetLibraryModal } from '@/features/canvas/ui/AssetLibraryModal';
import { CanvasNodeImage } from '@/features/canvas/ui/CanvasNodeImage';
import { ModelParamsControls } from '@/features/canvas/ui/ModelParamsControls';
import { NodeHeader, NODE_HEADER_FLOATING_POSITION_CLASS } from '@/features/canvas/ui/NodeHeader';
import { NodePriceBadge } from '@/features/canvas/ui/NodePriceBadge';
import { NodeResizeHandle } from '@/features/canvas/ui/NodeResizeHandle';
import {
  NODE_CONTROL_CHIP_CLASS,
  NODE_CONTROL_ICON_CLASS,
  NODE_CONTROL_MODEL_CHIP_CLASS,
  NODE_CONTROL_PARAMS_CHIP_CLASS,
  NODE_CONTROL_PRIMARY_BUTTON_CLASS,
} from '@/features/canvas/ui/nodeControlStyles';
import {
  CANVAS_NODE_INPUT_FRAME_CLASS,
  CANVAS_NODE_INPUT_PLACEHOLDER_CLASS,
  CANVAS_NODE_INPUT_SURFACE_CLASS,
  CANVAS_NODE_PANEL_SURFACE_CLASS,
  canvasNodeFrameClass,
} from '@/features/canvas/ui/nodeFrameStyles';
import { ReferenceDetachButton } from '@/features/canvas/nodes/shared/ReferenceDetachButton';
import { ReferenceTextChip } from '@/features/canvas/nodes/shared/ReferenceTextChip';
import {
  stringifyParamValue,
  type CapabilityParamDefinition,
} from '@/features/freezone/public';
import { UiButton } from '@/components/ui';

function PromptWithHighlights({
  prompt,
  maxImageCount,
}: {
  prompt: string;
  maxImageCount: number;
}) {
  return projectImageEditPromptSegments(prompt, maxImageCount).map(
    (segment) =>
      segment.kind === 'reference' ? (
        <span
          key={`ref-${segment.start}`}
          className="relative z-0 text-accent-foreground before:absolute before:-inset-x-[4px] before:-inset-y-[1px] before:-z-10 before:rounded-[7px] before:bg-accent before:content-['']"
        >
          {segment.text}
        </span>
      ) : (
        <span key={`plain-${segment.start}`}>{segment.text}</span>
      ),
  );
}

export function ImageEditNodeView({
  controller,
}: {
  controller: ImageEditNodeController;
}) {
  const {
    data,
    selected,
    title,
    size,
    rootRef,
    promptRef,
    promptHighlightRef,
    promptDraft,
    incomingImages,
    upstreamTextContents,
    incomingImageItems,
    incomingImageViewerList,
    detachUpstream,
    generationMode,
    generationModeChoices,
    capability,
    structuredCapabilities,
    imageModels,
    selectedModel,
    resolutionOptions,
    selectedResolution,
    aspectRatioOptions,
    selectedAspectRatio,
    resolvedPriceDisplay,
    resolvedPriceTooltip,
    showWebSearchToggle,
    webSearchEnabled,
    showImagePicker,
    pickerActiveIndex,
    pickerAnchor,
    isAssetLibraryOpen,
    assetLibraryProject,
    error,
    copy,
  } = controller;

  return (
    <div
      ref={rootRef}
      className={`
        group relative flex h-full flex-col overflow-visible rounded-[var(--node-radius)] border ${CANVAS_NODE_PANEL_SURFACE_CLASS} p-2 transition-colors duration-150
        ${canvasNodeFrameClass({ selected })}
      `}
      style={{ width: `${size.width}px`, height: `${size.height}px` }}
      onClick={controller.select}
    >
      <NodeHeader
        className={NODE_HEADER_FLOATING_POSITION_CLASS}
        icon={<Sparkles className="h-4 w-4" />}
        titleText={title}
        rightSlot={
          resolvedPriceDisplay ? (
            <NodePriceBadge
              label={resolvedPriceDisplay.label}
              title={resolvedPriceTooltip}
            />
          ) : undefined
        }
        editable
        onTitleChange={controller.rename}
      />

      <div
        className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border ${CANVAS_NODE_INPUT_SURFACE_CLASS} ${CANVAS_NODE_INPUT_FRAME_CLASS}`}
      >
        <div className="relative min-h-[190px] flex-[1.25] border-b border-border bg-muted">
          <div className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-media/65 px-2 py-1 text-[11px] text-media-foreground/80">
            <ImageIcon className="h-3.5 w-3.5" />
            图片节点 {incomingImageItems.length > 0 ? incomingImageItems.length : ''}
          </div>
          {incomingImageItems.length > 0 ? (
            <div
              className={`grid h-full gap-2 p-3 ${incomingImageItems.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}
            >
              {incomingImageItems.slice(0, 4).map((item, index) => (
                <div
                  key={`${item.imageUrl}-${index}`}
                  className="group relative min-h-0 overflow-hidden rounded-xl border border-border bg-media"
                >
                  <CanvasNodeImage
                    src={item.displayUrl}
                    alt={item.label}
                    viewerSourceUrl={item.viewerUrl}
                    viewerImageList={incomingImageViewerList}
                    className="h-full w-full object-contain"
                    draggable={false}
                  />
                  <div className="absolute left-2 top-2 rounded-full border border-media-foreground/15 bg-media/65 px-2 py-0.5 text-[10px] text-media-foreground/85">
                    {item.label}
                  </div>
                  {item.sourceNodeId && (
                    <ReferenceDetachButton
                      nodeId={item.sourceNodeId}
                      onDetach={detachUpstream}
                      className="nodrag absolute right-1.5 top-1.5 z-10 hidden h-5 w-5 items-center justify-center rounded-full bg-media/65 text-media-foreground transition-colors hover:bg-destructive group-hover:flex"
                    />
                  )}
                </div>
              ))}
              {incomingImageItems.length > 4 && (
                <div className="absolute bottom-3 left-3 rounded-full border border-media-foreground/15 bg-media/65 px-2 py-0.5 text-[11px] text-media-foreground/85">
                  +{incomingImageItems.length - 4} 张引用图
                </div>
              )}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
              <ImageIcon className="h-12 w-12 opacity-45" />
              <button
                type="button"
                className="nodrag inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm text-foreground transition hover:border-foreground/25 hover:bg-accent"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  controller.focusPrompt();
                }}
                title="从素材库拖入图片，或从图片节点点击 AI 改图自动连接"
              >
                <UploadCloud className="h-4 w-4" />
                连接参考图
              </button>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-[var(--canvas-node-input-helper)]">试试：</span>
                <button
                  type="button"
                  className="nodrag rounded-full bg-card px-2 py-1 text-foreground transition hover:bg-accent"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    controller.applyPromptSuggestion(
                      '基于参考图生成一个更稳定、更精细的版本，保持主体身份和构图。',
                    );
                  }}
                >
                  图生图
                </button>
                <button
                  type="button"
                  className="nodrag rounded-full bg-card px-2 py-1 text-foreground transition hover:bg-accent"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    controller.applyPromptSuggestion(
                      '对参考图做高清修复，提升细节、边缘和质感，保持原图内容不变。',
                    );
                  }}
                >
                  图片高清
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            className="nodrag absolute bottom-3 right-3 rounded-full border border-border bg-card p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              controller.focusPrompt();
            }}
            title="聚焦 prompt"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>

        <div className="relative flex min-h-[180px] flex-1 flex-col p-3">
          <div className="mb-2 flex flex-wrap gap-2">
            {generationModeChoices.map((item) => {
              const active = generationMode === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  disabled={item.disabled}
                  className={`nodrag rounded-lg border px-3 py-1.5 text-xs transition ${
                    active
                      ? 'border-primary/55 bg-primary/20 text-primary'
                      : item.disabled
                        ? 'cursor-not-allowed border-border bg-muted/50 text-muted-foreground/45'
                        : 'border-border bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    controller.selectGenerationMode(item.key);
                  }}
                >
                  {item.label}
                </button>
              );
            })}
            <span className="mx-1 h-7 w-px bg-border" />
            {structuredCapabilities.map((item) => {
              const active = data.capabilityId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`nodrag rounded-lg border px-3 py-1.5 text-xs transition ${
                    active
                      ? 'border-primary/55 bg-primary/20 text-primary'
                      : 'border-border bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    controller.selectCapability(item);
                  }}
                >
                  {item.shortName}⚙
                </button>
              );
            })}
          </div>

          {capability && capability.params.length > 0 && (
            <div className="mb-2 rounded-xl border border-border bg-muted p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-foreground">
                    {capability.name}
                  </div>
                  <div className="truncate text-[10px] text-text-muted">
                    候选图能力 · Commit 后才成为资产
                  </div>
                </div>
                <button
                  type="button"
                  className="nodrag rounded-lg border border-border px-2 py-1 text-[10px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    controller.clearCapability();
                  }}
                >
                  自由提示词
                </button>
              </div>
              <div
                className="ui-scrollbar nowheel grid max-h-56 grid-cols-2 gap-2 overflow-y-auto pr-1"
                onWheel={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
              >
                {capability.params.map((param) => (
                  <InlineCapabilityParamControl
                    key={param.key}
                    param={param}
                    value={(data.capabilityParams ?? {})[param.key]}
                    onChange={(value) =>
                      controller.updateCapabilityParam(param.key, value)
                    }
                  />
                ))}
              </div>
            </div>
          )}

          <div className="mb-2 flex min-h-10 items-center gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              className="nodrag shrink-0 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                controller.focusPrompt();
              }}
            >
              标记
            </button>
            <button
              type="button"
              className="nodrag shrink-0 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                controller.applyPromptSuggestion(
                  `${promptDraft}${promptDraft ? '\n' : ''}镜头运动：轻微推进，保持主体稳定，电影级质感。`,
                );
              }}
            >
              运镜
            </button>
            <button
              type="button"
              className="nodrag shrink-0 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                controller.openAssetLibrary();
              }}
              title="从资产库选择参考图（人物 / 场景 / 道具）"
            >
              资产库
            </button>
            {upstreamTextContents.map((content) => (
              <ReferenceTextChip
                key={`upstream-text-${content.nodeId}`}
                nodeId={content.nodeId}
                text={content.text ?? ''}
                sourceLabel={content.displayName ?? content.nodeType}
                onDetach={detachUpstream}
                triggerClassName="nodrag flex h-10 w-10 items-center justify-center rounded-lg bg-muted transition-colors hover:bg-accent"
              />
            ))}
            {incomingImageItems.slice(0, 5).map((item, index) => (
              <button
                key={`ref-chip-${item.imageUrl}-${index}`}
                type="button"
                className="group nodrag relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-border bg-muted"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  controller.insertImageReference(index);
                }}
                title={`插入 ${item.label}`}
              >
                <CanvasNodeImage
                  src={item.displayUrl}
                  alt={item.label}
                  viewerSourceUrl={item.viewerUrl}
                  viewerImageList={incomingImageViewerList}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
                <span className="absolute right-0.5 top-0.5 rounded bg-media/65 px-1 text-[9px] text-media-foreground/85 group-hover:opacity-0">
                  {index + 1}
                </span>
                {item.sourceNodeId && (
                  <ReferenceDetachButton
                    nodeId={item.sourceNodeId}
                    onDetach={detachUpstream}
                  />
                )}
              </button>
            ))}
          </div>
          <div className="relative min-h-[96px] flex-1">
            <div
              ref={promptHighlightRef}
              aria-hidden="true"
              className="ui-scrollbar pointer-events-none absolute inset-0 overflow-y-auto overflow-x-hidden text-sm leading-6 text-text-dark"
              style={{ scrollbarGutter: 'stable' }}
            >
              <div className="min-h-full whitespace-pre-wrap break-words px-1 py-0.5">
                <PromptWithHighlights
                  prompt={promptDraft}
                  maxImageCount={incomingImages.length}
                />
              </div>
            </div>

            <textarea
              ref={promptRef}
              value={promptDraft}
              onChange={(event) => controller.changePrompt(event.target.value)}
              onKeyDown={controller.handlePromptKeyDown}
              onDoubleClick={controller.handlePromptDoubleClick}
              onScroll={controller.syncPromptHighlightScroll}
              onMouseDown={(event) => event.stopPropagation()}
              placeholder={copy.promptPlaceholder}
              className={`ui-scrollbar nodrag nowheel relative z-10 h-full w-full resize-none overflow-y-auto overflow-x-hidden border-none bg-transparent px-1 py-0.5 text-sm leading-6 text-transparent caret-text-dark outline-none focus:border-transparent whitespace-pre-wrap break-words ${CANVAS_NODE_INPUT_PLACEHOLDER_CLASS}`}
              style={{ scrollbarGutter: 'stable' }}
            />
          </div>
        </div>

        {showImagePicker && incomingImageItems.length > 0 && (
          <div
            className="nowheel absolute z-30 w-[120px] overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
            style={{ left: pickerAnchor.left, top: pickerAnchor.top }}
            onMouseDown={(event) => event.stopPropagation()}
            onWheelCapture={(event) => event.stopPropagation()}
          >
            <div
              className="ui-scrollbar nowheel max-h-[180px] overflow-y-auto"
              onWheelCapture={(event) => event.stopPropagation()}
            >
              {incomingImageItems.map((item, index) => (
                <button
                  key={`${item.imageUrl}-${index}`}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    controller.insertImageReference(index);
                  }}
                  onMouseEnter={() => controller.activatePickerItem(index)}
                  className={`flex w-full items-center gap-2 border border-transparent bg-popover px-2 py-2 text-left text-sm text-popover-foreground transition-colors hover:border-foreground/25 hover:bg-muted ${
                    pickerActiveIndex === index
                      ? 'border-primary/45 bg-muted'
                      : ''
                  }`}
                >
                  <CanvasNodeImage
                    src={item.displayUrl}
                    alt={item.label}
                    viewerSourceUrl={item.viewerUrl}
                    viewerImageList={incomingImageViewerList}
                    className="h-8 w-8 rounded object-cover"
                    draggable={false}
                  />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 flex shrink-0 items-center gap-1">
        <ModelParamsControls
          imageModels={imageModels}
          selectedModel={selectedModel}
          resolutionOptions={resolutionOptions}
          selectedResolution={selectedResolution}
          selectedAspectRatio={selectedAspectRatio}
          aspectRatioOptions={aspectRatioOptions}
          onModelChange={controller.changeModel}
          onResolutionChange={controller.changeResolution}
          onAspectRatioChange={controller.changeAspectRatio}
          extraParams={data.extraParams}
          onExtraParamChange={controller.changeExtraParam}
          showWebSearchToggle={showWebSearchToggle}
          webSearchEnabled={webSearchEnabled}
          onWebSearchToggle={controller.toggleWebSearch}
          triggerSize="sm"
          chipClassName={NODE_CONTROL_CHIP_CLASS}
          modelChipClassName={NODE_CONTROL_MODEL_CHIP_CLASS}
          paramsChipClassName={NODE_CONTROL_PARAMS_CHIP_CLASS}
        />

        <div className="ml-auto" />

        <UiButton
          onClick={(event) => {
            event.stopPropagation();
            void controller.generate();
          }}
          variant="primary"
          className={`shrink-0 ${NODE_CONTROL_PRIMARY_BUTTON_CLASS}`}
        >
          <Sparkles className={NODE_CONTROL_ICON_CLASS} strokeWidth={2.8} />
          {copy.generate}
        </UiButton>
      </div>

      {error && (
        <div className="mt-1 shrink-0 break-words text-xs text-destructive [overflow-wrap:anywhere]">
          {error}
        </div>
      )}

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
        minWidth={IMAGE_EDIT_NODE_SIZE_LIMITS.minWidth}
        minHeight={IMAGE_EDIT_NODE_SIZE_LIMITS.minHeight}
        maxWidth={IMAGE_EDIT_NODE_SIZE_LIMITS.maxWidth}
        maxHeight={IMAGE_EDIT_NODE_SIZE_LIMITS.maxHeight}
        keepAspectRatio
      />
      <AssetLibraryModal
        open={isAssetLibraryOpen}
        project={assetLibraryProject}
        allowedMedia={['image']}
        onClose={controller.closeAssetLibrary}
        onConfirm={controller.confirmAssetLibrarySelections}
      />
    </div>
  );
}

function InlineCapabilityParamControl({
  param,
  value,
  onChange,
}: {
  param: CapabilityParamDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  if (param.type === 'enum') {
    return (
      <label className="nodrag block min-w-0 text-[10px] text-text-muted">
        <span className="mb-1 block truncate">{param.label}</span>
        <select
          value={stringifyParamValue(value ?? param.defaultValue)}
          onChange={(event) => onChange(event.target.value)}
          onMouseDown={(event) => event.stopPropagation()}
          className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none"
        >
          {(param.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (param.type === 'multiselect') {
    const selected = new Set(Array.isArray(value) ? value.map(String) : []);
    return (
      <div className="nodrag col-span-2 text-[10px] text-text-muted">
        <div className="mb-1">{param.label}</div>
        <div className="flex flex-wrap gap-1">
          {(param.options ?? []).map((option) => {
            const active = selected.has(option.value);
            return (
              <button
                key={option.value}
                type="button"
                className={`rounded-full border px-2 py-1 text-[10px] transition ${
                  active
                    ? 'border-primary/50 bg-primary/15 text-primary'
                    : 'border-border bg-muted text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  const next = new Set(selected);
                  if (active) next.delete(option.value);
                  else next.add(option.value);
                  onChange([...next]);
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (param.type === 'boolean') {
    return (
      <label className="nodrag flex items-center gap-2 text-xs text-text-muted">
        <input
          type="checkbox"
          checked={Boolean(value ?? param.defaultValue)}
          onChange={(event) => onChange(event.target.checked)}
          onMouseDown={(event) => event.stopPropagation()}
          className="accent-primary"
        />
        <span>{param.label}</span>
      </label>
    );
  }

  if (param.type === 'slider') {
    const numericValue =
      typeof value === 'number'
        ? value
        : typeof param.defaultValue === 'number'
          ? param.defaultValue
          : 0;
    return (
      <label className="nodrag col-span-2 block text-[10px] text-text-muted">
        <span className="mb-1 flex justify-between">
          <span>{param.label}</span>
          <span>{numericValue}</span>
        </span>
        <input
          type="range"
          min={param.min ?? 0}
          max={param.max ?? 100}
          step={param.step ?? 1}
          value={numericValue}
          onChange={(event) => onChange(Number(event.target.value))}
          onMouseDown={(event) => event.stopPropagation()}
          className="w-full accent-primary"
        />
      </label>
    );
  }

  return (
    <label className="nodrag col-span-2 block text-[10px] text-text-muted">
      <span className="mb-1 block">{param.label}</span>
      <textarea
        value={stringifyParamValue(value ?? param.defaultValue)}
        onChange={(event) => onChange(event.target.value)}
        onMouseDown={(event) => event.stopPropagation()}
        className="ui-scrollbar min-h-12 w-full resize-y rounded-lg border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none"
        placeholder={param.description}
      />
    </label>
  );
}
