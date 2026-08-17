// Copyright (c) 2026 AI anime
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { NodeToolbar as ReactFlowNodeToolbar, Position } from '@xyflow/react';
import { ArrowUp, Check, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CANVAS_NODE_OPS_PANEL_CLASS } from './canvasNodeFrameStyles';
import {
  NODE_GENERATE_BUTTON_BASE_CLASS,
  NODE_GENERATE_BUTTON_DISABLED_CLASS,
  NODE_GENERATE_BUTTON_ENABLED_CLASS,
} from './canvasNodeControlStyles';
import { NODE_TOOLBAR_CLASS } from './canvasNodeToolbarConfig';
import { ZoomScaledToolbar } from './ZoomScaledToolbar';
import {
  CANVAS_VIDEO_UPSCALE_DENOISE_OPTIONS,
  CANVAS_VIDEO_UPSCALE_RESOLUTIONS,
  CANVAS_VIDEO_UPSCALE_RESOLUTION_LABEL,
  resolveCanvasVideoUpscaleDenoise,
  resolveCanvasVideoUpscaleResolution,
  type CanvasVideoUpscaleDenoise,
  type CanvasVideoUpscaleResolution,
} from '../domain/videoUpscale';
import type { CanvasNode, CanvasNodeData } from '../domain/canvasNodeData';
import { generationTaskDescriptor } from '../application/resumeGeneration';
import type { CanvasGenerationTaskRef } from '../application/completeCanvasMediaGenerationTask';
import type {
  GenerateCanvasVideoUpscaleParams,
  GenerateCanvasVideoUpscaleResult,
} from '../application/generateCanvasVideoUpscale';

export interface VideoUpscaleEditorOverlayStore {
  updateNodeData: (id: string, patch: Partial<CanvasNodeData>) => void;
  deleteNode: (nodeId: string) => void;
  setSelectedNode: (id: string | null) => void;
}

export type VideoUpscaleEditorOverlayStoreHook = <TSelected>(
  selector: (state: VideoUpscaleEditorOverlayStore) => TSelected,
) => TSelected;

export type VideoUpscaleEditorOverlayGenerateVideoUpscale = (
  params: GenerateCanvasVideoUpscaleParams,
  onTaskSubmitted: (task: CanvasGenerationTaskRef) => void,
) => Promise<GenerateCanvasVideoUpscaleResult>;

interface VideoUpscalePersistedFields {
  upscaleSourceUrl?: string;
  upscaleResolution?: CanvasVideoUpscaleResolution;
  upscaleDenoise?: CanvasVideoUpscaleDenoise;
}

interface VideoUpscaleEditorOverlayProps {
  projectId: string;
  canvasId: string;
  /**
   * The video-upscale result node. The panel is always anchored beneath it while
   * the node is selected — settings persist on `node.data` so they survive
   * re-selection.
   */
  node: CanvasNode;
}

