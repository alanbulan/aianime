// Copyright (c) 2026 AI anime
import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ComposeTimelineState } from "@/modules/creative_canvas/public";

import {
  VideoComposeModalView,
  type VideoComposeModalViewProps,
} from "./VideoComposeModalView";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("./VideoComposeTrackRow", () => ({
  VideoComposeTrackRow: ({
    track,
    onToggleMute,
  }: {
    track: { id: string };
    onToggleMute: (clipId: string, muted: boolean) => void;
  }) => (
    <button
      type="button"
      onClick={() => onToggleMute("clip-a", true)}
    >
      track:{track.id}
    </button>
  ),
}));

vi.mock("./VideoComposeTimelineControls", () => ({
  VideoComposeToolButton: ({
    label,
    onClick,
    disabled,
  }: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  ),
  VideoComposeToolDivider: () => <span aria-hidden>|</span>,
  VideoComposeSpeedPopover: ({
    onChange,
    onClose,
  }: {
    onChange: (value: number) => void;
    onClose: () => void;
  }) => (
    <div>
      <button type="button" onClick={() => onChange(2)}>change-speed</button>
      <button type="button" onClick={onClose}>close-speed</button>
    </div>
  ),
  VideoComposeVolumePopover: ({
    onChange,
    onGestureStart,
    onToggleMute,
    onClose,
  }: {
    onChange: (value: number) => void;
    onGestureStart: () => void;
    onToggleMute: () => void;
    onClose: () => void;
  }) => (
    <div>
      <button type="button" onClick={() => onChange(0.5)}>change-volume</button>
      <button type="button" onClick={onGestureStart}>start-volume</button>
      <button type="button" onClick={onToggleMute}>toggle-volume-mute</button>
      <button type="button" onClick={onClose}>close-volume</button>
    </div>
  ),
  VideoComposeZoomInGlyph: () => null,
  VideoComposeZoomOutGlyph: () => null,
}));

const TIMELINE: ComposeTimelineState = {
  resolution: "1080p",
  tracks: [{ id: "track_video", kind: "video", clips: [] }],
  cover: null,
};

function viewProps(): VideoComposeModalViewProps {
  return {
    timeline: TIMELINE,
    header: {
      coverDisplayUrl: null,
      canSetCover: true,
      onOpenCoverEditor: vi.fn(),
      onClose: vi.fn(),
    },
    exportPanel: {
      canExport: true,
      isExporting: false,
      error: null,
      menuOpen: false,
      dialog: { open: false, location: "local", resolution: "1080p" },
      onMenuOpenChange: vi.fn(),
      onOpenDialog: vi.fn(),
      onDialogLocationChange: vi.fn(),
      onDialogResolutionChange: vi.fn(),
      onCloseDialog: vi.fn(),
      onConfirmDialog: vi.fn(),
    },
    preview: {
      videoRef: createRef<HTMLVideoElement>(),
      audioRef: createRef<HTMLAudioElement>(),
      stageRef: createRef<HTMLDivElement>(),
      videoSource: null,
    },
    toolbar: {
      canUndo: true,
      canRedo: true,
      hasSelectedClip: true,
      canSplitInside: true,
      speedOpen: false,
      selectedSpeed: 1,
      selectedSourceSpanMs: 3000,
      volumeOpen: false,
      selectedVolume: 1,
      selectedMuted: false,
      playheadMs: 1000,
      durationMs: 3000,
      isPlaying: false,
      snapEnabled: true,
      pxPerSec: 80,
      minPxPerSec: 20,
      maxPxPerSec: 240,
      onUndo: vi.fn(),
      onRedo: vi.fn(),
      onSplit: vi.fn(),
      onTrimToPlayhead: vi.fn(),
      onSpeedOpenChange: vi.fn(),
      onSpeedChange: vi.fn(),
      onVolumeOpenChange: vi.fn(),
      onVolumeChange: vi.fn(),
      onVolumeGestureStart: vi.fn(),
      onToggleMute: vi.fn(),
      onDuplicate: vi.fn(),
      onRemoveSelected: vi.fn(),
      onTogglePlayback: vi.fn(),
      onResetToUpstream: vi.fn(),
      onSnapEnabledChange: vi.fn(),
      onZoomChange: vi.fn(),
      onZoomOut: vi.fn(),
      onZoomIn: vi.fn(),
      onFullscreenPlay: vi.fn(),
    },
    timelineSurface: {
      pxPerSec: 80,
      pxPerMs: 0.08,
      durationMs: 3000,
      selected: null,
      selectedIds: new Set(),
      overlapClipIds: new Set(),
      dragGhost: null,
      trimEdit: null,
      trackScrollRef: createRef<HTMLDivElement>(),
      playheadElRef: createRef<HTMLDivElement>(),
      onStartScrub: vi.fn(),
      onClearSelection: vi.fn(),
      onStartClipMove: vi.fn(),
      onTrim: vi.fn(),
      onMoveToNewTrack: vi.fn(),
      onRemoveClip: vi.fn(),
      onSetClipMuted: vi.fn(),
    },
    coverEditor: null,
  };
}

