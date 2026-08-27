// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import { formatPreciseMediaTime } from "@/components/media/media-time";

describe("formatPreciseMediaTime", () => {
  it("保留亚秒、秒和分钟音视频时长所需精度", () => {
    expect(formatPreciseMediaTime(0, 0.642)).toBe("0.000s");
    expect(formatPreciseMediaTime(0.642, 0.642)).toBe("0.642s");
    expect(formatPreciseMediaTime(6.5, 6.5)).toBe("6.50s");
    expect(formatPreciseMediaTime(61.234, 61.234)).toBe("1:01.23");
  });
});
