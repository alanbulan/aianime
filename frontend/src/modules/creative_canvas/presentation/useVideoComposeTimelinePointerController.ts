// Copyright (c) 2026 AI anime
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

import {
  createVideoComposeClipDragSession,
  createVideoComposeTrimDragSession,
  projectVideoComposeClipDrag,
  projectVideoComposeTrimDrag,
  snapVideoComposePlayhead,
} from "../domain/videoComposeTimelineGestures";
import type {
  VideoComposeClipReference,
  VideoComposeTimelineEdit,
} from "../domain/videoComposeTimelineEdits";
import type {
  ComposeClip,
  ComposeTimelineState,
  ComposeTrack,
  ComposeTrackKind,
} from "../domain/videoComposeTimeline";

export interface VideoComposePointerDragGhost {
  clipId: string;
  trackId: string;
  /** 跟随指针的幽灵副本左缘（px，相对所在轨道的内容区）。 */
  ghostLeftPx: number;
}

export interface VideoComposePointerTrimEdit {
  clipId: string;
  edge: "start" | "end";
}

export interface UseVideoComposeTimelinePointerControllerOptions {
  timelineRef: RefObject<ComposeTimelineState>;
  pxPerMsRef: RefObject<number>;
  snapEnabledRef: RefObject<boolean>;
  trackScrollRef: RefObject<HTMLDivElement | null>;
  createTrackId: () => string;
  updateTimelineTracks: (tracks: ComposeTrack[]) => void;
  applyTimelineEdit: (edit: VideoComposeTimelineEdit) => void;
  pushHistory: () => void;
  selectOnly: (reference: VideoComposeClipReference | null) => void;
  toggleInSelection: (reference: VideoComposeClipReference) => void;
  seek: (playheadMs: number) => void;
}

