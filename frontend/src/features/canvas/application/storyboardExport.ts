// Copyright (c) 2026 AI anime
import { reduceAspectRatio } from '@/features/canvas/application/imageData';
import { resolveStoryboardPackPlan } from '@/features/canvas/application/storyboardNodeModel';
import type {
  StoryboardExportOptions,
  StoryboardFrameItem,
} from '@/features/canvas/domain/canvasNodes';

const EXPORT_MAX_DIMENSION = 4096;
const EXPORT_TRACE_PREFIX = '[StoryboardExport]';

export interface StoryboardMergeLayout {
  imagePath: string;
  canvasWidth: number;
  canvasHeight: number;
  cellWidth: number;
  cellHeight: number;
  gap: number;
  padding: number;
  noteHeight: number;
  fontSize: number;
  textOverlayApplied: boolean;
}

export interface StoryboardMergeCommand {
  frameSources: string[];
  rows: number;
  cols: number;
  cellGap: number;
  outerPadding: number;
  noteHeight: number;
  fontSize: number;
  backgroundColor: string;
  maxDimension: number;
  showFrameIndex: boolean;
  showFrameNote: boolean;
  notePlacement: 'overlay' | 'bottom';
  imageFit: 'cover' | 'contain';
  frameIndexPrefix: string;
  textColor: string;
  frameNotes: string[];
}

export interface ExportStoryboardGridCommand {
  nodeId: string;
  frames: readonly StoryboardFrameItem[];
  rows: number;
  cols: number;
  options: StoryboardExportOptions;
}

export interface ExportStoryboardGridResult {
  imageUrl: string;
  aspectRatio: string;
}

