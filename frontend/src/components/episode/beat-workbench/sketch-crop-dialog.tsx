// Copyright (c) 2026 AI anime
import {
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import {
  SketchCropDialogView,
  type SketchCrop,
  useCropSketch,
  useSketchPoseEditor,
} from "@/modules/production/public";
import { resolveMediaUrl } from "@/lib/media-url";
import {
  centerCropBoxForRatio,
  clampCropBox,
  zoomCropBox,
} from "@/lib/aspect-ratio";
import { useProjectAspectRatio } from "@/stores/aspect-ratio-store";
import { withImageCacheBust } from "@/features/canvas/application/imageData";

interface SketchCropDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: string;
  episode: number;
  beatNum: number;
}

export function SketchCropDialog({
  open,
  onOpenChange,
  project,
  episode,
  beatNum,
}: SketchCropDialogProps) {
  const { t } = useTranslation();
  const { spec } = useProjectAspectRatio(project);
  const poseQuery = useSketchPoseEditor(project, episode, beatNum, open);
  const cropSketch = useCropSketch(project, episode);
  const data = poseQuery.data?.ok ? poseQuery.data.data : null;
  const sketchUrl = data?.sketch_url
    ? withImageCacheBust(resolveMediaUrl(data.sketch_url) ?? data.sketch_url, poseQuery.dataUpdatedAt)
    : "";
  const loadError =
    !data && poseQuery.error instanceof Error
      ? poseQuery.error.message
      : !data && poseQuery.isError
        ? t("common.error")
        : null;
  const imageRef = useRef<HTMLImageElement | null>(null);
  const cropBoxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    crop: SketchCrop;
  } | null>(null);
  const [crop, setCrop] = useState<SketchCrop>({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });

  useEffect(() => {
    if (!data || !open) return;
    setCrop(centerCropBoxForRatio(data.width, data.height, spec.ratioValue));
  }, [data?.height, data?.width, open, spec.ratioValue]);

  useEffect(() => {
    const cropBox = cropBoxRef.current;
    if (!cropBox || !data || !open) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setCrop((current) =>
        zoomCropBox(
          current,
          data.width,
          data.height,
          event.deltaY < 0 ? 0.9 : 1.1,
        ),
      );
    };

    cropBox.addEventListener("wheel", handleWheel, { passive: false });
    return () => cropBox.removeEventListener("wheel", handleWheel);
  }, [data?.height, data?.width, open]);

  const moveCropBox = (clientX: number, clientY: number) => {
    if (!dragRef.current || !data || !imageRef.current) return;
    const imageRect = imageRef.current.getBoundingClientRect();
    if (imageRect.width <= 0 || imageRect.height <= 0) return;

    const scaleX = data.width / imageRect.width;
    const scaleY = data.height / imageRect.height;
    const drag = dragRef.current;
    setCrop(
      clampCropBox(
        {
          ...drag.crop,
          x: drag.crop.x + (clientX - drag.clientX) * scaleX,
          y: drag.crop.y + (clientY - drag.clientY) * scaleY,
        },
        data.width,
        data.height,
      ),
    );
  };

  const handleSave = async () => {
    try {
      const res = await cropSketch.mutateAsync({ beatNum, crop });
      if (!res.ok) {
        toast.error(res.error || t("common.error"));
        return;
      }
      toast.success(t("episode.workbench.sketch.cropSaved"));
      onOpenChange(false);
    } catch {
      toast.error(t("common.error"));
    }
  };

  return (
    <SketchCropDialogView
      aspectLabel={spec.label}
      beatNum={beatNum}
      crop={crop}
      cropBoxRef={cropBoxRef}
      data={data}
      imageRef={imageRef}
      loadError={loadError}
      open={open}
      savePending={cropSketch.isPending}
      sketchUrl={sketchUrl}
      onMoveDrag={moveCropBox}
      onOpenChange={onOpenChange}
      onSave={() => void handleSave()}
      onStartDrag={(pointerId, clientX, clientY) => {
        dragRef.current = { pointerId, clientX, clientY, crop };
      }}
      onStopDrag={() => {
        dragRef.current = null;
      }}
    />
  );
}
