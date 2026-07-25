// Copyright (c) 2026 AI anime
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, Crop, Loader2, Save, X } from "lucide-react";

import { CROP_DIALOG_SAVE_BUTTON_CLASS } from "@/components/episode/beat-workbench/media-styles";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cropBoxPercentStyle } from "@/lib/aspect-ratio";
import type {
  SketchCropDialogController,
} from "@/modules/production/application/use-sketch-crop-dialog-controller";

export type SketchCropDialogViewProps = SketchCropDialogController;

export function SketchCropDialogView({
  aspectLabel,
  beatNum,
  crop,
  data,
  loadError,
  open,
  savePending,
  sketchUrl,
  onMoveDrag,
  onOpenChange,
  onSave,
  onStartDrag,
  onStopDrag,
  onZoom,
}: SketchCropDialogViewProps) {
  const { t } = useTranslation();
  const imageRef = useRef<HTMLImageElement | null>(null);
  const removeWheelListenerRef = useRef<(() => void) | null>(null);
  const cropBoxStyle = data
    ? cropBoxPercentStyle(crop, data.width, data.height)
    : undefined;

  const cropBoxRef = useCallback(
    (element: HTMLDivElement | null) => {
      removeWheelListenerRef.current?.();
      removeWheelListenerRef.current = null;
      if (!element) return;

      const handleWheel = (event: WheelEvent) => {
        event.preventDefault();
        event.stopPropagation();
        onZoom(event.deltaY < 0 ? 0.9 : 1.1);
      };
      element.addEventListener("wheel", handleWheel, { passive: false });
      removeWheelListenerRef.current = () =>
        element.removeEventListener("wheel", handleWheel);
    },
    [onZoom],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-none border-0 bg-media p-0 text-media-foreground ring-media-foreground/10 sm:max-w-[min(96vw,1120px)]"
      >
        <div className="relative flex h-12 items-center border-b border-media-foreground/10 px-4">
          <div className="flex items-center gap-2 text-sm font-medium text-media-foreground">
            <Crop className="size-4" />
            {`裁剪 ${aspectLabel}`}
          </div>
          <DialogTitle className="absolute left-1/2 max-w-[52vw] -translate-x-1/2 truncate text-center text-sm font-medium text-media-foreground">
            {t("episode.workbench.sketch.cropTitle", { n: beatNum })}
          </DialogTitle>
          <button
            type="button"
            aria-label="关闭"
            className="absolute right-4 flex size-7 items-center justify-center text-media-foreground/90 hover:text-media-foreground"
            onClick={() => onOpenChange(false)}
          >
            <X className="size-5" />
          </button>
        </div>
        {!data ? (
          loadError ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 p-6 text-center text-sm text-media-foreground/70">
              <AlertCircle className="size-5 text-warning" />
              <div className="max-w-md">{loadError}</div>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t("common.close", "Close")}
              </Button>
            </div>
          ) : (
            <div className="flex min-h-[360px] items-center justify-center p-6 text-sm text-media-foreground/70">
              <Loader2 className="mr-2 size-4 animate-spin" />
              {t("common.loading", "Loading")}
            </div>
          )
        ) : (
          <>
            <div className="relative flex min-h-[360px] items-center justify-center bg-media p-4">
              <div className="relative inline-block max-h-[72vh] max-w-full">
                <img
                  ref={imageRef}
                  src={sketchUrl}
                  alt={`B${beatNum}`}
                  className="block max-h-[72vh] max-w-full object-contain"
                  loading="lazy"
                  decoding="async"
                />
                {cropBoxStyle ? (
                  <div
                    ref={cropBoxRef}
                    role="button"
                    tabIndex={0}
                    aria-label="移动裁剪区域"
                    className="absolute cursor-move touch-none border-2 border-cyan-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.58)]"
                    style={cropBoxStyle}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                      onStartDrag(event.clientX, event.clientY);
                    }}
                    onPointerMove={(event) => {
                      const imageRect =
                        imageRef.current?.getBoundingClientRect();
                      if (!imageRect) return;
                      onMoveDrag(
                        event.clientX,
                        event.clientY,
                        imageRect.width,
                        imageRect.height,
                      );
                    }}
                    onPointerUp={(event) => {
                      event.currentTarget.releasePointerCapture?.(
                        event.pointerId,
                      );
                      onStopDrag();
                    }}
                    onPointerCancel={(event) => {
                      event.currentTarget.releasePointerCapture?.(
                        event.pointerId,
                      );
                      onStopDrag();
                    }}
                  >
                    <div className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-media-foreground/30" />
                    <div className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-media-foreground/30" />
                    <div className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-media-foreground/30" />
                    <div className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-media-foreground/30" />
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-media-foreground/10 bg-media px-4 py-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={onSave}
                disabled={savePending}
                className={CROP_DIALOG_SAVE_BUTTON_CLASS}
              >
                {savePending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Save className="size-3.5" />
                )}
                {t("common.save", "Save")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
