// Copyright (c) 2026 AI anime
import {
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

const VIDEO_COMPOSE_FRAME_MS = 1000 / 30;

type BooleanStateSetter = Dispatch<SetStateAction<boolean>>;

export interface UseVideoComposeKeyboardControllerOptions {
  coverEditorOpen: boolean;
  exportMenuOpen: boolean;
  speedOpen: boolean;
  volumeOpen: boolean;
  exportDialogOpen: boolean;
  isExporting: boolean;
  setCoverEditorOpen: BooleanStateSetter;
  setExportMenuOpen: BooleanStateSetter;
  setSpeedOpen: BooleanStateSetter;
  setVolumeOpen: BooleanStateSetter;
  onClose: () => void;
  undo: () => void;
  redo: () => void;
  copySelected: () => void;
  pasteClipboard: () => void;
  duplicateSelected: () => void;
  removeSelected: () => void;
  togglePlayback: () => void;
  playheadRef: RefObject<number>;
  durationMs: number;
  seek: (playheadMs: number) => void;
}

function isVideoComposeTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  return (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.tagName === "SELECT" ||
    element.isContentEditable
  );
}

export function useVideoComposeKeyboardController({
  coverEditorOpen,
  exportMenuOpen,
  speedOpen,
  volumeOpen,
  exportDialogOpen,
  isExporting,
  setCoverEditorOpen,
  setExportMenuOpen,
  setSpeedOpen,
  setVolumeOpen,
  onClose,
  undo,
  redo,
  copySelected,
  pasteClipboard,
  duplicateSelected,
  removeSelected,
  togglePlayback,
  playheadRef,
  durationMs,
  seek,
}: UseVideoComposeKeyboardControllerOptions): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (coverEditorOpen) setCoverEditorOpen(false);
      else if (exportMenuOpen) setExportMenuOpen(false);
      else if (speedOpen) setSpeedOpen(false);
      else if (volumeOpen) setVolumeOpen(false);
      else if (!isExporting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    coverEditorOpen,
    exportMenuOpen,
    isExporting,
    onClose,
    setCoverEditorOpen,
    setExportMenuOpen,
    setSpeedOpen,
    setVolumeOpen,
    speedOpen,
    volumeOpen,
  ]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        isExporting ||
        exportDialogOpen ||
        coverEditorOpen ||
        isVideoComposeTypingTarget(event.target)
      ) {
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key;

      if (mod && (key === "z" || key === "Z")) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && (key === "y" || key === "Y")) {
        event.preventDefault();
        redo();
        return;
      }
      if (mod && (key === "c" || key === "C")) {
        event.preventDefault();
        copySelected();
        return;
      }
      if (mod && (key === "v" || key === "V")) {
        event.preventDefault();
        pasteClipboard();
        return;
      }
      if (mod && (key === "d" || key === "D")) {
        event.preventDefault();
        duplicateSelected();
        return;
      }
      if (mod) return;

      if (key === " " || key === "Spacebar") {
        event.preventDefault();
        togglePlayback();
        return;
      }
      if (key === "Delete" || key === "Backspace") {
        event.preventDefault();
        removeSelected();
        return;
      }
      if (key === "ArrowLeft" || key === "ArrowRight") {
        event.preventDefault();
        const direction = key === "ArrowLeft" ? -1 : 1;
        const step = (event.shiftKey ? 1000 : VIDEO_COMPOSE_FRAME_MS) * direction;
        seek(Math.max(0, Math.min(playheadRef.current + step, durationMs)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    copySelected,
    coverEditorOpen,
    duplicateSelected,
    durationMs,
    exportDialogOpen,
    isExporting,
    pasteClipboard,
    playheadRef,
    redo,
    removeSelected,
    seek,
    togglePlayback,
    undo,
  ]);
}