describe("VideoComposeModalView", () => {
  it("renders portal states and forwards header and export commands", () => {
    const props = viewProps();
    props.header.coverDisplayUrl = "/cover.png";
    props.exportPanel.error = "export failed";
    props.exportPanel.menuOpen = true;
    props.coverEditor = <div>cover-editor</div>;
    render(<VideoComposeModalView {...props} />);

    expect(screen.getByText("videoCompose.title")).toBeInTheDocument();
    expect(screen.getByRole("presentation")).toHaveAttribute(
      "src",
      "/cover.png",
    );
    expect(screen.getByText("videoCompose.emptyPreview")).toBeInTheDocument();
    expect(
      screen.getByText(/videoCompose\.error\.prefix/),
    ).toHaveTextContent("export failed");
    expect(screen.getByText("cover-editor")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "videoCompose.cover.button" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "common.close" }));
    fireEvent.click(
      screen.getByRole("button", { name: "videoCompose.exportToLocal" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "videoCompose.exportToCanvas" }),
    );
    const exportButton = screen.getByRole("button", {
      name: "videoCompose.export",
    });
    fireEvent.mouseEnter(exportButton.parentElement!);
    fireEvent.mouseLeave(exportButton.parentElement!);

    expect(props.header.onOpenCoverEditor).toHaveBeenCalledOnce();
    expect(props.header.onClose).toHaveBeenCalledOnce();
    expect(props.exportPanel.onOpenDialog).toHaveBeenNthCalledWith(1, "local");
    expect(props.exportPanel.onOpenDialog).toHaveBeenNthCalledWith(2, "canvas");
    expect(props.exportPanel.onMenuOpenChange).toHaveBeenNthCalledWith(1, true);
    expect(props.exportPanel.onMenuOpenChange).toHaveBeenNthCalledWith(2, false);
  });

  it("forwards export dialog field changes and confirmation", () => {
    const props = viewProps();
    props.exportPanel.dialog = {
      open: true,
      location: "local",
      resolution: "1080p",
    };
    render(<VideoComposeModalView {...props} />);

    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "canvas" } });
    fireEvent.change(selects[1], { target: { value: "720p" } });
    fireEvent.click(screen.getByRole("button", { name: "common.cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "common.confirm" }));

    expect(props.exportPanel.onDialogLocationChange).toHaveBeenCalledWith(
      "canvas",
    );
    expect(props.exportPanel.onDialogResolutionChange).toHaveBeenCalledWith(
      "720p",
    );
    expect(props.exportPanel.onCloseDialog).toHaveBeenCalledOnce();
    expect(props.exportPanel.onConfirmDialog).toHaveBeenCalledOnce();
  });

  it("forwards toolbar, zoom, playback, and track commands", () => {
    const props = viewProps();
    render(<VideoComposeModalView {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "videoCompose.undo" }));
    fireEvent.click(screen.getByRole("button", { name: "videoCompose.redo" }));
    fireEvent.click(screen.getByRole("button", { name: "videoCompose.split" }));
    fireEvent.click(
      screen.getByRole("button", { name: "videoCompose.splitLeft" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "videoCompose.splitRight" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "videoCompose.play" }));
    fireEvent.click(screen.getByRole("button", { name: "videoCompose.snap" }));
    fireEvent.change(screen.getByRole("slider"), {
      target: { value: "120" },
    });
    fireEvent.click(screen.getByText("track:track_video"));

    expect(props.toolbar.onUndo).toHaveBeenCalledOnce();
    expect(props.toolbar.onRedo).toHaveBeenCalledOnce();
    expect(props.toolbar.onSplit).toHaveBeenCalledOnce();
    expect(props.toolbar.onTrimToPlayhead).toHaveBeenNthCalledWith(1, "left");
    expect(props.toolbar.onTrimToPlayhead).toHaveBeenNthCalledWith(2, "right");
    expect(props.toolbar.onTogglePlayback).toHaveBeenCalledOnce();
    expect(props.toolbar.onSnapEnabledChange).toHaveBeenCalledWith(false);
    expect(props.toolbar.onZoomChange).toHaveBeenCalledWith(120);
    expect(props.timelineSurface.onSetClipMuted).toHaveBeenCalledWith(
      "track_video",
      "clip-a",
      true,
    );
  });
});
