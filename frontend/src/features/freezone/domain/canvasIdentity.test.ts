// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  canvasIdForFreezoneEntry,
  personalCanvasIdForUsername,
} from "./canvasIdentity";

describe("freezone canvas identity", () => {
  it("creates a stable ascii-safe personal canvas id", () => {
    expect(personalCanvasIdForUsername("eric@example.com")).toBe("user_eric_example_com_1m9fjbn");
    expect(personalCanvasIdForUsername("林知微")).toBe("user_u_klqmat");
  });

  it("uses the current user's canvas for the project-level Freezone entry", () => {
    expect(
      canvasIdForFreezoneEntry({
        explicitCanvasId: null,
        username: "eric@example.com",
      }),
    ).toBe("user_eric_example_com_1m9fjbn");
    expect(
      canvasIdForFreezoneEntry({
        explicitCanvasId: "member_canvas",
        username: "eric@example.com",
      }),
    ).toBe("member_canvas");
  });
});
