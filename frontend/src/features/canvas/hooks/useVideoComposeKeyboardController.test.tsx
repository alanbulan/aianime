// Copyright (c) 2026 AI anime
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  useVideoComposeKeyboardController,
  type UseVideoComposeKeyboardControllerOptions,
} from "./useVideoComposeKeyboardController";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function options(
  patch: Partial<UseVideoComposeKeyboardControllerOptions> = {},
): UseVideoComposeKeyboardControllerOptions {
  return {
    coverEditorOpen: false,
    exportMenuOpen: false,
    speedOpen: false,
    volumeOpen: false,
    exportDialogOpen: false,
    isExporting: false,
    setCoverEditorOpen: vi.fn(),
    setExportMenuOpen: vi.fn(),
    setSpeedOpen: vi.fn(),
    setVolumeOpen: vi.fn(),
    onClose: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    copySelected: vi.fn(),
    pasteClipboard: vi.fn(),
    duplicateSelected: vi.fn(),
    removeSelected: vi.fn(),
    togglePlayback: vi.fn(),
    playheadRef: { current: 500 },
    durationMs: 1000,
    seek: vi.fn(),
    ...patch,
  };
}

function dispatchKey(
  init: KeyboardEventInit,
  target: EventTarget = window,
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => target.dispatchEvent(event));
  return event;
}

describe("useVideoComposeKeyboardController", () => {
  it("closes overlays by priority before closing the modal", () => {
    const initial = options({
      coverEditorOpen: true,
      exportMenuOpen: true,
      speedOpen: true,
      volumeOpen: true,
    });
    const { rerender } = renderHook(
      (props: UseVideoComposeKeyboardControllerOptions) =>
        useVideoComposeKeyboardController(props),
      { initialProps: initial },
    );

    dispatchKey({ key: "Escape" });
    expect(initial.setCoverEditorOpen).toHaveBeenCalledWith(false);
    expect(initial.setExportMenuOpen).not.toHaveBeenCalled();

    rerender({ ...initial, coverEditorOpen: false });
    dispatchKey({ key: "Escape" });
    expect(initial.setExportMenuOpen).toHaveBeenCalledWith(false);

    rerender({
      ...initial,
      coverEditorOpen: false,
      exportMenuOpen: false,
    });
    dispatchKey({ key: "Escape" });
    expect(initial.setSpeedOpen).toHaveBeenCalledWith(false);

    rerender({
      ...initial,
      coverEditorOpen: false,
      exportMenuOpen: false,
      speedOpen: false,
    });
    dispatchKey({ key: "Escape" });
    expect(initial.setVolumeOpen).toHaveBeenCalledWith(false);

    rerender({
      ...initial,
      coverEditorOpen: false,
      exportMenuOpen: false,
      speedOpen: false,
      volumeOpen: false,
    });
    dispatchKey({ key: "Escape" });
    expect(initial.onClose).toHaveBeenCalledOnce();

    rerender({
      ...initial,
      coverEditorOpen: false,
      exportMenuOpen: false,
      speedOpen: false,
      volumeOpen: false,
      isExporting: true,
    });
    dispatchKey({ key: "Escape" });
    expect(initial.onClose).toHaveBeenCalledOnce();
  });

  it("maps editing shortcuts and clamps frame or second playhead steps", () => {
    const playheadRef = { current: 500 };
    const controls = options({ playheadRef });
    renderHook(() => useVideoComposeKeyboardController(controls));

    expect(dispatchKey({ key: "z", ctrlKey: true }).defaultPrevented).toBe(
      true,
    );
    dispatchKey({ key: "Z", metaKey: true, shiftKey: true });
    dispatchKey({ key: "y", ctrlKey: true });
    dispatchKey({ key: "c", metaKey: true });
    dispatchKey({ key: "V", ctrlKey: true });
    dispatchKey({ key: "d", ctrlKey: true });
    dispatchKey({ key: " " });
    dispatchKey({ key: "Delete" });

    expect(controls.undo).toHaveBeenCalledOnce();
    expect(controls.redo).toHaveBeenCalledTimes(2);
    expect(controls.copySelected).toHaveBeenCalledOnce();
    expect(controls.pasteClipboard).toHaveBeenCalledOnce();
    expect(controls.duplicateSelected).toHaveBeenCalledOnce();
    expect(controls.togglePlayback).toHaveBeenCalledOnce();
    expect(controls.removeSelected).toHaveBeenCalledOnce();

    dispatchKey({ key: "ArrowRight" });
    expect(controls.seek).toHaveBeenLastCalledWith(500 + 1000 / 30);
    dispatchKey({ key: "ArrowRight", shiftKey: true });
    expect(controls.seek).toHaveBeenLastCalledWith(1000);
    playheadRef.current = 10;
    dispatchKey({ key: "ArrowLeft" });
    expect(controls.seek).toHaveBeenLastCalledWith(0);

    const ignored = dispatchKey({ key: "x", ctrlKey: true });
    expect(ignored.defaultPrevented).toBe(false);
  });

  it("ignores editing shortcuts in typing targets and blocking overlays", () => {
    const controls = options();
    const { rerender } = renderHook(
      (props: UseVideoComposeKeyboardControllerOptions) =>
        useVideoComposeKeyboardController(props),
      { initialProps: controls },
    );
    const input = document.createElement("input");
    const editable = document.createElement("div");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    document.body.append(input, editable);

    dispatchKey({ key: "z", ctrlKey: true }, input);
    dispatchKey({ key: " " }, editable);
    expect(controls.undo).not.toHaveBeenCalled();
    expect(controls.togglePlayback).not.toHaveBeenCalled();

    rerender({ ...controls, exportDialogOpen: true });
    dispatchKey({ key: "Delete" });
    expect(controls.removeSelected).not.toHaveBeenCalled();

    rerender({ ...controls, coverEditorOpen: true });
    dispatchKey({ key: " " });
    expect(controls.togglePlayback).not.toHaveBeenCalled();

    rerender({ ...controls, isExporting: true });
    dispatchKey({ key: "v", ctrlKey: true });
    expect(controls.pasteClipboard).not.toHaveBeenCalled();
  });
});
