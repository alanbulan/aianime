// Copyright (c) 2026 AI anime
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createUseSingleBeatPanelController } from "@/modules/narrative_planning/application/use-single-beat-panel-controller";
import type { Beat } from "@/modules/narrative_planning/domain/types";
import type { PoolImage } from "@/modules/production/public";

const sketchImage: PoolImage = {
  id: "sketch-29",
  type: "sketch",
  mode: "1x1",
  grid_index: 1,
  cell_index: 0,
  row: 0,
  col: 0,
  original_beat: 29,
  cell_url: "/sketch.png",
  grid_url: "/sketch-grid.png",
  grid_path: "sketch-grid.png",
  stale: false,
};
const renderImage: PoolImage = {
  ...sketchImage,
  id: "render-29",
  type: "render",
  cell_url: "/render.png",
  grid_url: "/render-grid.png",
  grid_path: "render-grid.png",
};

const beat: Beat = {
  beat_number: 29,
  narration_segment: "旁白",
  visual_description: "画面",
  audio_url: "/audio.wav",
  sketch_url: "/sketch-current.png",
};

const onConfigureVoice = vi.fn();
const useSingleBeatPanelController = createUseSingleBeatPanelController(
  {
    useGridsByBeat: () => ({
      assignments: { "29": "render-29" },
      byBeat: new Map([[29, [sketchImage, renderImage]]]),
    }),
    useVideoBackends: () => ({
      data: {
        data: [
          {
            value: "seedance2",
            label: "Seedance 2",
            is_default: true,
            is_seedance2: true,
            dialogue_only: false,
          },
        ],
      },
    }),
  },
  {
    beatTextScope: (project, episode, beatNumber) =>
      `${project}:${episode}:${beatNumber}`,
    useAssetWorkspaceNavigation: () => onConfigureVoice,
    useSaveState: () => ({ status: "saved" }),
  },
);

describe("SingleBeatPanel controller", () => {
  it("projects media, save, backend, and section status", () => {
    const onDefaultBackendChange = vi.fn();
    const onToggleSection = vi.fn();
    const { result } = renderHook(() =>
      useSingleBeatPanelController({
        beat,
        defaultBackend: "seedance2",
        episode: 3,
        onDefaultBackendChange,
        onToggleSection,
        openSections: new Set(["text", "video"]),
        project: "demo",
        spineTemplate: "narrated",
        stages: { sketch: "missing", render: "missing" },
      }),
    );

    expect(result.current.beatTextScope).toBe("demo:3:29");
    expect(result.current.textSaveStatus).toBe("saved");
    expect(result.current.images).toEqual([sketchImage, renderImage]);
    expect(result.current.sections).toEqual([
      {
        id: "text",
        isOpen: true,
        ready: true,
        statusKey: "episode.beat.edited",
      },
      {
        id: "sketch",
        isOpen: false,
        ready: true,
        statusKey: "episode.beat.selected",
      },
      {
        id: "render",
        isOpen: false,
        ready: true,
        statusKey: "episode.beat.rendered",
      },
      {
        id: "audio",
        isOpen: false,
        ready: true,
        statusKey: "episode.beat.generated",
      },
      {
        id: "video",
        isOpen: true,
        ready: false,
        statusKey: "episode.beat.notGenerated",
      },
    ]);
    expect(result.current.videoBackends).toEqual([
      {
        dialogueOnly: false,
        isDefault: true,
        isSeedance2: true,
        label: "Seedance 2",
        value: "seedance2",
      },
    ]);
    expect(result.current.onDefaultBackendChange).toBe(
      onDefaultBackendChange,
    );
    expect(result.current.onToggleSection).toBe(onToggleSection);
    expect(result.current.onConfigureVoice).toBe(onConfigureVoice);
  });

  it("removes the standalone audio section for drama projects", () => {
    const { result } = renderHook(() =>
      useSingleBeatPanelController({
        beat,
        defaultBackend: "seedance2",
        episode: 3,
        onDefaultBackendChange: vi.fn(),
        onToggleSection: vi.fn(),
        openSections: new Set(),
        project: "demo",
        spineTemplate: "drama",
        stages: undefined,
      }),
    );

    expect(result.current.sections.map((section) => section.id)).toEqual([
      "text",
      "sketch",
      "render",
      "video",
    ]);
  });
});
