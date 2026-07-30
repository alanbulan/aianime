// Copyright (c) 2026 AI anime
import { useCallback, useEffect, useRef, useState } from "react";

import { resolveImageDisplayUrl } from "@/features/canvas/application/imageData";
import {
  buildVideoComposeInitialTimeline,
  resolveVideoComposeInitialTimeline,
  type VideoComposeClipIdFactory,
} from "@/features/canvas/application/videoComposeTimelineSession";
import type { CanvasNode } from "@/features/canvas/domain/canvasNodes";
import {
  applyVideoComposeTimelineEdit,
  type VideoComposeClipReference,
  type VideoComposeTimelineEdit,
} from "@/features/canvas/domain/videoComposeTimelineEdits";
import type {
  ComposeCover,
  ComposeTimelineState,
  ComposeTrack,
} from "@/features/canvas/domain/videoComposeTimeline";
import { probeVideoComposeMediaDuration } from "@/features/canvas/infrastructure/browserVideoComposeMediaRuntime";

const VIDEO_COMPOSE_HISTORY_LIMIT = 50;

export interface UseVideoComposeTimelineSessionControllerOptions {
  initialTimeline?: ComposeTimelineState | null;
  sourceNodes: CanvasNode[];
  seedNodeIds: string[];
  onPersistDraft?: (timeline: ComposeTimelineState) => void;
  createClipId: VideoComposeClipIdFactory;
}

export function useVideoComposeTimelineSessionController({
  initialTimeline,
  sourceNodes,
  seedNodeIds,
  onPersistDraft,
  createClipId,
}: UseVideoComposeTimelineSessionControllerOptions) {
  const [timeline, setTimeline] = useState<ComposeTimelineState>(() =>
    resolveVideoComposeInitialTimeline({
      initialTimeline,
      nodes: sourceNodes,
      seedNodeIds,
      createClipId,
    }),
  );
  const [past, setPast] = useState<ComposeTimelineState[]>([]);
  const [future, setFuture] = useState<ComposeTimelineState[]>([]);
  const [selected, setSelected] =
    useState<VideoComposeClipReference | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const timelineRef = useRef(timeline);
  timelineRef.current = timeline;

  const selectOnly = useCallback(
    (reference: VideoComposeClipReference | null) => {
      setSelected(reference);
      setSelectedIds(
        reference ? new Set([reference.clipId]) : new Set<string>(),
      );
    },
    [],
  );

  const clearSelection = useCallback(() => {
    setSelected(null);
    setSelectedIds(new Set());
  }, []);

  const toggleInSelection = useCallback(
    (reference: VideoComposeClipReference) => {
      const removing = selectedIds.has(reference.clipId);
      setSelectedIds((previous) => {
        const next = new Set(previous);
        if (removing) next.delete(reference.clipId);
        else next.add(reference.clipId);
        return next;
      });
      if (removing) {
        setSelected((current) =>
          current?.clipId === reference.clipId ? null : current,
        );
      } else {
        setSelected(reference);
      }
    },
    [selectedIds],
  );

  const removeFromSelection = useCallback((clipId: string) => {
    setSelected((current) =>
      current?.clipId === clipId ? null : current,
    );
    setSelectedIds((previous) => {
      if (!previous.has(clipId)) return previous;
      const next = new Set(previous);
      next.delete(clipId);
      return next;
    });
  }, []);

  const pushHistory = useCallback(() => {
    setPast((previous) =>
      [...previous, timelineRef.current].slice(-VIDEO_COMPOSE_HISTORY_LIMIT),
    );
    setFuture([]);
  }, []);

  const undo = useCallback(() => {
    setPast((previous) => {
      if (previous.length === 0) return previous;
      const restored = previous[previous.length - 1];
      setFuture((next) => [timelineRef.current, ...next]);
      setTimeline(restored);
      return previous.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((previous) => {
      if (previous.length === 0) return previous;
      const restored = previous[0];
      setPast((next) =>
        [...next, timelineRef.current].slice(-VIDEO_COMPOSE_HISTORY_LIMIT),
      );
      setTimeline(restored);
      return previous.slice(1);
    });
  }, []);

  const applyTimelineEdit = useCallback((edit: VideoComposeTimelineEdit) => {
    setTimeline((previous) =>
      applyVideoComposeTimelineEdit(previous, edit),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    const pending = timeline.tracks.flatMap((track) =>
      track.clips
        .filter((clip) => clip.durationMs == null)
        .map((clip) => ({ trackId: track.id, clip, kind: track.kind })),
    );
    if (pending.length === 0) return;
    void Promise.all(
      pending.map(async ({ trackId, clip, kind }) => {
        const durationMs = await probeVideoComposeMediaDuration(
          clip.sourceUrl,
          kind,
          resolveImageDisplayUrl,
        );
        if (cancelled || durationMs == null) return;
        applyTimelineEdit({
          type: "resolveClipDuration",
          target: { trackId, clipId: clip.id },
          durationMs,
        });
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [
    applyTimelineEdit,
    timeline.tracks
      .flatMap((track) =>
        track.clips.map((clip) => `${clip.id}:${clip.durationMs == null}`),
      )
      .join(","),
  ]);

  const onPersistDraftRef = useRef(onPersistDraft);
  onPersistDraftRef.current = onPersistDraft;
  useEffect(
    () => () => {
      onPersistDraftRef.current?.(timelineRef.current);
    },
    [],
  );

  const applyCover = useCallback(
    (cover: ComposeCover) => {
      pushHistory();
      setTimeline((previous) => ({ ...previous, cover }));
    },
    [pushHistory],
  );

  const resetToUpstream = useCallback(() => {
    pushHistory();
    setTimeline(
      buildVideoComposeInitialTimeline(
        sourceNodes,
        seedNodeIds,
        createClipId,
      ),
    );
    clearSelection();
  }, [clearSelection, createClipId, pushHistory, seedNodeIds, sourceNodes]);

  const updateTimelineTracks = useCallback((tracks: ComposeTrack[]) => {
    setTimeline((previous) => ({ ...previous, tracks }));
  }, []);

  return {
    timeline,
    timelineRef,
    selected,
    selectedIds,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    selectOnly,
    clearSelection,
    toggleInSelection,
    removeFromSelection,
    pushHistory,
    undo,
    redo,
    applyTimelineEdit,
    applyCover,
    resetToUpstream,
    updateTimelineTracks,
  };
}
