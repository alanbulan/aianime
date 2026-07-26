// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { extractHistoryId } from "./canvasStorage";

describe("extractHistoryId", () => {
  it("prefers the canonical history identifier", () => {
    expect(
      extractHistoryId({
        history_id: "history-2",
        id: "history-1",
        filename: "history.json",
      }),
    ).toBe("history-2");
  });

  it("supports legacy aliases and rejects empty values", () => {
    expect(extractHistoryId({ history_id: "", filename: "rev-4.json" })).toBe(
      "rev-4.json",
    );
    expect(extractHistoryId({ name: "" })).toBeNull();
  });
});
