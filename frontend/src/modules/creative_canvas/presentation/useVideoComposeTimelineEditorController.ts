// Copyright (c) 2026 AI anime
import {
  useCallback,
  useMemo,
  useRef,
  type RefObject,
} from "react";

import {
  resolveVideoComposeClipSelection,
  type VideoComposeClipReference,
  type VideoComposeTimelineEdit,
} from "../domain/videoComposeTimelineEdits";
import {
  sourceSpanMs,
  type ComposeClip,
  type ComposeTimelineState,
  type ComposeTrack,
} from "../domain/videoComposeTimeline";

export interface UseVideoComposeTimelineEditorControllerOptions {
  timeline: ComposeTimelineState;
  timelineRef: RefObject<ComposeTimelineState>;
  selected: VideoComposeClipReference | null;
  selectedIds: ReadonlySet<string>;
  playheadMs: number;
  videoTrack: ComposeTrack | null;
  audioTrack: ComposeTrack | null;
  createClipId: () => string;
  createTrackId: () => string;
  applyTimelineEdit: (edit: VideoComposeTimelineEdit) => void;
  pushHistory: () => void;
  selectOnly: (reference: VideoComposeClipReference | null) => void;
  clearSelection: () => void;
  removeFromSelection: (clipId: string) => void;
}

