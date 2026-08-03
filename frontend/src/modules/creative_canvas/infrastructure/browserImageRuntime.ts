// Copyright (c) 2026 AI anime
import {
  isLikelyLocalImagePath,
  resolveImageDisplayUrl,
} from '../domain/imageData';
import type { CanvasImageRuntimeGateway } from '../application/imagePreparation';
import { mediaNeedsCrossOrigin } from '@/shared/media/cross-origin';

interface ErrorWithDetails extends Error {
  details?: string;
}

function createBrowserImageError(message: string, details?: string): ErrorWithDetails {
  const error: ErrorWithDetails = new Error(message);
  if (details) {
    error.details = details;
  }
  return error;
}

export async function persistImageLocally(source: string): Promise<string> {
  return source;
}

export async function loadImageElement(source: string): Promise<HTMLImageElement> {
  const image = new Image();
  const displaySource = resolveImageDisplayUrl(source);
  if (mediaNeedsCrossOrigin(displaySource)) {
    image.crossOrigin = 'anonymous';
  }

  return await new Promise((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(
        createBrowserImageError(
          '图片加载失败',
          `source=${source}\ndisplaySource=${displaySource}`,
        ),
      );
    image.src = displaySource;
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const reader = new FileReader();
  return await new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('图片转换失败'));
    reader.readAsDataURL(blob);
  });
}

async function imageUrlToDataUrl(imageUrl: string): Promise<string> {
  if (imageUrl.startsWith('data:')) {
    return imageUrl;
  }

  if (isLikelyLocalImagePath(imageUrl)) {
    const localResponse = await fetch(resolveImageDisplayUrl(imageUrl));
    if (!localResponse.ok) {
      throw createBrowserImageError(
        '无法读取本地图片数据',
        `source=${imageUrl}\nstatus=${localResponse.status}`,
      );
    }
    return await blobToDataUrl(await localResponse.blob());
  }

  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw createBrowserImageError(
      '无法下载图片数据',
      `url=${imageUrl}\nstatus=${response.status}`,
    );
  }
  return await blobToDataUrl(await response.blob());
}

async function readFileAsDataUrl(file: File): Promise<string> {
  const reader = new FileReader();
  return await new Promise((resolve, reject) => {
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

export function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

function resolvePreviewMimeType(imageUrl: string): string {
  if (imageUrl.startsWith('data:image/png')) {
    return 'image/png';
  }
  if (imageUrl.startsWith('data:image/webp')) {
    return 'image/webp';
  }
  return 'image/jpeg';
}

function renderPreviewDataUrl(
  image: HTMLImageElement,
  sourceDataUrl: string,
  maxDimension: number,
): string {
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  if (longestSide <= maxDimension) {
    return sourceDataUrl;
  }

  const scale = maxDimension / longestSide;
  const targetWidth = Math.max(1, Math.round(image.naturalWidth * scale));
  const targetHeight = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    return sourceDataUrl;
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const mimeType = resolvePreviewMimeType(sourceDataUrl);
  if (mimeType === 'image/jpeg') {
    return canvas.toDataURL(mimeType, 0.86);
  }
  return canvas.toDataURL(mimeType);
}

export const browserImageRuntimeGateway: CanvasImageRuntimeGateway = {
  now: () => performance.now(),
  persist: persistImageLocally,
  readFileAsDataUrl,
  preparePreview: async (sourceImage, maxDimension) => {
    const normalizedDataUrl = await imageUrlToDataUrl(sourceImage);
    const image = await loadImageElement(normalizedDataUrl);
    return {
      normalizedDataUrl,
      previewDataUrl: renderPreviewDataUrl(
        image,
        normalizedDataUrl,
        maxDimension,
      ),
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  },
  getDimensions: async (sourceImage) => {
    const image = await loadImageElement(sourceImage);
    return { width: image.naturalWidth, height: image.naturalHeight };
  },
};