export interface ExportStoryboardGridDependencies {
  timestamp: () => number;
  now: () => number;
  getReferenceFrameHeight: (source: string) => Promise<number>;
  mergeImages: (
    command: StoryboardMergeCommand,
  ) => Promise<StoryboardMergeLayout>;
  applyTextOverlay: (
    imageSource: string,
    frames: readonly StoryboardFrameItem[],
    options: StoryboardExportOptions,
    rows: number,
    cols: number,
    layout: StoryboardMergeLayout,
  ) => Promise<string>;
  persistImage: (source: string) => Promise<string>;
  embedMetadata: (
    source: string,
    metadata: { gridRows: number; gridCols: number; frameNotes: string[] },
  ) => Promise<string>;
  uploadImage: (source: string, filename: string) => Promise<string>;
  info: (message: string, context: Record<string, unknown>) => void;
  warn: (message: string, error: unknown) => void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export async function exportStoryboardGrid(
  command: ExportStoryboardGridCommand,
  dependencies: ExportStoryboardGridDependencies,
): Promise<ExportStoryboardGridResult> {
  const traceId = `${command.nodeId}-${dependencies.timestamp()}`;
  const traceStart = dependencies.now();
  dependencies.info(`${EXPORT_TRACE_PREFIX} start`, {
    traceId,
    nodeId: command.nodeId,
    rows: command.rows,
    cols: command.cols,
    frameCount: command.frames.length,
  });

  const frameStart = dependencies.now();
  const frameSources = command.frames.map(
    (frame) => frame.imageUrl ?? frame.previewImageUrl ?? '',
  );
  if (frameSources.every((source) => !source)) {
    throw new Error('没有可导出的图片');
  }
  dependencies.info(`${EXPORT_TRACE_PREFIX} frame-sources-ready`, {
    traceId,
    elapsedMs: Math.round(dependencies.now() - frameStart),
    nonEmptyFrames: frameSources.filter((source) => source.length > 0).length,
  });

  const rawGap = clamp(Math.round(command.options.cellGap), 0, 120);
  const fontPercent = clamp(
    Number.isFinite(command.options.fontSize) ? command.options.fontSize : 4,
    1,
    20,
  );
  const firstFrameSource =
    frameSources.find((source) => source.length > 0) ?? null;
  let referenceFrameHeight = 1024;
  if (firstFrameSource) {
    const referenceStart = dependencies.now();
    try {
      referenceFrameHeight = Math.max(
        64,
        await dependencies.getReferenceFrameHeight(firstFrameSource),
      );
    } catch {
      // Keep the established fallback when the first frame cannot be read.
    }
    dependencies.info(`${EXPORT_TRACE_PREFIX} font-reference-resolved`, {
      traceId,
      elapsedMs: Math.round(dependencies.now() - referenceStart),
      referenceFrameHeight,
    });
  }
  const rawFontSize = clamp(
    Math.round(referenceFrameHeight * (fontPercent / 100)),
    10,
    240,
  );
  const rawNoteHeight =
    command.options.showFrameNote &&
    command.options.notePlacement === 'bottom'
      ? Math.max(Math.round(rawFontSize * 1.7), 24)
      : 0;

  const mergeStart = dependencies.now();
  const mergeResult = await dependencies.mergeImages({
    frameSources,
    rows: command.rows,
    cols: command.cols,
    cellGap: rawGap,
    outerPadding: 0,
    noteHeight: rawNoteHeight,
    fontSize: rawFontSize,
    backgroundColor: command.options.backgroundColor,
    maxDimension: EXPORT_MAX_DIMENSION,
    showFrameIndex: command.options.showFrameIndex,
    showFrameNote: command.options.showFrameNote,
    notePlacement: command.options.notePlacement,
    imageFit: command.options.imageFit,
    frameIndexPrefix: command.options.frameIndexPrefix,
    textColor: command.options.textColor,
    frameNotes: command.frames.map((frame) => frame.note ?? ''),
  });
  dependencies.info(`${EXPORT_TRACE_PREFIX} merge-done`, {
    traceId,
    elapsedMs: Math.round(dependencies.now() - mergeStart),
    canvasWidth: mergeResult.canvasWidth,
    canvasHeight: mergeResult.canvasHeight,
    textOverlayApplied: mergeResult.textOverlayApplied,
  });

  const aspectRatio = reduceAspectRatio(
    mergeResult.canvasWidth,
    mergeResult.canvasHeight,
  );
  const needsOverlay =
    (command.options.showFrameIndex || command.options.showFrameNote) &&
    !mergeResult.textOverlayApplied;
  let finalImagePath = mergeResult.imagePath;
  if (needsOverlay) {
    const overlayStart = dependencies.now();
    const overlaidImage = await dependencies.applyTextOverlay(
      mergeResult.imagePath,
      command.frames,
      command.options,
      command.rows,
      command.cols,
      mergeResult,
    );
    dependencies.info(`${EXPORT_TRACE_PREFIX} overlay-done`, {
      traceId,
      elapsedMs: Math.round(dependencies.now() - overlayStart),
      dataUrlLength: overlaidImage.length,
    });
    const persistStart = dependencies.now();
    finalImagePath = await dependencies.persistImage(overlaidImage);
    dependencies.info(`${EXPORT_TRACE_PREFIX} overlay-persisted`, {
      traceId,
      elapsedMs: Math.round(dependencies.now() - persistStart),
      persistedPath: finalImagePath,
    });
  }

  const metadataStart = dependencies.now();
  finalImagePath = await dependencies
    .embedMetadata(finalImagePath, {
      gridRows: command.rows,
      gridCols: command.cols,
      frameNotes: command.frames.map((frame) => frame.note ?? ''),
    })
    .catch((error) => {
      dependencies.warn(
        '[StoryboardMetadata] embed failed on storyboard export',
        error,
      );
      return finalImagePath;
    });
  dependencies.info(`${EXPORT_TRACE_PREFIX} metadata-embedded`, {
    traceId,
    elapsedMs: Math.round(dependencies.now() - metadataStart),
    imagePath: finalImagePath,
  });

  const uploadStart = dependencies.now();
  const uploadedImageUrl = await dependencies.uploadImage(
    finalImagePath,
    `storyboard-export-${command.nodeId}-${dependencies.timestamp()}.png`,
  );
  dependencies.info(`${EXPORT_TRACE_PREFIX} uploaded`, {
    traceId,
    elapsedMs: Math.round(dependencies.now() - uploadStart),
    uploaded: uploadedImageUrl !== finalImagePath,
  });
  dependencies.info(`${EXPORT_TRACE_PREFIX} done`, {
    traceId,
    totalElapsedMs: Math.round(dependencies.now() - traceStart),
  });
  return { imageUrl: uploadedImageUrl, aspectRatio };
}

export interface PackStoryboardFramesDependencies {
  saveImage: (
    source: string,
    outputDir: string,
    fileStem: string,
  ) => Promise<unknown>;
}

export async function packStoryboardFrames(
  frames: readonly StoryboardFrameItem[],
  projectName: string,
  dependencies: PackStoryboardFramesDependencies,
): Promise<void> {
  const plan = resolveStoryboardPackPlan(frames, projectName);
  if (plan.entries.length === 0) {
    throw new Error('该格没有可导出的图片');
  }
  for (const entry of plan.entries) {
    await dependencies.saveImage(
      entry.source,
      plan.outputDir,
      entry.fileStem,
    );
  }
}
