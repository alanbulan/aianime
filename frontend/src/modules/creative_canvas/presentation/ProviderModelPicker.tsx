// Copyright (c) 2026 AI anime
import { useAnchoredOverlay } from "@/components/ui/use-anchored-overlay";
import { OverlayPortal } from "@/components/ui/overlay";
import { useEffect, useRef, useState } from 'react';
import { Box, Check, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  NODE_FLOATING_PANEL_SURFACE_CLASS,
  NODE_TEXT_CONTROL_ICON_CLASS,
  NODE_TEXT_CONTROL_TRIGGER_CLASS,
} from './canvasNodeControlStyles';
import { useCanvasImageModels, useCanvasVideoModels } from '../generationCatalogComposition';
import type { CanvasCatalogModelOption } from '../application/generationCatalog';
import type { CanvasImageMode } from '../domain/imageModelCapability';

const MODEL_PICKER_POPOVER_CLASS =
  `nodrag nowheel fixed overscroll-contain max-h-[280px] w-[260px] overflow-y-auto p-1 ${NODE_FLOATING_PANEL_SURFACE_CLASS}`;
const MODEL_PICKER_OPTION_BASE_CLASS =
  'inline-flex h-8 w-full items-center gap-2 rounded-[6px] px-3 text-left text-xs font-medium transition-colors';

export type ModelOption = CanvasCatalogModelOption;

export type ProviderModelDomain = 'image' | 'video';

interface ProviderModelPickerBaseProps {
  selectedModelId: string;
  onChange: (modelId: string) => void;
  /** Selects the authenticated commercial catalog operation. */
  domain?: ProviderModelDomain;
  imageMode?: CanvasImageMode;
  className?: string;
  popoverPlacement?: 'top' | 'bottom';
  /**
   * Returns a disabled reason for a given model option, or null when the model
   * is selectable. When non-null, that option is rendered greyed-out and not
   * clickable, with the reason shown as a hover tooltip. Used by the video node
   * to block models without reference-media support while media is attached.
   */
  getOptionDisabledReason?: (model: ModelOption) => string | null;
}

export type ProviderModelPickerProps = ProviderModelPickerBaseProps &
  (
    | { models: ModelOption[]; projectId?: never }
    | { models?: undefined; projectId: string }
  );

export function ProviderModelPicker({
  selectedModelId,
  onChange,
  models,
  projectId,
  domain = 'image',
  imageMode,
  className,
  popoverPlacement = 'top',
  getOptionDisabledReason,
}: ProviderModelPickerProps) {
  const { t } = useTranslation();
  // When the caller supplies an explicit `models` prop we don't fire any API
  // request — pass `null` to both hooks so they no-op. Otherwise the active
  // hook receives the explicit project, and the inactive one is fed `null` to stay
  // dormant. (React still calls both hooks unconditionally so the call order
  // is stable across renders.)
  const catalogProjectId = models === undefined ? projectId : null;
  const imageHook = useCanvasImageModels(
    domain === 'image' ? catalogProjectId : null,
    imageMode,
  );
  const videoHook = useCanvasVideoModels(
    domain === 'video' ? catalogProjectId : null,
  );
  const activeHook = domain === 'video' ? videoHook : imageHook;
  const apiModels = activeHook.models;
  const effectiveModels = models ?? apiModels;
  const loading = models === undefined && activeHook.isLoading;
  const loadFailed = models === undefined && Boolean(activeHook.error);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const popoverStyle = useAnchoredOverlay({ anchor: triggerRef, panel: popoverRef, open: isOpen, side: popoverPlacement, maxHeight: 280 });
  // 禁用原因使用提示层，避开列表的滚动裁切。
  const [disabledTooltip, setDisabledTooltip] = useState<{
    reason: string;
    left: number;
    top: number;
  } | null>(null);
  const selectedModel = effectiveModels.find((m) => m.id === selectedModelId) ?? effectiveModels[0];

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
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true);
    };
  }, [isOpen]);

  return (
    <div className={`relative ${className ?? ''}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={effectiveModels.length === 0}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className={`${NODE_TEXT_CONTROL_TRIGGER_CLASS} disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <Box className={NODE_TEXT_CONTROL_ICON_CLASS} />
        <span className="font-medium">
          {selectedModel?.label ??
            t(
              loading
                ? 'modelPicker.loading'
                : loadFailed
                  ? 'modelPicker.loadFailed'
                  : 'modelPicker.empty',
            )}
        </span>
        <ChevronDown className="h-3 w-3 text-text-muted/90" />
      </button>
      {isOpen && <OverlayPortal kind="popover"><div
          ref={popoverRef}
          className={MODEL_PICKER_POPOVER_CLASS}
          style={popoverStyle}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex flex-col gap-0.5">
            {effectiveModels.map((model) => {
              const isActive = selectedModel?.id === model.id;
              const disabledReason = getOptionDisabledReason?.(model) ?? null;
              const isDisabled = disabledReason != null && !isActive;
              const optionInner = (
                <>
                  {isActive ? (
                    <Check className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <span className="inline-block h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="truncate">{model.label}</span>
                </>
              );
              const optionClass = `${MODEL_PICKER_OPTION_BASE_CLASS} ${
                isActive
                  ? 'bg-primary text-primary-foreground ring-1 ring-primary/30'
                  : isDisabled
                    ? 'cursor-not-allowed text-text-muted/40'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`;
              if (isDisabled) {
                return (
                  <button
                    key={model.id}
                    type="button"
                    aria-disabled
                    onClick={(event) => event.stopPropagation()}
                    onMouseEnter={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setDisabledTooltip({
                        reason: disabledReason,
                        // 锚定到当前项的右下角:水平从图标右侧起,垂直略压住项底边。
                        left: rect.left + 36,
                        top: rect.bottom - 6,
                      });
                    }}
                    onMouseLeave={() => setDisabledTooltip(null)}
                    className={optionClass}
                  >
                    {optionInner}
                  </button>
                );
              }
              return (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    onChange(model.id);
                    setIsOpen(false);
                  }}
                  className={optionClass}
                >
                  {optionInner}
                </button>
              );
            })}
            {effectiveModels.length === 0 && (
              <span className="px-3 py-2 text-xs text-text-muted">
                {t(
                  loading
                    ? 'modelPicker.loading'
                    : loadFailed
                      ? 'modelPicker.loadFailed'
                      : 'modelPicker.empty',
                )}
              </span>
            )}
          </div>
        </div></OverlayPortal>}
      {isOpen && disabledTooltip && <OverlayPortal kind="tooltip"><div
          className="pointer-events-none fixed max-w-[240px] rounded-lg border border-border bg-popover/95 px-3 py-2 text-xs leading-5 text-popover-foreground shadow-lg"
          style={{ left: disabledTooltip.left, top: disabledTooltip.top }}
        >
          {disabledTooltip.reason}
        </div></OverlayPortal>}
    </div>
  );
}
