// Copyright (c) 2026 AI anime
import {
  cropImageSource,
  readStoryboardImageMetadata,
} from './browserImageCommands';

import type { CanvasToolImageGateway } from '../application/canvasToolProcessor';
import { parseAspectRatio } from '../domain/aspectRatio';
import { parseAnnotationItems } from '../domain/canvasAnnotationCodec';
import { reduceAspectRatio } from '../domain/imageData';
import { drawAnnotations } from './browserCanvasAnnotationRenderer';
import {
  browserImageRuntimeGateway,
  canvasToDataUrl,
  loadImageElement,
  persistImageLocally,
} from './browserImageRuntime';

async function cropImage(
  sourceImage: string,
  options: Record<string, unknown>,
): Promise<string> {
  try {
    return await cropImageSource({
      source: sourceImage,
      aspectRatio: String(options.aspectRatio ?? '1:1'),
      cropX: Number(options.cropX),
      cropY: Number(options.cropY),
      cropWidth: Number(options.cropWidth),
      cropHeight: Number(options.cropHeight),
    });
  } catch {
    // Fall back to direct browser canvas processing.
  }

  const aspectRatio = String(options.aspectRatio ?? '1:1');
  const targetRatio = parseAspectRatio(aspectRatio);
  const image = await loadImageElement(sourceImage);

  const cropX = Number(options.cropX);
  const cropY = Number(options.cropY);
  const cropWidthOption = Number(options.cropWidth);
  const cropHeightOption = Number(options.cropHeight);

  const hasManualCropArea =
    Number.isFinite(cropX) &&
    Number.isFinite(cropY) &&
    Number.isFinite(cropWidthOption) &&
    Number.isFinite(cropHeightOption) &&
    cropWidthOption > 0 &&
    cropHeightOption > 0;

  let cropWidth = image.naturalWidth;
  let cropHeight = image.naturalHeight;
  let offsetX = 0;
  let offsetY = 0;

  if (hasManualCropArea) {
    offsetX = Math.min(image.naturalWidth - 1, Math.max(0, Math.floor(cropX)));
    offsetY = Math.min(image.naturalHeight - 1, Math.max(0, Math.floor(cropY)));
    cropWidth = Math.max(
      1,
      Math.min(Math.floor(cropWidthOption), image.naturalWidth - offsetX),
    );
    cropHeight = Math.max(
      1,
      Math.min(Math.floor(cropHeightOption), image.naturalHeight - offsetY),
    );
  } else if (aspectRatio === 'free') {
    cropWidth = image.naturalWidth;
    cropHeight = image.naturalHeight;
  } else {
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    if (sourceRatio > targetRatio) {
      cropWidth = image.naturalHeight * targetRatio;
    } else {
      cropHeight = image.naturalWidth / targetRatio;
    }

    offsetX = (image.naturalWidth - cropWidth) / 2;
    offsetY = (image.naturalHeight - cropHeight) / 2;
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(cropWidth));
  canvas.height = Math.max(1, Math.floor(cropHeight));

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('无法初始化画布');
  }

  context.drawImage(
    image,
    offsetX,
    offsetY,
    cropWidth,
    cropHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return canvasToDataUrl(canvas);
}

function resolveAnnotateY(
  position: string,
  canvasHeight: number,
  boxHeight: number,
): number {
  if (position === 'top') {
    return boxHeight / 2 + 24;
  }
  if (position === 'center') {
    return canvasHeight / 2;
  }
  return canvasHeight - boxHeight / 2 - 24;
}

async function annotateImage(
  sourceImage: string,
  options: Record<string, unknown>,
): Promise<string> {
  const image = await loadImageElement(sourceImage);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('无法初始化画布');
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const annotations = parseAnnotationItems(options.annotations);

  if (annotations.length > 0) {
    drawAnnotations(context, annotations);
  } else {
    const text = String(options.text ?? '').trim();
    const position = String(options.position ?? 'bottom');
    const color = String(options.color ?? '#FFFFFF');

    if (!text) {
      return canvasToDataUrl(canvas);
    }

    const fontSize = Math.max(24, Math.round(canvas.width * 0.04));
    context.font = `600 ${fontSize}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    const textWidth = context.measureText(text).width;
    const paddingX = Math.round(fontSize * 0.8);
    const paddingY = Math.round(fontSize * 0.6);
    const boxWidth = textWidth + paddingX * 2;
    const boxHeight = fontSize + paddingY * 2;

    const x = canvas.width / 2;
    const y = resolveAnnotateY(position, canvas.height, boxHeight);

    context.fillStyle = 'rgba(0, 0, 0, 0.45)';
    context.fillRect(x - boxWidth / 2, y - boxHeight / 2, boxWidth, boxHeight);
    context.fillStyle = color;
    context.fillText(text, x, y);
  }

  return canvasToDataUrl(canvas);
}

export const browserToolImageGateway: CanvasToolImageGateway = {
  crop: cropImage,
  annotate: annotateImage,
  persist: persistImageLocally,
  detectAspectRatio: async (sourceImage) => {
    const dimensions = await browserImageRuntimeGateway.getDimensions(sourceImage);
    return reduceAspectRatio(dimensions.width, dimensions.height);
  },
  getDimensions: browserImageRuntimeGateway.getDimensions,
  readStoryboardMetadata: async (sourceImage) => {
    try {
      const metadata = await readStoryboardImageMetadata(sourceImage);
      if (!metadata) {
        return null;
      }
      return {
        gridRows: metadata.gridRows,
        gridCols: metadata.gridCols,
        frameNotes: Array.isArray(metadata.frameNotes) ? metadata.frameNotes : [],
      };
    } catch {
      return null;
    }
  },
};