export function useVideoComposeTimelineEditorController({
  timeline,
  timelineRef,
  selected,
  selectedIds,
  playheadMs,
  videoTrack,
  audioTrack,
  createClipId,
  createTrackId,
  applyTimelineEdit,
  pushHistory,
  selectOnly,
  clearSelection,
  removeFromSelection,
}: UseVideoComposeTimelineEditorControllerOptions) {
  const clipboardRef = useRef<ComposeClip | null>(null);
  const selectedClip = useMemo(
    () => resolveVideoComposeClipSelection(timeline, selected, playheadMs),
    [playheadMs, selected, timeline],
  );
  const selectedSourceMs = selectedClip?.sourceMsAtPlayhead ?? null;
  const canSplitInside = selectedClip?.canSplitAtPlayhead ?? false;

  const moveToNewTrack = useCallback(
    (trackId: string, clipId: string) => {
      const sourceTrack = timelineRef.current.tracks.find(
        (track) => track.id === trackId,
      );
      const clip = sourceTrack?.clips.find((entry) => entry.id === clipId);
      if (!sourceTrack || !clip) return;
      const newTrackId = createTrackId();
      pushHistory();
      applyTimelineEdit({
        type: "moveClipToNewTrack",
        target: { trackId, clipId },
        newTrackId,
      });
      selectOnly({ trackId: newTrackId, clipId });
    },
    [applyTimelineEdit, createTrackId, pushHistory, selectOnly, timelineRef],
  );

  const removeClip = useCallback(
    (trackId: string, clipId: string) => {
      pushHistory();
      applyTimelineEdit({
        type: "removeClip",
        target: { trackId, clipId },
      });
      removeFromSelection(clipId);
    },
    [applyTimelineEdit, pushHistory, removeFromSelection],
  );

  const splitSelected = useCallback(() => {
    if (!selectedClip || selectedSourceMs == null || !canSplitInside) return;
    const leftClipId = createClipId();
    const rightClipId = createClipId();
    pushHistory();
    applyTimelineEdit({
      type: "splitClip",
      target: {
        trackId: selectedClip.track.id,
        clipId: selectedClip.clip.id,
      },
      sourceMs: selectedSourceMs,
      leftClipId,
      rightClipId,
    });
    selectOnly({ trackId: selectedClip.track.id, clipId: leftClipId });
  }, [
    applyTimelineEdit,
    canSplitInside,
    createClipId,
    pushHistory,
    selectOnly,
    selectedClip,
    selectedSourceMs,
  ]);

  const trimSelectedToPlayhead = useCallback(
    (side: "left" | "right") => {
      if (!selectedClip || !canSplitInside) return;
      pushHistory();
      applyTimelineEdit({
        type: "trimClipToPlayhead",
        target: {
          trackId: selectedClip.track.id,
          clipId: selectedClip.clip.id,
        },
        playheadMs,
        side,
      });
    },
    [
      applyTimelineEdit,
      canSplitInside,
      playheadMs,
      pushHistory,
      selectedClip,
    ],
  );

  const setSelectedSpeed = useCallback(
    (speed: number) => {
      if (!selectedClip) return;
      pushHistory();
      applyTimelineEdit({
        type: "setClipSpeed",
        target: {
          trackId: selectedClip.track.id,
          clipId: selectedClip.clip.id,
        },
        speed,
      });
    },
    [applyTimelineEdit, pushHistory, selectedClip],
  );

  // Volume changes are grouped by the popover's injected gesture-start history.
  const setSelectedVolume = useCallback(
    (volume: number) => {
      if (!selectedClip) return;
      applyTimelineEdit({
        type: "setClipVolume",
        target: {
          trackId: selectedClip.track.id,
          clipId: selectedClip.clip.id,
        },
        volume,
      });
    },
    [applyTimelineEdit, selectedClip],
  );

  const toggleSelectedMute = useCallback(() => {
    if (!selectedClip) return;
    pushHistory();
    applyTimelineEdit({
      type: "toggleClipMute",
      target: {
        trackId: selectedClip.track.id,
        clipId: selectedClip.clip.id,
      },
    });
  }, [applyTimelineEdit, pushHistory, selectedClip]);

  const setClipMuted = useCallback(
    (trackId: string, clipId: string, muted: boolean) => {
      pushHistory();
      applyTimelineEdit({
        type: "updateClip",
        target: { trackId, clipId },
        patch: { muted },
      });
    },
    [applyTimelineEdit, pushHistory],
  );

  const insertDuplicate = useCallback(
    (sourceClip: ComposeClip, trackId: string, afterClipId: string | null) => {
      const copyClipId = createClipId();
      pushHistory();
      applyTimelineEdit({
        type: "insertClipCopy",
        sourceClip,
        targetTrackId: trackId,
        afterClipId,
        copyClipId,
      });
      selectOnly({ trackId, clipId: copyClipId });
    },
    [applyTimelineEdit, createClipId, pushHistory, selectOnly],
  );

  const duplicateSelected = useCallback(() => {
    if (!selectedClip) return;
    insertDuplicate(
      selectedClip.clip,
      selectedClip.track.id,
      selectedClip.clip.id,
    );
  }, [insertDuplicate, selectedClip]);

  const copySelected = useCallback(() => {
    if (!selectedClip) return;
    clipboardRef.current = { ...selectedClip.clip };
  }, [selectedClip]);

  const pasteClipboard = useCallback(() => {
    const sourceClip = clipboardRef.current;
    if (!sourceClip) return;
    const targetTrackId =
      sourceClip.kind === "video" ? videoTrack?.id : audioTrack?.id;
    if (!targetTrackId) return;
    const afterClipId =
      selectedClip && selectedClip.track.id === targetTrackId
        ? selectedClip.clip.id
        : null;
    insertDuplicate(sourceClip, targetTrackId, afterClipId);
  }, [audioTrack, insertDuplicate, selectedClip, videoTrack]);

  const removeSelected = useCallback(() => {
    const clipIds = new Set(selectedIds);
    if (selected) clipIds.add(selected.clipId);
    if (clipIds.size === 0) return;
    pushHistory();
    applyTimelineEdit({ type: "removeClips", clipIds });
    clearSelection();
  }, [applyTimelineEdit, clearSelection, pushHistory, selected, selectedIds]);

  return {
    selectedClip,
    canSplitInside,
    selectedSpeed: selectedClip?.clip.speed ?? 1,
    selectedSourceSpanMs: selectedClip ? sourceSpanMs(selectedClip.clip) : 0,
    selectedVolume: selectedClip?.clip.volume ?? 1,
    selectedMuted: selectedClip?.clip.muted ?? false,
    moveToNewTrack,
    removeClip,
    splitSelected,
    trimSelectedToPlayhead,
    setSelectedSpeed,
    setSelectedVolume,
    toggleSelectedMute,
    setClipMuted,
    duplicateSelected,
    copySelected,
    pasteClipboard,
    removeSelected,
  };
}
