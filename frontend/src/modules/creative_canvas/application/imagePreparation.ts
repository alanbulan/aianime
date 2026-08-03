// Copyright (c) 2026 AI anime
import { reduceAspectRatio } from '../domain/imageData';

export interface CanvasImageDimensions {
  width: number;
  height: number;
}

export interface CanvasImagePreviewData extends CanvasImageDimensions {
  normalizedDataUrl: string;
  previewDataUrl: string;
}

export interface CanvasImageRuntimeGateway {
  now: () => number;
  persist: (sourceImage: string) => Promise<string>;
  readFileAsDataUrl: (file: File) => Promise<string>;
  preparePreview: (
    sourceImage: string,
    maxDimension: number,
  ) => Promise<CanvasImagePreviewData>;
  getDimensions: (sourceImage: string) => Promise<CanvasImageDimensions>;
}

const DEFAULT_PREVIEW_MAX_DIMENSION = 512;

export interface PreparedNodeImage {
  imageUrl: string;
  previewImageUrl: string;
  aspectRatio: string;
}

interface ErrorWithDetails extends Error {
  details?: string;
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Error) {
    return value.message;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function createImagePipelineError(
  message: string,
  details?: string,
  cause?: unknown,
): ErrorWithDetails {
  const error: ErrorWithDetails = new Error(message);
  const detailParts: string[] = [];
  if (details) {
    detailParts.push(details);
  }
  if (cause !== undefined) {
    detailParts.push(`cause: ${stringifyUnknown(cause)}`);
  }
  if (detailParts.length > 0) {
    error.details = detailParts.join('\n');
  }
  return error;
}

export async function prepareNodeImage(
  runtime: CanvasImageRuntimeGateway,
  imageUrl: string,
  maxPreviewDimension = DEFAULT_PREVIEW_MAX_DIMENSION,
): Promise<PreparedNodeImage> {
  const trimmedImageUrl = imageUrl.trim();
  if (!trimmedImageUrl) {
    throw createImagePipelineError('未获取到可用图片结果', 'imageUrl is empty');
  }

  const started = runtime.now();
  try {
    const persistedImagePath = await runtime.persist(trimmedImageUrl);
    const prepared = await runtime.preparePreview(
      persistedImagePath,
      Math.max(64, Math.floor(maxPreviewDimension)),
    );
    const previewImagePath =
      prepared.previewDataUrl === prepared.normalizedDataUrl
        ? persistedImagePath
        : await runtime.persist(prepared.previewDataUrl);

    console.info(
      `[upload-perf][imageData] prepareNodeImage browser-fallback total=${Math.round(runtime.now() - started)}ms`,
    );
    return {
      imageUrl: persistedImagePath,
      previewImageUrl: previewImagePath,
      aspectRatio: reduceAspectRatio(prepared.width, prepared.height),
    };
  } catch (error) {
    throw createImagePipelineError(
      '生成结果无法解析为图片',
      `source=${trimmedImageUrl}`,
      error,
    );
  }
}

export async function prepareNodeImageFromFile(
  runtime: CanvasImageRuntimeGateway,
  file: File,
  maxPreviewDimension = DEFAULT_PREVIEW_MAX_DIMENSION,
): Promise<PreparedNodeImage> {
  const started = runtime.now();
  const dataUrlStarted = runtime.now();
  const source = await runtime.readFileAsDataUrl(file);
  const dataUrlElapsed = Math.round(runtime.now() - dataUrlStarted);
  const prepared = await prepareNodeImage(runtime, source, maxPreviewDimension);
  console.info(
    `[upload-perf][imageData] prepareNodeImageFromFile dataurl-fallback name="${file.name}" size=${file.size}B readDataUrl=${dataUrlElapsed}ms total=${Math.round(runtime.now() - started)}ms`,
  );
  return prepared;
}

export async function detectAspectRatio(
  runtime: CanvasImageRuntimeGateway,
  imageUrl: string,
): Promise<string> {
  const dimensions = await runtime.getDimensions(imageUrl);
  return reduceAspectRatio(dimensions.width, dimensions.height);
}
