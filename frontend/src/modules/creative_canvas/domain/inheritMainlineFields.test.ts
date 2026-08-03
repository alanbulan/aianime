// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { inheritMainlineFields } from "./inheritMainlineFields";

describe("inheritMainlineFields", () => {
  it("marks derived nodes user-owned and strips projection management fields", () => {
    const result = inheritMainlineFields(
      {
        data: {
          mainline_context: [
            { kind: "beat", projectId: "demo", episode: 1, beat: 4 },
          ],
          slot_target: { kind: "frame", episode: 1, beat: 4 },
          committed_slot_url: "/static/frame.png",
        },
      },
      {
        displayName: "Edited frame",
        preset_managed: true,
        projection_key: "beat:1:4",
      },
    );

    expect(result).toMatchObject({
      displayName: "Edited frame",
      user_spawned: true,
      mainline_context: [
        { kind: "beat", projectId: "demo", episode: 1, beat: 4 },
      ],
      slot_target: { kind: "frame", episode: 1, beat: 4 },
      committed_slot_url: "/static/frame.png",
      source_projection_key: "beat:1:4",
    });
    expect(result).not.toHaveProperty("preset_managed");
    expect(result).not.toHaveProperty("projection_key");
  });

  it("inherits the source projection key when the child has none", () => {
    expect(
      inheritMainlineFields(
        { data: { projection_key: "source:projection" } },
        { displayName: "Derived" },
      ),
    ).toMatchObject({
      displayName: "Derived",
      user_spawned: true,
      source_projection_key: "source:projection",
    });
  });

  it("keeps the child projection provenance ahead of the source", () => {
    expect(
      inheritMainlineFields(
        { data: { projection_key: "source:projection" } },
        { projection_key: "child:projection" },
      ),
    ).toEqual({
      user_spawned: true,
      source_projection_key: "child:projection",
    });
  });

  it("can opt out of slot inheritance without mutating the source or patch", () => {
    const source = {
      data: {
        slot_target: { kind: "frame" as const, episode: 1, beat: 4 },
      },
    };
    const patch = { displayName: "Exploration" };

    expect(
      inheritMainlineFields(source, patch, { inheritSlotTarget: false }),
    ).toEqual({
      displayName: "Exploration",
      user_spawned: true,
    });
    expect(source.data.slot_target).toEqual({ kind: "frame", episode: 1, beat: 4 });
    expect(patch).toEqual({ displayName: "Exploration" });
  });
});
