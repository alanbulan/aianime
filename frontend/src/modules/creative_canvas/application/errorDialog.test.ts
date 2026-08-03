// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { resolveErrorContent } from "./errorDialog";

describe("Canvas error content", () => {
  it("resolves Error details without invoking presentation state", () => {
    const error = Object.assign(new Error("provider failed"), {
      details: " request-id: abc ",
    });

    expect(resolveErrorContent(error, "fallback")).toEqual({
      details: "request-id: abc",
      message: "provider failed",
    });
  });

  it("resolves structured non-Error payloads with a stable fallback", () => {
    expect(resolveErrorContent(
      { code: 500, msg: "任务失败" },
      "fallback",
    )).toEqual({
      details: "{\n  \"code\": 500,\n  \"msg\": \"任务失败\"\n}",
      message: "任务失败",
    });
    expect(resolveErrorContent(null, "fallback")).toEqual({
      message: "fallback",
    });
  });
});