export function useVideoComposeTimelinePointerController({
  timelineRef,
  pxPerMsRef,
  snapEnabledRef,
  trackScrollRef,
  createTrackId,
  updateTimelineTracks,
  applyTimelineEdit,
  pushHistory,
  selectOnly,
  toggleInSelection,
  seek,
}: UseVideoComposeTimelinePointerControllerOptions) {
  const [dragGhost, setDragGhost] =
    useState<VideoComposePointerDragGhost | null>(null);
  const [trimEdit, setTrimEdit] =
    useState<VideoComposePointerTrimEdit | null>(null);

  // 同一时刻只允许一个片段移动、裁剪或 scrub 会话；卸载时清理全局监听。
  const activeDragCleanupRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      activeDragCleanupRef.current?.();
      activeDragCleanupRef.current = null;
    },
    [],
  );

  const resolveDropTrack = useCallback(
    (
      kind: ComposeTrackKind,
      clientY: number,
    ): { trackId: string } | "new" | null => {
      const rows = Array.from(
        document.querySelectorAll<HTMLElement>("[data-compose-track-id]"),
      )
        .filter((element) => element.dataset.composeTrackKind === kind)
        .map((element) => ({
          id: element.dataset.composeTrackId as string,
          rect: element.getBoundingClientRect(),
        }))
        .sort((left, right) => left.rect.top - right.rect.top);
      if (rows.length === 0) return null;
      for (const row of rows) {
        if (clientY >= row.rect.top && clientY <= row.rect.bottom) {
          return { trackId: row.id };
        }
      }
      const last = rows[rows.length - 1];
      return clientY > last.rect.bottom ? "new" : null;
    },
    [],
  );

  const startClipMove = useCallback(
    (event: ReactPointerEvent, track: ComposeTrack, clip: ComposeClip) => {
      event.stopPropagation();
      event.preventDefault();
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        toggleInSelection({ trackId: track.id, clipId: clip.id });
        return;
      }
      if (activeDragCleanupRef.current) return;
      const dragSession = createVideoComposeClipDragSession(
        timelineRef.current,
        { trackId: track.id, clipId: clip.id },
      );
      if (!dragSession) return;
      selectOnly({ trackId: track.id, clipId: clip.id });
      const startX = event.clientX;
      const startY = event.clientY;
      const { clipId, kind } = dragSession;
      let currentTrackId = track.id;
      let autoCreatedTrackId: string | null = null;
      let moved = false;
      let rafId = 0;
      let latest = { x: startX, y: startY };

      const apply = () => {
        rafId = 0;
        const { x: clientX, y: clientY } = latest;
        const snapshot = timelineRef.current;
        const drop = resolveDropTrack(kind, clientY);
        const previousAutoCreatedTrackId = autoCreatedTrackId;
        const createdTrackId =
          drop === "new" && !previousAutoCreatedTrackId
            ? createTrackId()
            : null;
        let destinationTrackId = currentTrackId;
        if (drop === "new") {
          const createdOrExistingId =
            previousAutoCreatedTrackId ?? createdTrackId;
          if (!createdOrExistingId) return;
          destinationTrackId = createdOrExistingId;
        } else if (drop) {
          destinationTrackId = drop.trackId;
        }

        const projection = projectVideoComposeClipDrag({
          state: snapshot,
          session: dragSession,
          destinationTrackId,
          createdTrackId,
          previousAutoCreatedTrackId,
          deltaMs: (clientX - startX) / pxPerMsRef.current,
          pxPerMs: pxPerMsRef.current,
          snapEnabled: snapEnabledRef.current,
        });
        if (!projection) return;
        if (projection.status === "blocked") {
          setDragGhost(null);
          return;
        }
        updateTimelineTracks(projection.timeline.tracks);
        if (projection.magnetic) {
          setDragGhost({
            clipId,
            trackId: projection.targetTrackId,
            ghostLeftPx: Math.max(
              0,
              dragSession.originalTimelineStartMs * pxPerMsRef.current +
                (clientX - startX),
            ),
          });
        } else {
          setDragGhost(null);
        }
        autoCreatedTrackId = projection.autoCreatedTrackId;
        currentTrackId = projection.targetTrackId;
      };

      const onMove = (moveEvent: PointerEvent) => {
        if (
          !moved &&
          Math.hypot(
            moveEvent.clientX - startX,
            moveEvent.clientY - startY,
          ) < 4
        ) {
          return;
        }
        if (!moved) {
          moved = true;
          pushHistory();
        }
        latest = { x: moveEvent.clientX, y: moveEvent.clientY };
        if (!rafId) rafId = requestAnimationFrame(apply);
      };
      const end = () => {
        if (rafId) cancelAnimationFrame(rafId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        activeDragCleanupRef.current = null;
        setDragGhost(null);
        if (!moved) return;
        applyTimelineEdit({ type: "cleanupEmptyTracks" });
        selectOnly({ trackId: currentTrackId, clipId });
      };
      activeDragCleanupRef.current = end;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [
      applyTimelineEdit,
      createTrackId,
      pxPerMsRef,
      pushHistory,
      resolveDropTrack,
      selectOnly,
      snapEnabledRef,
      timelineRef,
      toggleInSelection,
      updateTimelineTracks,
    ],
  );

  const startTrim = useCallback(
    (
      event: ReactPointerEvent,
      track: ComposeTrack,
      clip: ComposeClip,
      edge: "start" | "end",
    ) => {
      event.stopPropagation();
      event.preventDefault();
      if (activeDragCleanupRef.current) return;
      const trimSession = createVideoComposeTrimDragSession(
        timelineRef.current,
        { trackId: track.id, clipId: clip.id },
      );
      if (!trimSession) return;
      selectOnly({ trackId: track.id, clipId: clip.id });
      setTrimEdit({ clipId: clip.id, edge });
      pushHistory();
      const startX = event.clientX;
      const onMove = (moveEvent: PointerEvent) => {
        applyTimelineEdit({
          type: "updateClip",
          target: trimSession.target,
          patch: projectVideoComposeTrimDrag(trimSession, {
            edge,
            deltaTimelineMs:
              (moveEvent.clientX - startX) / pxPerMsRef.current,
            snapEnabled: snapEnabledRef.current,
          }),
        });
      };
      const end = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        activeDragCleanupRef.current = null;
        setTrimEdit(null);
        applyTimelineEdit({ type: "compactMainVideoTrack" });
      };
      activeDragCleanupRef.current = end;
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
    },
    [
      applyTimelineEdit,
      pxPerMsRef,
      pushHistory,
      selectOnly,
      snapEnabledRef,
      timelineRef,
    ],
  );

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const container = trackScrollRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = clientX - rect.left + container.scrollLeft;
      seek(
        snapVideoComposePlayhead({
          state: timelineRef.current,
          playheadMs: x / pxPerMsRef.current,
          pxPerMs: pxPerMsRef.current,
          enabled: snapEnabledRef.current,
        }),
      );
    },
    [pxPerMsRef, seek, snapEnabledRef, timelineRef, trackScrollRef],
  );

  const startScrub = useCallback(
    (event: ReactPointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (activeDragCleanupRef.current) return;
      const element = event.currentTarget as HTMLElement;
      const pointerId = event.pointerId;
      try {
        element.setPointerCapture(pointerId);
      } catch {
        // Pointer capture is unavailable for detached or already released targets.
      }
      seekFromClientX(event.clientX);
      let latestX = event.clientX;
      let rafId = 0;
      const pump = () => {
        rafId = 0;
        seekFromClientX(latestX);
      };
      const onMove = (moveEvent: PointerEvent) => {
        latestX = moveEvent.clientX;
        if (!rafId) rafId = requestAnimationFrame(pump);
      };
      const end = () => {
        if (rafId) cancelAnimationFrame(rafId);
        element.removeEventListener("pointermove", onMove);
        element.removeEventListener("pointerup", end);
        element.removeEventListener("pointercancel", end);
        try {
          element.releasePointerCapture(pointerId);
        } catch {
          // Pointer capture may already have been released by the browser.
        }
        activeDragCleanupRef.current = null;
        seekFromClientX(latestX);
      };
      activeDragCleanupRef.current = end;
      element.addEventListener("pointermove", onMove);
      element.addEventListener("pointerup", end);
      element.addEventListener("pointercancel", end);
    },
    [seekFromClientX],
  );

  return { dragGhost, trimEdit, startClipMove, startTrim, startScrub };
}
