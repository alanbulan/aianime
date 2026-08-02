// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { dataUrlToBlob } from "./data-url";

describe("dataUrlToBlob", () => {
  it("decodes base64 data URLs", async () => {
    const blob = dataUrlToBlob("data:image/png;base64,eA==");

    expect(blob.type).toBe("image/png");
    await expect(blob.text()).resolves.toBe("x");
  });

  it("decodes percent-encoded data URLs", async () => {
    const blob = dataUrlToBlob("data:text/plain,hello%20canvas");

    expect(blob.type).toBe("text/plain");
    await expect(blob.text()).resolves.toBe("hello canvas");
  });
});
