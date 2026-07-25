// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState } from "react";

import {
  centerCropBoxForRatio,
  zoomCropBox,
  type CropBox,
} from "@/lib/aspect-ratio";
import { resolveMediaUrl } from "@/lib/media-url";
import {
  clampSeedance2CropBox,
  cropAspectRatioValue,
  type Seedance2CropAspect,
  type Seedance2CropIntent,
} from "@/modules/production/domain/seedance2-crop";

interface CropDragState {
  clientX: number;
  clientY: number;
  crop: CropBox;
}

export function useSeedance2AssetCropController(
  intent: Seedance2CropIntent | null,
  targetCropAspect: Seedance2CropAspect,
) {
  const asset = intent?.asset ?? null;
  const imageRef = useRef<HTMLImageElement | null>(null);
  const cropBoxRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<CropDragState | null>(null);
  const [imageSize, setImageSize] = useState({ width: 1, height: 1 });
  const [crop, setCrop] = useState<CropBox>({
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });
  const [cropAspect, setCropAspect] =
    useState<Seedance2CropAspect>(targetCropAspect);
  const imageSrc = resolveMediaUrl(
    asset?.crop_source_url ||
      asset?.crop_source_path ||
      asset?.url ||
      asset?.path,
  );

  useEffect(() => {
    if (!asset) return;
    setImageSize({ width: 1, height: 1 });
    setCrop({ x: 0, y: 0, width: 1, height: 1 });
    setCropAspect(targetCropAspect);
  }, [asset, targetCropAspect]);

  useEffect(() => {
    const cropBox = cropBoxRef.current;
    if (!cropBox || !asset) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setCrop((current) =>
        zoomCropBox(
          current,
          imageSize.width,
          imageSize.height,
          event.deltaY < 0 ? 0.9 : 1.1,
        ),
      );
    };

    cropBox.addEventListener("wheel", handleWheel, { passive: false });
    return () => cropBox.removeEventListener("wheel", handleWheel);
  }, [asset, imageSize.height, imageSize.width]);

  const loadImage = (width: number, height: number) => {
    const nextWidth = Math.max(1, width);
    const nextHeight = Math.max(1, height);
    setImageSize({ width: nextWidth, height: nextHeight });
    setCrop(
      centerCropBoxForRatio(
        nextWidth,
        nextHeight,
        cropAspectRatioValue(cropAspect),
      ),
    );
  };

  const startDrag = (clientX: number, clientY: number) => {
    dragRef.current = { clientX, clientY, crop };
  };

  const moveDrag = (clientX: number, clientY: number) => {
    const drag = dragRef.current;
    const image = imageRef.current;
    if (!drag || !image) return;
    const imageRect = image.getBoundingClientRect();
    if (imageRect.width <= 0 || imageRect.height <= 0) return;

    const scaleX = imageSize.width / imageRect.width;
    const scaleY = imageSize.height / imageRect.height;
    setCrop(
      clampSeedance2CropBox(
        {
          ...drag.crop,
          x: drag.crop.x + (clientX - drag.clientX) * scaleX,
          y: drag.crop.y + (clientY - drag.clientY) * scaleY,
        },
        imageSize.width,
        imageSize.height,
      ),
    );
  };

  const stopDrag = () => {
    dragRef.current = null;
  };

  return {
    asset,
    crop,
    cropAspect,
    cropBoxRef,
    imageRef,
    imageSize,
    imageSrc,
    loadImage,
    moveDrag,
    startDrag,
    stopDrag,
  };
}
