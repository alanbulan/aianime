// Copyright (c) 2026 AI anime
import { useCallback, useRef, useState } from 'react';

import type {
  ComposeCanvasVideoParams,
  ComposeCanvasVideoResult,
} from '../application/composeCanvasVideo';
import {
  buildComposePayload,
  hasExportableClips,
  hasOverlappingVideoClips,
  type ComposeTimelineState,
} from '../domain/videoComposeTimeline';
import type { CanvasVideoComposeResolution } from '../domain/videoCompose';

export type VideoComposeExportTarget = 'local' | 'canvas';
export type VideoComposeExportUrlResolver = (url: string) => string | null;

export type VideoComposeExportUploadAsset = (
  project: string,
  asset: Blob,
  filename: string,
  options: { disableTimeout: true },
) => Promise<{ url: string }>;

export type VideoComposeExportComposeVideo = (
  params: ComposeCanvasVideoParams,
) => Promise<ComposeCanvasVideoResult>;

export type VideoComposeExportFetchBlob = (
  url: string,
  resolveUrl: VideoComposeExportUrlResolver,
) => Promise<Blob>;

export type VideoComposeExportDownloadBlob = (
  blob: Blob,
  fileName: string,
) => void;

export type VideoComposeExportResolveFileName = (url: string) => string;

export interface VideoComposeExportControllerOptions {
  project: string;
  canvasId: string;
  timeline: ComposeTimelineState;
  onComposed: (url: string, coverUrl: string | null) => void;
  overlapErrorMessage: string;
  missingUrlErrorMessage: string;
  resolveMediaUrl: VideoComposeExportUrlResolver;
}

export function createUseVideoComposeExportController({
  uploadAsset,
  composeVideo,
  fetchResultBlob,
  downloadBlob,
  resolveResultFileName,
}: {
  uploadAsset: VideoComposeExportUploadAsset;
  composeVideo: VideoComposeExportComposeVideo;
  fetchResultBlob: VideoComposeExportFetchBlob;
  downloadBlob: VideoComposeExportDownloadBlob;
  resolveResultFileName: VideoComposeExportResolveFileName;
}) {
  return function useVideoComposeExportController({
    project,
    canvasId,
    timeline,
    onComposed,
    overlapErrorMessage,
    missingUrlErrorMessage,
    resolveMediaUrl,
  }: VideoComposeExportControllerOptions) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;

  const exportToLocal = useCallback(async (url: string) => {
    const blob = await fetchResultBlob(
      url,
      resolveMediaUrl,
    );
    downloadBlob(
      blob,
      resolveResultFileName(url),
    );
  }, [resolveMediaUrl]);

  const exportToCanvas = useCallback(
    async (url: string) => {
      const blob = await fetchResultBlob(
        url,
        resolveMediaUrl,
      );
      const uploaded = await uploadAsset(
        project,
        blob,
        resolveResultFileName(url),
        { disableTimeout: true },
      );
      onComposed(uploaded.url, timelineRef.current.cover?.url ?? null);
    },
    [onComposed, project, resolveMediaUrl],
  );

  const runExport = useCallback(
    async (
      target: VideoComposeExportTarget,
      resolution: CanvasVideoComposeResolution,
    ) => {
      if (isExporting || !hasExportableClips(timeline)) return;
      if (hasOverlappingVideoClips(timeline)) {
        setExportError(overlapErrorMessage);
        return;
      }
      setIsExporting(true);
      setExportError(null);
      try {
        const { url } = await composeVideo({
          projectId: project,
          request: buildComposePayload(
            { ...timeline, resolution },
            { canvasId, fps: 30 },
          ),
        });
        if (!url) {
          setExportError(missingUrlErrorMessage);
          return;
        }
        if (target === 'local') {
          await exportToLocal(url);
        } else {
          await exportToCanvas(url);
        }
      } catch (error) {
        setExportError(error instanceof Error ? error.message : String(error));
      } finally {
        setIsExporting(false);
      }
    },
    [
      canvasId,
      exportToCanvas,
      exportToLocal,
      isExporting,
      missingUrlErrorMessage,
      overlapErrorMessage,
      project,
      timeline,
    ],
  );

  return { isExporting, exportError, runExport };
  };
}

export type VideoComposeExportController = ReturnType<
  ReturnType<typeof createUseVideoComposeExportController>
>;
