// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import type { MainlineContext } from "../domain/mainlineContext";

import {
  buildNodeActionBeatContextData,
  isSameNodeActionBeatContext,
  resolveNodeActionBeatContext,
  type BeatContextActionNode,
  type NodeActionBeatContext,
} from "./nodeActionBeatContext";

function node(data: Record<string, unknown>): BeatContextActionNode {
  return {
    id: "node-a",
    data,
  };
}

describe("nodeActionBeatContext", () => {
  it("prefers explicit source context and applies the nearest project fallback", () => {
    const resolved = resolveNodeActionBeatContext(
      node({
        projectId: "node-project",
        __freezone_source: {
          projectId: "source-project",
          beat_context: {
            kind: "beat",
            episode: 2,
            beat: 7,
            label: "  source label  ",
          },
        },
        beat_context: {
          kind: "beat",
          projectId: "data-project",
          episode: 9,
          beat: 9,
        },
      }),
      "route-project",
    );

    expect(resolved).toMatchObject({
      kind: "beat",
      projectId: "source-project",
      episode: 2,
      beat: 7,
      role: "beat_context",
      label: "source label",
    });
  });

  it("keeps direct Beat context and converts a scoped media context", () => {
    const direct: MainlineContext = {
      kind: "beat",
      projectId: "project-a",
      episode: 1,
      beat: 3,
      label: "direct",
    };
    expect(
      resolveNodeActionBeatContext(
        node({ mainline_context: [direct] }),
      ),
    ).toBe(direct);

    const scoped = resolveNodeActionBeatContext(
      node({
        mainline_context: [
          {
            kind: "video",
            projectId: "project-a",
            episode: 1,
            beat: 4,
            sourceUrl: "/video.mp4",
            visualDescription: "wide shot",
          },
        ],
      }),
    );
    expect(scoped).toEqual(
      expect.objectContaining({
        kind: "beat",
        projectId: "project-a",
        episode: 1,
        beat: 4,
        role: "beat_context",
        label: "EP1 / Beat 4",
        visualDescription: "wide shot",
        sourceUrl: undefined,
      }),
    );
  });

  it("projects whitelisted source metadata and rejects unrelated sources", () => {
    const resolved = resolveNodeActionBeatContext(
      node({
        __freezone_source: {
          role: "current_video",
          episode: 5,
          beat: 6,
          meta: {
            visual_description: "close-up",
            narration_segment: "voice-over",
            scene_id: "scene-a",
            detected_identities: ["hero"],
            detected_props: ["key"],
            sketch_colors: { hero: "#fff" },
            prop_marker_colors: { key: "#000" },
          },
        },
      }),
      "route-project",
    );

    expect(resolved).toEqual({
      kind: "beat",
      projectId: "route-project",
      episode: 5,
      beat: 6,
      role: "beat_context",
      label: "EP5 / Beat 6",
      visualDescription: "close-up",
      narrationSegment: "voice-over",
      sceneId: "scene-a",
      detectedIdentities: ["hero"],
      detectedProps: ["key"],
      sketchColors: { hero: "#fff" },
      propMarkerColors: { key: "#000" },
    });
    expect(
      resolveNodeActionBeatContext(
        node({
          __freezone_source: {
            role: "unrelated",
            episode: 5,
            beat: 6,
          },
        }),
        "route-project",
      ),
    ).toBeNull();
  });

  it("builds Beat node data and compares its stable identity", () => {
    const context: NodeActionBeatContext = {
      kind: "beat",
      projectId: "project-a",
      episode: 3,
      beat: 8,
      visualDescription: "street at night",
      narrationSegment: "rain starts",
      sceneId: "street",
      detectedIdentities: ["hero"],
      detectedProps: ["umbrella"],
      sketchColors: { hero: "red" },
      propMarkerColors: { umbrella: "blue" },
    };

    expect(buildNodeActionBeatContextData(context)).toEqual({
      displayName: "镜头上下文 · EP3/B8",
      content:
        "Episode: 3\nBeat: 8\nVisual: street at night\nNarration: rain starts",
      projectId: "project-a",
      episode: 3,
      beat: 8,
      context_scope: "mainline",
      beat_context: undefined,
      snapshot: {
        visualDescription: "street at night",
        narrationSegment: "rain starts",
        sceneId: "street",
        detectedIdentities: ["hero"],
        detectedProps: ["umbrella"],
        sketchColors: { hero: "red" },
        propMarkerColors: { umbrella: "blue" },
      },
      mainline_context: [context],
      beat_edit_fields: {
        visual_description: "street at night",
        scene_id: "street",
        time_of_day: "",
        detected_identities: ["hero"],
        detected_props: ["umbrella"],
      },
    });
    expect(
      isSameNodeActionBeatContext(
        { kind: "beat", projectId: "project-a", episode: 3, beat: 8 },
        context,
      ),
    ).toBe(true);
    expect(
      isSameNodeActionBeatContext(
        { kind: "beat", projectId: "project-a", episode: 3, beat: 9 },
        context,
      ),
    ).toBe(false);
  });
});
