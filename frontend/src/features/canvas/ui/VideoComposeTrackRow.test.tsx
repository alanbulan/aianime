// Copyright (c) 2026 AI anime
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  ComposeClip,
  ComposeTrack,
} from "@/modules/creative_canvas/public";

import {
  VideoComposeTrackRow,
  type VideoComposeTrackRowProps,
} from "./VideoComposeTrackRow";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/features/canvas/compose/filmstrip", () => ({
  getFilmstrip: vi.fn(() => new Promise(() => {})),
  pickFrame: vi.fn(() => null),
}));

vi.mock("@/features/canvas/compose/audioPeaks", () => ({
  getCachedAudioPeaks: vi.fn(() => null),
  loadAudioPeaks: vi.fn(() => Promise.resolve(new Float32Array())),
  PEAK_BUCKETS_PER_SEC: 100,
}));

function clip(patch: Partial<ComposeClip> = {}): ComposeClip {
  return {
    id: "clip-a",
    nodeId: null,
    kind: "video",
    sourceUrl: "/clip-a.mp4",
    displayName: "Clip A",
    thumbUrl: null,
    durationMs: 5000,
    timelineStartMs: 1000,
    trimStartMs: 0,
    trimEndMs: 2000,
    volume: 1,
    muted: false,
    speed: 1,
    ...patch,
  };
}

function track(clips: ComposeClip[]): ComposeTrack {
  return { id: "track_video", kind: "video", clips };
}

function baseProps(entry: ComposeTrack): VideoComposeTrackRowProps {
  return {
    track: entry,
    pxPerMs: 0.1,
    selectedClipId: null,
    selectedIds: new Set<string>(),
    overlapClipIds: new Set<string>(),
    draggingClipId: null,
    ghostLeftPx: null,
    trimmingClipId: null,
    trimEdge: null,
    onStartClipMove: vi.fn(),
    onTrim: vi.fn(),
    onMoveToNewTrack: vi.fn(),
    onRemove: vi.fn(),
    onToggleMute: vi.fn(),
  };
}

describe("VideoComposeTrackRow", () => {
  it("renders an empty track with its DOM drop contract", () => {
    const entry = track([]);
    const { container } = render(
      <VideoComposeTrackRow {...baseProps(entry)} />,
    );

    expect(screen.getByText("videoCompose.trackEmpty")).toBeInTheDocument();
    const row = container.querySelector("[data-compose-track-id]");
    expect(row).toHaveAttribute("data-compose-track-id", "track_video");
    expect(row).toHaveAttribute("data-compose-track-kind", "video");
  });

  it("forwards clip move, trim, mute, new-track, and remove commands", () => {
    const media = clip();
    const entry = track([media]);
    const props = baseProps(entry);
    props.selectedClipId = media.id;
    props.overlapClipIds = new Set([media.id]);
    const { container } = render(<VideoComposeTrackRow {...props} />);

    fireEvent.pointerDown(screen.getByTitle("videoCompose.error.overlap"));
    fireEvent.click(
      screen.getByRole("button", { name: "videoCompose.mute" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "videoCompose.moveToNewTrack" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "videoCompose.removeClip" }),
    );
    const trimHandles = container.querySelectorAll(
      '[class*="cursor-ew-resize"]',
    );
    fireEvent.pointerDown(trimHandles[0]);
    fireEvent.pointerDown(trimHandles[1]);

    expect(props.onStartClipMove).toHaveBeenCalledWith(
      expect.anything(),
      entry,
      media,
    );
    expect(props.onToggleMute).toHaveBeenCalledWith(media.id, true);
    expect(props.onMoveToNewTrack).toHaveBeenCalledWith(entry.id, media.id);
    expect(props.onRemove).toHaveBeenCalledWith(entry.id, media.id);
    expect(props.onTrim).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      entry,
      media,
      "start",
    );
    expect(props.onTrim).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      entry,
      media,
      "end",
    );
    expect(screen.getByText("videoCompose.clipLoading")).toBeInTheDocument();
  });
});
