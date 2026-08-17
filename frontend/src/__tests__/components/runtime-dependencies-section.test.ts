import { describe, expect, it } from "vitest";

import { formatBytes } from "@/components/runtime-dependencies-section";

describe("runtime dependency byte formatting", () => {
  it("keeps every binary unit in the correct position", () => {
    expect(formatBytes(2.3 * 1024 ** 3)).toBe("2.3 GB");
    expect(formatBytes(3.8 * 1024 ** 3)).toBe("3.8 GB");
    expect(formatBytes(2.3 * 1024 ** 4)).toBe("2.3 TB");
  });
});
