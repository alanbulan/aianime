// Copyright (c) 2026 AI anime
import {
  NODE_TOOL_TYPES,
  type NodeToolType,
} from '../domain/canvasNodeTool';
import type { CanvasToolResult } from '../domain/canvasTool';
import type { CanvasImageDimensions } from './imagePreparation';
import type { StoryboardFrameItem } from '../domain/storyboard';
import {
  clampImageSplitLineThicknessPx,
  resolveImageSplitLineThicknessPx,
} from '../domain/toolImageGeometry';

export interface CanvasImageSplitGateway {
  split: (
    imageSource: string,
    rows: number,
    cols: number,
    lineThickness: number,
  ) => Promise<string[]>;
}

export interface CanvasToolImageGateway {
  crop: (
    sourceImage: string,
    options: Record<string, unknown>,
  ) => Promise<string>;
  annotate: (
    sourceImage: string,
    options: Record<string, unknown>,
  ) => Promise<string>;
  persist: (sourceImage: string) => Promise<string>;
  detectAspectRatio: (sourceImage: string) => Promise<string>;
  getDimensions: (sourceImage: string) => Promise<CanvasImageDimensions>;
  readStoryboardMetadata: (
    sourceImage: string,
  ) => Promise<CanvasStoryboardImageMetadata | null>;
}

export interface CanvasStoryboardImageMetadata {
  gridRows: number;
  gridCols: number;
  frameNotes: string[];
}

export interface CanvasToolIdGenerator {
  next: () => string;
}

export class CanvasToolProcessor {
  constructor(
    private readonly splitGateway: CanvasImageSplitGateway,
    private readonly imageGateway: CanvasToolImageGateway,
    private readonly idGenerator: CanvasToolIdGenerator,
  ) {}

  async process(
    toolType: NodeToolType,
    sourceImageUrl: string,
    options: Record<string, unknown>
  ): Promise<CanvasToolResult> {
    if (toolType === NODE_TOOL_TYPES.splitStoryboard) {
      const metadata = await this.readStoryboardMetadata(sourceImageUrl);
      return await this.splitStoryboard(
        sourceImageUrl,
        Number(options.rows ?? metadata?.gridRows ?? 3),
        Number(options.cols ?? metadata?.gridCols ?? 3),
        Number(options.lineThicknessPercent),
        Number(options.lineThickness ?? 0),
        metadata?.frameNotes
      );
    }

    switch (toolType) {
      case NODE_TOOL_TYPES.crop:
        return {
          outputImageUrl: await this.imageGateway.crop(sourceImageUrl, options),
        };
      case NODE_TOOL_TYPES.annotate:
        // Keep annotate on frontend for now because it supports free-form vector annotations.
        // Prefer local source first to avoid CORS taint and repeated remote fetches.
        return {
          outputImageUrl: await this.imageGateway.annotate(
            await this.imageGateway.persist(sourceImageUrl),
            options
          ),
        };
      default:
        throw new Error('不支持的工具类型');
    }
  }

  private async splitStoryboard(
    sourceImage: string,
    rows: number,
    cols: number,
    lineThicknessPercent: number,
    lineThicknessPxFallback: number,
    frameNotes?: string[]
  ): Promise<CanvasToolResult> {
    const normalizedRows = Number.isFinite(rows) ? rows : 3;
    const normalizedCols = Number.isFinite(cols) ? cols : 3;
    const normalizedLineThicknessPercent = Number.isFinite(lineThicknessPercent)
      ? lineThicknessPercent
      : NaN;
    const normalizedLineThicknessPxFallback = Number.isFinite(lineThicknessPxFallback)
      ? lineThicknessPxFallback
      : 0;

    const safeRows = Math.max(1, Math.floor(normalizedRows));
    const safeCols = Math.max(1, Math.floor(normalizedCols));
    const safeLineThickness = await this.resolveSplitLineThicknessPx(
      sourceImage,
      safeRows,
      safeCols,
      normalizedLineThicknessPercent,
      normalizedLineThicknessPxFallback
    );

    const outputs = await this.splitGateway.split(
      sourceImage,
      safeRows,
      safeCols,
      safeLineThickness
    );

    const persistedFrameImages = await Promise.all(
      outputs.map(async (imageUrl) => await this.imageGateway.persist(imageUrl))
    );

    let frameAspectRatio: string | undefined;
    const firstFrameImage = persistedFrameImages[0];
    if (firstFrameImage) {
      try {
        frameAspectRatio = await this.imageGateway.detectAspectRatio(firstFrameImage);
      } catch {
        frameAspectRatio = undefined;
      }
    }

    const resolvedFrameAspectRatio = frameAspectRatio ?? `${safeCols}:${safeRows}`;
    const frames: StoryboardFrameItem[] = persistedFrameImages.map((imageUrl, index) => ({
      id: this.idGenerator.next(),
      imageUrl,
      previewImageUrl: imageUrl,
      aspectRatio: resolvedFrameAspectRatio,
      note: typeof frameNotes?.[index] === 'string' ? frameNotes[index].trim() : '',
      order: index,
    }));

    return {
      storyboardFrames: frames,
      rows: safeRows,
      cols: safeCols,
      frameAspectRatio: resolvedFrameAspectRatio,
      lineThicknessPercent: Number.isFinite(normalizedLineThicknessPercent)
        ? Math.max(0, normalizedLineThicknessPercent)
        : undefined,
      lineThicknessPx: safeLineThickness,
    };
  }

  private async resolveSplitLineThicknessPx(
    sourceImage: string,
    rows: number,
    cols: number,
    lineThicknessPercent: number,
    lineThicknessPxFallback: number
  ): Promise<number> {
    const usesPercent = Number.isFinite(lineThicknessPercent);
    const normalizedPercent = usesPercent
      ? Math.max(0, lineThicknessPercent)
      : 0;
    const normalizedFallback = Math.max(0, Math.floor(lineThicknessPxFallback));
    if ((usesPercent && normalizedPercent <= 0) || (!usesPercent && normalizedFallback <= 0)) {
      return 0;
    }

    const dimensions = await this.imageGateway.getDimensions(sourceImage);
    const imageWidth = Math.max(1, dimensions.width);
    const imageHeight = Math.max(1, dimensions.height);
    return usesPercent
      ? resolveImageSplitLineThicknessPx(
          imageWidth,
          imageHeight,
          rows,
          cols,
          normalizedPercent,
        )
      : clampImageSplitLineThicknessPx(
          imageWidth,
          imageHeight,
          rows,
          cols,
          normalizedFallback,
        );
  }

  private async readStoryboardMetadata(
    sourceImage: string
  ): Promise<{ gridRows: number; gridCols: number; frameNotes: string[] } | null> {
    try {
      return await this.imageGateway.readStoryboardMetadata(sourceImage);
    } catch {
      return null;
    }
  }
}
