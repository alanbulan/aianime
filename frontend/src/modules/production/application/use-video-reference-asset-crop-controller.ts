// Copyright (c) 2026 AI anime
import { useEffect, useRef, useState } from "react";

import {
  centerCropBoxForRatio,
  clampCropBox,
  zoomCropBox,
  type CropBox,
} from "@/shared/aspect-ratio";
import { resolveMediaUrl } from "@/lib/media-url";
import {
  cropAspectRatioValue,
  type VideoReferenceCropAspect,
  type VideoReferenceCropIntent,
} from "@/modules/production/domain/video-reference-crop";

interface CropDragState {
  clientX: number;
  clientY: number;
  crop: CropBox;
}

export function useVideoReferenceAssetCropController(
  intent: VideoReferenceCropIntent | null,
  targetCropAspect: VideoReferenceCropAspect,
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
    useState<VideoReferenceCropAspect>(targetCropAspect);
  // The 1x1 placeholder above is not a usable crop. `imageSrc` resolves
  // synchronously, so it cannot stand in for "the image has decoded".
  const [loaded, setLoaded] = useState(false);
  const imageSrc = resolveMediaUrl(
    asset?.crop_source_url ||
      asset?.crop_source_path ||
      asset?.url ||
      asset?.path,
  );

  // Keyed on the resolved source, not on the `asset` object. Keying it on the
  // object reference meant any refetch that produced a new reference blanked
  // the crop back to 1x1 while the already-decoded <img> fired no fresh load
  // event — leaving the crop box permanently unusable for that dialog.
  useEffect(() => {
    setLoaded(false);
    setImageSize({ width: 1, height: 1 });
    setCrop({ x: 0, y: 0, width: 1, height: 1 });
  }, [imageSrc]);

  useEffect(() => {
    setCropAspect(targetCropAspect);
  }, [targetCropAspect]);

  // Re-center against the decoded dimensions whenever the image or the
  // requested aspect changes. Never runs before the image has loaded, so it
  // cannot reintroduce a degenerate crop.
  useEffect(() => {
    if (!loaded) return;
    setCrop(
      centerCropBoxForRatio(
        imageSize.width,
        imageSize.height,
        cropAspectRatioValue(targetCropAspect),
      ),
    );
  }, [imageSize.height, imageSize.width, loaded, targetCropAspect]);

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
    setLoaded(true);
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
      clampCropBox(
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
    // True only once the image has decoded and a real crop box exists.
    ready: loaded,
    startDrag,
    stopDrag,
  };
}
