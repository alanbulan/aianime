// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  isPresetManagedEdge,
  isPresetManagedNode,
  isSystemManagedNodeData,
  mainlineNodeVisualState,
  nodeMainlineFlags,
  type MainlineNodeFlags,
} from "./mainlineNodeFlags";

describe("nodeMainlineFlags", () => {
  it("derives all persisted mainline markers without storing visual state", () => {
    expect(
      nodeMainlineFlags({
        data: {
          preset_managed: true,
          user_spawned: true,
          mainline_context: [{ kind: "beat" }],
          slot_target: { kind: "frame", episode: 1, beat: 2 },
          committed_slot_url: "/assets/frame.webp",
          committed_at: "2026-08-03T00:00:00Z",
        },
      }),
    ).toEqual({
      isPresetManaged: true,
      isUserSpawned: true,
      hasMainlineContext: true,
      hasSlotTarget: true,
      hasCommittedSlot: true,
      hasCommittedAt: true,
    });
  });

  it("rejects empty and non-canonical marker values", () => {
    expect(
      nodeMainlineFlags({
        data: {
          mainline_context: [],
          slot_target: { kind: "legacy_target" },
          committed_slot_url: "",
          committed_at: 1,
        },
      }),
    ).toEqual({
      isPresetManaged: false,
      isUserSpawned: false,
      hasMainlineContext: false,
      hasSlotTarget: false,
      hasCommittedSlot: false,
      hasCommittedAt: false,
    });
  });
});

describe("mainlineNodeVisualState", () => {
  const ordinaryFlags: MainlineNodeFlags = {
    isPresetManaged: false,
    isUserSpawned: false,
    hasMainlineContext: false,
    hasSlotTarget: false,
    hasCommittedSlot: false,
    hasCommittedAt: false,
  };

  it("prioritizes preset lock over candidate and context states", () => {
    expect(
      mainlineNodeVisualState({
        ...ordinaryFlags,
        isPresetManaged: true,
        isUserSpawned: true,
        hasSlotTarget: true,
        hasMainlineContext: true,
      }),
    ).toBe("preset_locked");
  });

  it("classifies uncommitted user candidates, context nodes, and ordinary nodes", () => {
    expect(
      mainlineNodeVisualState({
        ...ordinaryFlags,
        isUserSpawned: true,
        hasSlotTarget: true,
      }),
    ).toBe("candidate_pushable");
    expect(
      mainlineNodeVisualState({
        ...ordinaryFlags,
        hasMainlineContext: true,
      }),
    ).toBe("context_only");
    expect(mainlineNodeVisualState(ordinaryFlags)).toBe("ordinary");
  });

  it("does not keep a committed candidate in the pushable state", () => {
    expect(
      mainlineNodeVisualState({
        ...ordinaryFlags,
        isUserSpawned: true,
        hasSlotTarget: true,
        hasCommittedAt: true,
      }),
    ).toBe("ordinary");
  });
});

describe("isSystemManagedNodeData", () => {
  it("treats preset or projection nodes as system-managed", () => {
    expect(isSystemManagedNodeData({ preset_managed: true })).toBe(true);
    expect(isSystemManagedNodeData({ projection_key: "beat:1:4" })).toBe(true);
  });

  it("lets user_spawned override stale projection flags", () => {
    expect(
      isSystemManagedNodeData({
        user_spawned: true,
        preset_managed: true,
        projection_key: "beat:1:4",
      }),
    ).toBe(false);
  });

  it("does not grant system ownership to ordinary nodes", () => {
    expect(isSystemManagedNodeData({})).toBe(false);
    expect(isSystemManagedNodeData({ projection_key: "" })).toBe(false);
  });
});

describe("isPresetManagedNode", () => {
  it("does not lock no-reference sentinel nodes", () => {
    expect(
      isPresetManagedNode({
        data: {
          label: "__NO_PROP__",
          preset_managed: true,
          projection_key: "beat:1:4:prop:__NO_PROP__",
        },
      }),
    ).toBe(false);
    expect(
      isPresetManagedNode({
        data: {
          label: "__NO_CHARACTER__",
          preset_managed: true,
        },
      }),
    ).toBe(false);
  });
});

describe("isPresetManagedEdge", () => {
  it("treats preset or projection edges as system-managed", () => {
    expect(isPresetManagedEdge({ data: { preset_managed: true } })).toBe(true);
    expect(
      isPresetManagedEdge({ data: { projection_key: "beat:1:4" } }),
    ).toBe(true);
  });

  it("lets user_spawned override stale projection edge flags", () => {
    expect(
      isPresetManagedEdge({
        data: {
          user_spawned: true,
          preset_managed: true,
          projection_key: "beat:1:4",
        },
      }),
    ).toBe(false);
  });

  it("does not lock no-reference sentinel edges", () => {
    expect(
      isPresetManagedEdge({
        targetHandle: "prop:__NO_PROP__",
        data: {
          preset_managed: true,
          reference_target: { kind: "prop", prop_id: "__NO_PROP__" },
        },
      }),
    ).toBe(false);
    expect(
      isPresetManagedEdge({
        targetHandle: "identity:__NO_CHARACTER__",
        data: {
          projection_key: "beat:1:4:identity:__NO_CHARACTER__",
          reference_target: {
            kind: "identity",
            identity_id: "__NO_CHARACTER__",
          },
        },
      }),
    ).toBe(false);
  });
});
