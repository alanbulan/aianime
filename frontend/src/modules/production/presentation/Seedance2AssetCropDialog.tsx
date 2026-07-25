// Copyright (c) 2026 AI anime
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Scissors, X } from "lucide-react";

import type { CropBox } from "@/lib/aspect-ratio";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSeedance2AssetCropController } from "@/modules/production/application/use-seedance2-asset-crop-controller";
import type {
  Seedance2CropAspect,
  Seedance2CropIntent,
} from "@/modules/production/domain/seedance2-crop";
import type {
  Seedance2AssetItem,
  VideoInputCropTarget,
} from "@/modules/production/domain/seedance2-panel";

export function Seedance2AssetCropDialog({
  intent,
  targetCropAspect,
  pending,
  onOpenChange,
  onSave,
}: {
  intent: Seedance2CropIntent | null;
  targetCropAspect: Seedance2CropAspect;
  pending: boolean;
  onOpenChange(open: boolean): void;
  onSave(
    asset: Seedance2AssetItem,
    target: VideoInputCropTarget,
    crop: CropBox,
  ): void;
}) {
  const { t } = useTranslation();
  const controller = useSeedance2AssetCropController(intent, targetCropAspect);
  const cropBoxStyle = cropBoxPercentStyle(
    controller.crop,
    controller.imageSize.width,
    controller.imageSize.height,
  );

  return (
    <Dialog open={controller.asset !== null} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-0 overflow-hidden rounded-none border-0 bg-media p-0 text-media-foreground ring-media-foreground/10 sm:max-w-[min(96vw,1120px)]"
      >
        <div className="relative flex h-12 items-center border-b border-media-foreground/10 px-4">
          <div className="flex items-center gap-2 text-sm font-medium text-media-foreground">
            <Scissors className="size-4" />
            {`裁剪 ${controller.cropAspect}`}
          </div>
          <DialogTitle className="absolute left-1/2 max-w-[52vw] -translate-x-1/2 truncate text-center text-sm font-medium text-media-foreground">
            {t("episode.workbench.video.seedance2AssetCropTitle")}
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
        {controller.asset && (
          <>
            <div className="relative flex min-h-[360px] items-center justify-center bg-media p-4">
              {controller.imageSrc ? (
                <div className="relative inline-block max-h-[72vh] max-w-full">
                  <img
                    ref={controller.imageRef}
                    src={controller.imageSrc}
                    alt={controller.asset.label}
                    className="block max-h-[72vh] max-w-full object-contain"
                    decoding="async"
                    onLoad={(event) =>
                      controller.loadImage(
                        event.currentTarget.naturalWidth,
                        event.currentTarget.naturalHeight,
                      )
                    }
                  />
                  <div
                    ref={controller.cropBoxRef}
                    role="button"
                    tabIndex={0}
                    aria-label="移动裁剪区域"
                    className="absolute cursor-move touch-none border-2 border-cyan-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.58)]"
                    style={cropBoxStyle}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.currentTarget.setPointerCapture?.(event.pointerId);
                      controller.startDrag(event.clientX, event.clientY);
                    }}
                    onPointerMove={(event) =>
                      controller.moveDrag(event.clientX, event.clientY)
                    }
                    onPointerUp={(event) => {
                      event.currentTarget.releasePointerCapture?.(
                        event.pointerId,
                      );
                      controller.stopDrag();
                    }}
                    onPointerCancel={(event) => {
                      event.currentTarget.releasePointerCapture?.(
                        event.pointerId,
                      );
                      controller.stopDrag();
                    }}
                  >
                    <div className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-media-foreground/30" />
                    <div className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-media-foreground/30" />
                    <div className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-media-foreground/30" />
                    <div className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-media-foreground/30" />
                  </div>
                </div>
              ) : (
                <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
                  {t("episode.workbench.video.seedance2ReferenceMissing")}
                </div>
              )}
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
                onClick={() => {
                  if (!intent) return;
                  onSave(intent.asset, intent.target, controller.crop);
                }}
                disabled={pending || !controller.imageSrc}
                className="gap-1"
              >
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Scissors className="size-3.5" />
                )}
                {t("episode.workbench.video.seedance2AssetCrop")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function cropBoxPercentStyle(
  crop: CropBox,
  sourceWidth: number,
  sourceHeight: number,
): CSSProperties {
  const safeWidth = Math.max(1, sourceWidth);
  const safeHeight = Math.max(1, sourceHeight);

  return {
    left: `${(crop.x / safeWidth) * 100}%`,
    top: `${(crop.y / safeHeight) * 100}%`,
    width: `${(crop.width / safeWidth) * 100}%`,
    height: `${(crop.height / safeHeight) * 100}%`,
  };
}
