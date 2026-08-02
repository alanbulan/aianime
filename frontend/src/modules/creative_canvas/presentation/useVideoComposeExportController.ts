// Copyright (c) 2026 AI anime
import { useCallback, useRef, useState } from 'react';

import { uploadFreezoneAsset } from '../assetTransferComposition';
import {
  buildComposePayload,
  hasExportableClips,
  hasOverlappingVideoClips,
  type ComposeTimelineState,
} from '../domain/videoComposeTimeline';
import type { CanvasVideoComposeResolution } from '../domain/videoCompose';
import {
  downloadVideoComposeBlob,
  fetchVideoComposeResultBlob,
  resolveVideoComposeResultFileName,
  type VideoComposeExportUrlResolver,
} from '../infrastructure/browserVideoComposeExportRuntime';
import { composeCanvasVideo } from '../videoComposeComposition';

export type VideoComposeExportTarget = 'local' | 'canvas';

export interface VideoComposeExportControllerOptions {
  project: string;
  canvasId: string;
  timeline: ComposeTimelineState;
  onComposed: (url: string, coverUrl: string | null) => void;
  overlapErrorMessage: string;
  missingUrlErrorMessage: string;
  resolveMediaUrl: VideoComposeExportUrlResolver;
}

export function useVideoComposeExportController({
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
    const blob = await fetchVideoComposeResultBlob(
      url,
      resolveMediaUrl,
    );
    downloadVideoComposeBlob(
      blob,
      resolveVideoComposeResultFileName(url),
    );
  }, [resolveMediaUrl]);

  const exportToCanvas = useCallback(
    async (url: string) => {
      const blob = await fetchVideoComposeResultBlob(
        url,
        resolveMediaUrl,
      );
      const uploaded = await uploadFreezoneAsset(
        project,
        blob,
        resolveVideoComposeResultFileName(url),
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
        const { url } = await composeCanvasVideo({
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
}

export type VideoComposeExportController = ReturnType<
  typeof useVideoComposeExportController
>;