export function createVideoUpscaleEditorOverlay({
  useStore,
  generateCanvasVideoUpscale,
}: {
  useStore: VideoUpscaleEditorOverlayStoreHook;
  generateCanvasVideoUpscale: VideoUpscaleEditorOverlayGenerateVideoUpscale;
}) {
  return memo(
    ({ projectId, canvasId, node }: VideoUpscaleEditorOverlayProps) => {
      const { t } = useTranslation();
      const updateNodeData = useStore((state) => state.updateNodeData);
      const deleteNode = useStore((state) => state.deleteNode);
      const setSelectedNode = useStore((state) => state.setSelectedNode);

      const persisted = node.data as VideoUpscalePersistedFields;
      const sourceUrl = persisted.upscaleSourceUrl ?? '';
      const resolution = resolveCanvasVideoUpscaleResolution(
        persisted.upscaleResolution,
      );
      const denoise = resolveCanvasVideoUpscaleDenoise(persisted.upscaleDenoise);

      const [isSubmitting, setIsSubmitting] = useState(false);

      const handleResolutionChange = useCallback(
        (next: CanvasVideoUpscaleResolution) => {
          updateNodeData(node.id, {
            upscaleResolution: next,
            // Keep the title's resolution badge in sync.
            displayName: `${t('node.videoUpscale.nodeTitle')}（${CANVAS_VIDEO_UPSCALE_RESOLUTION_LABEL[next]}）`,
          });
        },
        [node.id, t, updateNodeData],
      );

      const handleDenoiseChange = useCallback(
        (next: CanvasVideoUpscaleDenoise) => {
          updateNodeData(node.id, { upscaleDenoise: next });
        },
        [node.id, updateNodeData],
      );

      const handleCancel = useCallback(() => {
        deleteNode(node.id);
        setSelectedNode(null);
      }, [deleteNode, node.id, setSelectedNode]);

      const handleSubmit = useCallback(async () => {
        if (isSubmitting) return;
        if (!sourceUrl) {
          console.error('[video-upscale] missing upscaleSourceUrl on node.data — cannot submit');
          return;
        }
        setIsSubmitting(true);
        updateNodeData(node.id, {
          isGenerating: true,
          generationStartedAt: Date.now(),
          generationError: null,
        });

        try {
          const { url } = await generateCanvasVideoUpscale(
            {
              projectId,
              sourceUrl,
              resolution,
              denoiseStrength: denoise,
              canvasId,
              nodeId: node.id,
            },
            (task) => {
              updateNodeData(node.id, generationTaskDescriptor(task));
            },
          );
          updateNodeData(node.id, {
            videoUrl: url,
            isGenerating: false,
            generationStartedAt: null,
            generationError: null,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error('[video-upscale] generation failed', err);
          updateNodeData(node.id, {
            isGenerating: false,
            generationStartedAt: null,
            generationError: message,
          });
        } finally {
          setIsSubmitting(false);
        }
      }, [
        canvasId,
        denoise,
        isSubmitting,
        node.id,
        projectId,
        resolution,
        sourceUrl,
        updateNodeData,
      ]);

      return (
        <ReactFlowNodeToolbar
          nodeId={node.id}
          isVisible
          position={Position.Bottom}
          align="center"
          offset={12}
          className={NODE_TOOLBAR_CLASS}
        >
          {/* 操作区按画布缩放同步缩放，锚点取顶边（贴节点底边）——与 UpscaleEditorOverlay 一致。 */}
          <ZoomScaledToolbar origin="top center">
            <div
              className={`flex w-[520px] max-w-[calc(100vw-32px)] flex-col rounded-[var(--node-radius)] ${CANVAS_NODE_OPS_PANEL_CLASS}`}
              onClick={(event) => event.stopPropagation()}
            >
            <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-foreground/75">
                    {t('node.videoUpscale.panel.resolution')}
                  </span>
                  <div className="inline-flex items-center gap-0.5 rounded border border-border bg-muted p-0.5">
                    {CANVAS_VIDEO_UPSCALE_RESOLUTIONS.map((value) => {
                      const isActive = resolution === value;
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => handleResolutionChange(value)}
                          className={`flex h-6 min-w-12 items-center justify-center rounded text-xs font-medium transition-colors ${
                            isActive
                              ? 'bg-card text-foreground shadow-sm'
                              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                          }`}
                        >
                          {CANVAS_VIDEO_UPSCALE_RESOLUTION_LABEL[value]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <span
                  className="inline-flex h-7 items-center rounded px-1 text-xs font-medium text-foreground/75"
                  data-ui-tooltip={t('node.videoUpscale.panel.frameInterpolationLockedHint')}
                >
                  {t('node.videoUpscale.panel.frameInterpolationNone')}
                </span>

                <DenoisePicker value={denoise} onChange={handleDenoiseChange} />
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  className="h-7 rounded px-1.5 text-xs font-medium text-foreground/75 transition-colors hover:bg-muted hover:text-foreground"
                  onClick={handleCancel}
                  data-ui-tooltip={t('common.cancel')}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className={`${NODE_GENERATE_BUTTON_BASE_CLASS} ${
                    isSubmitting
                      ? NODE_GENERATE_BUTTON_DISABLED_CLASS
                      : NODE_GENERATE_BUTTON_ENABLED_CLASS
                  }`}
                  data-ui-tooltip={t('node.videoUpscale.panel.submit')}
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </div>
            </div>
          </ZoomScaledToolbar>
        </ReactFlowNodeToolbar>
      );
    },
  );
}

export type VideoUpscaleEditorOverlay = ReturnType<
  typeof createVideoUpscaleEditorOverlay
>;

interface DenoisePickerProps {
  value: CanvasVideoUpscaleDenoise;
  onChange: (value: CanvasVideoUpscaleDenoise) => void;
}

function DenoisePicker({ value, onChange }: DenoisePickerProps) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (
        triggerRef.current?.contains(event.target as Node) ||
        popoverRef.current?.contains(event.target as Node)
      ) {
        return;
      }
      setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown, true);
    return () => document.removeEventListener('mousedown', onPointerDown, true);
  }, [isOpen]);

  const denoiseLabel = (option: CanvasVideoUpscaleDenoise) =>
    option === 'none' ? t('node.videoUpscale.panel.denoiseNone') : option;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex h-7 items-center gap-1.5 rounded px-1 text-xs font-medium text-foreground/88 transition-colors hover:text-foreground"
      >
        <span>{denoiseLabel(value)}</span>
        <ChevronDown className="h-3 w-3 text-text-muted/90" />
      </button>
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute bottom-full right-0 z-50 mb-2 w-[160px] rounded-[10px] border border-border bg-popover/96 p-1 shadow-xl backdrop-blur-md"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {CANVAS_VIDEO_UPSCALE_DENOISE_OPTIONS.map((option) => {
            const isActive = value === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
                className={`flex h-8 w-full items-center justify-between rounded-md px-2.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-muted text-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                {denoiseLabel(option)}
                {isActive && <Check className="h-3 w-3" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
