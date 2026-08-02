// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { projectionScopedId } from "../domain/projectionGraphIds";
import { mergeProjectedCanvasWithLocalCanvas } from "./canvasProjectionGraph";

describe("freezone canvas projection graph", () => {
  const scoped = projectionScopedId;

  it("merges only the refreshed projection subgraph into the local canvas", () => {
    const localNodes = [
      {
        id: "group_a",
        type: "groupNode",
        position: { x: 10, y: 20 },
        data: { preset_managed: true, projection_key: "beat:1:4" },
      },
      {
        id: "node_a",
        type: "textAnnotationNode",
        position: { x: 1, y: 2 },
        data: { preset_managed: true, projection_key: "beat:1:4", content: "old" },
      },
      {
        id: "group_b",
        type: "groupNode",
        position: { x: 100, y: 200 },
        data: { preset_managed: true, projection_key: "beat:1:5" },
      },
      {
        id: "user_note",
        type: "textAnnotationNode",
        position: { x: 300, y: 400 },
        data: { user_spawned: true, content: "mine" },
      },
    ] as any[];
    const localEdges = [
      {
        id: "edge_a",
        source: "node_a",
        target: "group_a",
        data: { preset_managed: true, projection_key: "beat:1:4" },
      },
      {
        id: "edge_user",
        source: "user_note",
        target: "group_b",
        data: {},
      },
    ] as any[];
    const remoteNodes = [
      {
        id: "group_a",
        type: "groupNode",
        position: { x: 10, y: 20 },
        data: { preset_managed: true, projection_key: "beat:1:4" },
      },
      {
        id: "node_a",
        type: "textAnnotationNode",
        position: { x: 1, y: 2 },
        data: { preset_managed: true, projection_key: "beat:1:4", content: "new" },
      },
      {
        id: "unrelated_remote",
        type: "textAnnotationNode",
        position: { x: 0, y: 0 },
        data: { preset_managed: true, projection_key: "beat:1:6" },
      },
    ] as any[];
    const remoteEdges = [
      {
        id: "edge_a",
        source: "node_a",
        target: "group_a",
        data: { preset_managed: true, projection_key: "beat:1:4" },
      },
      {
        id: "edge_other_remote",
        source: "unrelated_remote",
        target: "group_a",
        data: { preset_managed: true, projection_key: "beat:1:6" },
      },
    ] as any[];

    const next = mergeProjectedCanvasWithLocalCanvas(
      remoteNodes,
      remoteEdges,
      localNodes,
      localEdges,
      "beat:1:4",
    );

    expect(next.nodes.map((node) => node.id)).toEqual([
      "group_b",
      "user_note",
      scoped("beat:1:4", "group_a"),
      scoped("beat:1:4", "node_a"),
    ]);
    expect(next.nodes.find((node) => node.id === scoped("beat:1:4", "node_a"))?.data).toMatchObject({
      content: "new",
    });
    expect(next.nodes.find((node) => node.id === "group_b")).toBe(localNodes[2]);
    expect(next.nodes.find((node) => node.id === "user_note")).toBe(localNodes[3]);
    expect(next.edges.map((edge) => edge.id)).toEqual(["edge_user", scoped("beat:1:4", "edge_a")]);
  });

  it("keeps projection group descendants when only the group carries projection ownership", () => {
    const remoteNodes = [
      {
        id: "projection_group_beat_1_9",
        type: "groupNode",
        position: { x: 100, y: 200 },
        data: { preset_managed: true, projection_key: "beat:1:9" },
      },
      {
        id: "context_beat",
        type: "beatContextNode",
        parentId: "projection_group_beat_1_9",
        position: { x: 24, y: 48 },
        data: { content: "beat context" },
      },
      {
        id: "prompt_beat_visual",
        type: "textAnnotationNode",
        parentId: "projection_group_beat_1_9",
        position: { x: 240, y: 48 },
        data: { content: "visual prompt" },
      },
    ] as any[];
    const remoteEdges = [
      {
        id: "edge_context_prompt",
        source: "context_beat",
        target: "prompt_beat_visual",
        data: {},
      },
    ] as any[];

    const next = mergeProjectedCanvasWithLocalCanvas(
      remoteNodes,
      remoteEdges,
      [],
      [],
      "beat:1:9",
    );

    expect(next.nodes.map((node) => node.id)).toEqual([
      scoped("beat:1:9", "projection_group_beat_1_9"),
      scoped("beat:1:9", "context_beat"),
      scoped("beat:1:9", "prompt_beat_visual"),
    ]);
    expect(next.nodes.find((node) => node.id === scoped("beat:1:9", "context_beat"))).toMatchObject({
      parentId: scoped("beat:1:9", "projection_group_beat_1_9"),
      data: {
        content: "beat context",
        projection_key: "beat:1:9",
      },
    });
    expect(next.edges).toEqual([
      expect.objectContaining({
        id: scoped("beat:1:9", "edge_context_prompt"),
        source: scoped("beat:1:9", "context_beat"),
        target: scoped("beat:1:9", "prompt_beat_visual"),
        data: { projection_key: "beat:1:9" },
      }),
    ]);
  });

  it("treats projection_key as projection ownership without requiring preset_managed", () => {
    const localNodes = [
      {
        id: "node_a",
        type: "textAnnotationNode",
        position: { x: 1, y: 2 },
        data: { projection_key: "beat:1:4", content: "old" },
      },
      {
        id: "user_note",
        type: "textAnnotationNode",
        position: { x: 300, y: 400 },
        data: { user_spawned: true, projection_key: "beat:1:4", content: "mine" },
      },
    ] as any[];
    const localEdges = [
      {
        id: "edge_a",
        source: "node_a",
        target: "user_note",
        data: { projection_key: "beat:1:4" },
      },
    ] as any[];
    const remoteNodes = [
      {
        id: "node_a",
        type: "textAnnotationNode",
        position: { x: 10, y: 20 },
        data: { projection_key: "beat:1:4", content: "new" },
      },
    ] as any[];
    const remoteEdges = [
      {
        id: "edge_a",
        source: "node_a",
        target: "user_note",
        data: { projection_key: "beat:1:4" },
      },
    ] as any[];

    const next = mergeProjectedCanvasWithLocalCanvas(
      remoteNodes,
      remoteEdges,
      localNodes,
      localEdges,
      "beat:1:4",
    );

    expect(next.nodes.find((node) => node.id === scoped("beat:1:4", "node_a"))?.data).toMatchObject({
      content: "new",
    });
    expect(next.nodes.find((node) => node.id === "user_note")).toBe(localNodes[1]);
    expect(next.edges.map((edge) => edge.id)).toEqual([scoped("beat:1:4", "edge_a")]);
  });

  it("keeps parent projection groups before projected children when merging new remote nodes", () => {
    const remoteNodes = [
      {
        id: "child_projection",
        type: "imageEditNode",
        parentId: "group_projection",
        extent: "parent",
        position: { x: 20, y: 30 },
        data: { projection_key: "beat:1:4", imageUrl: "child.png" },
      },
      {
        id: "group_projection",
        type: "groupNode",
        position: { x: 100, y: 200 },
        data: { projection_key: "beat:1:4", label: "EP1/B4" },
      },
    ] as any[];

    const next = mergeProjectedCanvasWithLocalCanvas(
      remoteNodes,
      [],
      [],
      [],
      "beat:1:4",
    );

    expect(next.nodes.map((node) => node.id)).toEqual([
      scoped("beat:1:4", "group_projection"),
      scoped("beat:1:4", "child_projection"),
    ]);
  });

  it("keeps the local projection group layout when refreshing the same projection", () => {
    const localNodes = [
      {
        id: scoped("beat:1:4", "group_projection"),
        type: "groupNode",
        position: { x: 880, y: 640 },
        width: 720,
        height: 420,
        style: { width: 720, height: 420 },
        data: { projection_key: "beat:1:4", label: "old" },
      },
      {
        id: scoped("beat:1:4", "child_projection"),
        type: "textAnnotationNode",
        parentId: scoped("beat:1:4", "group_projection"),
        extent: "parent",
        position: { x: 44, y: 88 },
        data: { projection_key: "beat:1:4", content: "old child" },
      },
    ] as any[];
    const remoteNodes = [
      {
        id: "group_projection",
        type: "groupNode",
        position: { x: 100, y: 200 },
        width: 400,
        height: 260,
        style: { width: 400, height: 260 },
        data: { projection_key: "beat:1:4", label: "new" },
      },
      {
        id: "child_projection",
        type: "textAnnotationNode",
        parentId: "group_projection",
        extent: "parent",
        position: { x: 20, y: 30 },
        data: { projection_key: "beat:1:4", content: "new child" },
      },
    ] as any[];

    const next = mergeProjectedCanvasWithLocalCanvas(
      remoteNodes,
      [],
      localNodes,
      [],
      "beat:1:4",
    );

    const group = next.nodes.find((node) => node.id === scoped("beat:1:4", "group_projection"));
    const child = next.nodes.find((node) => node.id === scoped("beat:1:4", "child_projection"));
    expect(group).toMatchObject({
      position: { x: 880, y: 640 },
      width: 720,
      height: 420,
      style: { width: 720, height: 420 },
      data: { label: "new" },
    });
    expect(child).toMatchObject({
      parentId: scoped("beat:1:4", "group_projection"),
      extent: "parent",
      position: { x: 44, y: 88 },
      data: { content: "new child" },
    });
  });

  it("keeps separate beat projection groups when backend template ids repeat", () => {
    const localNodes = [
      {
        id: scoped("beat:1:6", "projection_group_beat_1_6"),
        type: "groupNode",
        position: { x: 100, y: 200 },
        data: { projection_key: "beat:1:6", label: "EP1/B6" },
      },
      {
        id: scoped("beat:1:6", "context_beat"),
        type: "beatContextNode",
        parentId: scoped("beat:1:6", "projection_group_beat_1_6"),
        extent: "parent",
        position: { x: 20, y: 30 },
        data: { projection_key: "beat:1:6", content: "beat 6" },
      },
      {
        id: scoped("beat:1:6", "skill_set_selected_background"),
        type: "skillNode",
        parentId: scoped("beat:1:6", "projection_group_beat_1_6"),
        extent: "parent",
        position: { x: 240, y: 30 },
        data: { projection_key: "beat:1:6" },
      },
    ] as any[];
    const localEdges = [
      {
        id: scoped("beat:1:6", "edge_context_to_skill"),
        source: scoped("beat:1:6", "context_beat"),
        target: scoped("beat:1:6", "skill_set_selected_background"),
        data: { projection_key: "beat:1:6" },
      },
    ] as any[];
    const remoteNodes = [
      {
        id: "projection_group_beat_1_9",
        type: "groupNode",
        position: { x: 500, y: 200 },
        data: { projection_key: "beat:1:9", label: "EP1/B9" },
      },
      {
        id: "context_beat",
        type: "beatContextNode",
        parentId: "projection_group_beat_1_9",
        extent: "parent",
        position: { x: 20, y: 30 },
        data: { projection_key: "beat:1:9", content: "beat 9" },
      },
      {
        id: "skill_set_selected_background",
        type: "skillNode",
        parentId: "projection_group_beat_1_9",
        extent: "parent",
        position: { x: 240, y: 30 },
        data: { projection_key: "beat:1:9" },
      },
    ] as any[];
    const remoteEdges = [
      {
        id: "edge_context_to_skill",
        source: "context_beat",
        target: "skill_set_selected_background",
        data: { projection_key: "beat:1:9" },
      },
    ] as any[];

    const next = mergeProjectedCanvasWithLocalCanvas(
      remoteNodes,
      remoteEdges,
      localNodes,
      localEdges,
      "beat:1:9",
    );

    expect(next.nodes.map((node) => node.id)).toEqual([
      scoped("beat:1:6", "projection_group_beat_1_6"),
      scoped("beat:1:6", "context_beat"),
      scoped("beat:1:6", "skill_set_selected_background"),
      scoped("beat:1:9", "projection_group_beat_1_9"),
      scoped("beat:1:9", "context_beat"),
      scoped("beat:1:9", "skill_set_selected_background"),
    ]);
    expect(next.nodes.find((node) => node.id === scoped("beat:1:6", "context_beat"))?.data)
      .toMatchObject({ content: "beat 6" });
    expect(next.nodes.find((node) => node.id === scoped("beat:1:9", "context_beat"))?.data)
      .toMatchObject({ content: "beat 9" });
    expect(next.edges.map((edge) => edge.id)).toEqual([
      scoped("beat:1:6", "edge_context_to_skill"),
      scoped("beat:1:9", "edge_context_to_skill"),
    ]);
  });

  it("replaces stale unmarked local nodes when a refreshed projection reuses the same ids", () => {
    const localNodes = [
      {
        id: "context_beat",
        type: "beatContextNode",
        position: { x: 1, y: 2 },
        data: { content: "legacy local without projection key" },
      },
      {
        id: "user_note",
        type: "textAnnotationNode",
        position: { x: 300, y: 400 },
        data: { user_spawned: true, content: "mine" },
      },
    ] as any[];
    const localEdges = [
      {
        id: "edge_context",
        source: "context_beat",
        target: "user_note",
        data: {},
      },
    ] as any[];
    const remoteNodes = [
      {
        id: "context_beat",
        type: "beatContextNode",
        position: { x: 10, y: 20 },
        data: { projection_key: "beat:1:4", content: "fresh remote" },
      },
      {
        id: "skill_set_selected_background",
        type: "skillNode",
        position: { x: 30, y: 40 },
        data: { projection_key: "beat:1:4" },
      },
    ] as any[];
    const remoteEdges = [
      {
        id: "edge_context",
        source: "context_beat",
        target: "skill_set_selected_background",
        data: { projection_key: "beat:1:4" },
      },
    ] as any[];

    const next = mergeProjectedCanvasWithLocalCanvas(
      remoteNodes,
      remoteEdges,
      localNodes,
      localEdges,
      "beat:1:4",
    );

    expect(next.nodes.map((node) => node.id)).toEqual([
      "user_note",
      scoped("beat:1:4", "context_beat"),
      scoped("beat:1:4", "skill_set_selected_background"),
    ]);
    expect(next.nodes.filter((node) => node.id === scoped("beat:1:4", "context_beat"))).toHaveLength(1);
    expect(next.nodes.find((node) => node.id === scoped("beat:1:4", "context_beat"))?.data).toMatchObject({
      projection_key: "beat:1:4",
      content: "fresh remote",
    });
    expect(next.edges.map((edge) => edge.id)).toEqual([scoped("beat:1:4", "edge_context")]);
    expect(next.edges.find((edge) => edge.id === scoped("beat:1:4", "edge_context"))?.target).toBe(
      scoped("beat:1:4", "skill_set_selected_background"),
    );
  });

  it("keeps backend-archived projection nodes needed by user edges", () => {
    const localNodes = [
      {
        id: "old_projection_node",
        type: "textAnnotationNode",
        position: { x: 1, y: 2 },
        data: { preset_managed: true, projection_key: "beat:1:4", content: "old" },
      },
      {
        id: "user_note",
        type: "textAnnotationNode",
        position: { x: 300, y: 400 },
        data: { user_spawned: true, content: "mine" },
      },
    ] as any[];
    const localEdges = [
      {
        id: "edge_user_to_old_projection",
        source: "user_note",
        target: "old_projection_node",
        data: {},
      },
    ] as any[];
    const remoteNodes = [
      {
        id: "old_projection_node",
        type: "textAnnotationNode",
        position: { x: 1, y: 2 },
        data: {
          user_spawned: true,
          projection_archived: true,
          source_projection_key: "beat:1:4",
          content: "old",
        },
      },
      {
        id: "new_projection_node",
        type: "textAnnotationNode",
        position: { x: 10, y: 20 },
        data: { preset_managed: true, projection_key: "beat:1:4", content: "new" },
      },
    ] as any[];

    const next = mergeProjectedCanvasWithLocalCanvas(
      remoteNodes,
      [],
      localNodes,
      localEdges,
      "beat:1:4",
    );

    expect(next.nodes.map((node) => node.id)).toEqual([
      "user_note",
      scoped("beat:1:4", "old_projection_node"),
      scoped("beat:1:4", "new_projection_node"),
    ]);
    expect(next.nodes.find((node) => node.id === scoped("beat:1:4", "old_projection_node"))?.data).toMatchObject({
      projection_archived: true,
      source_projection_key: "beat:1:4",
      user_spawned: true,
    });
    expect(next.edges.map((edge) => edge.id)).toEqual(["edge_user_to_old_projection"]);
  });
});
