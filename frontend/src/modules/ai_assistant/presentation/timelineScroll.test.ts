// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  calculateTimelineContextDelta,
  calculateTimelineTurnScrollTop,
} from "@/modules/ai_assistant/public";

describe("calculateTimelineContextDelta", () => {
  it("reveals hidden context only when the selected node enters an edge zone", () => {
    expect(calculateTimelineContextDelta({
      viewportHeight: 400,
      nodeCenter: 40,
      scrollTop: 200,
      scrollHeight: 1000,
    })).toBe(-48);
    expect(calculateTimelineContextDelta({
      viewportHeight: 400,
      nodeCenter: 360,
      scrollTop: 200,
      scrollHeight: 1000,
    })).toBe(48);
    expect(calculateTimelineContextDelta({
      viewportHeight: 400,
      nodeCenter: 200,
      scrollTop: 200,
      scrollHeight: 1000,
    })).toBe(0);
  });

  it("does not move beyond the real start or end of the timeline", () => {
    expect(calculateTimelineContextDelta({
      viewportHeight: 400,
      nodeCenter: 40,
      scrollTop: 0,
      scrollHeight: 1000,
    })).toBe(0);
    expect(calculateTimelineContextDelta({
      viewportHeight: 400,
      nodeCenter: 360,
      scrollTop: 600,
      scrollHeight: 1000,
    })).toBe(0);
  });
});

describe("calculateTimelineTurnScrollTop", () => {
  it("aligns the selected message with the same one-third viewport marker", () => {
    expect(calculateTimelineTurnScrollTop({
      itemStart: 500,
      viewportHeight: 300,
      totalSize: 1000,
    })).toBe(400);
  });

  it("clamps the target at the beginning and end of the message list", () => {
    expect(calculateTimelineTurnScrollTop({
      itemStart: 20,
      viewportHeight: 300,
      totalSize: 1000,
    })).toBe(0);
    expect(calculateTimelineTurnScrollTop({
      itemStart: 950,
      viewportHeight: 300,
      totalSize: 1000,
    })).toBe(700);
  });
});
