// Copyright (c) 2026 AI anime
import { describe, expect, it } from "vitest";

import {
  buildGenerationErrorReport,
  resolveGenerationOsInfo,
} from "./generationErrorReport";

describe("generation error report", () => {
  it("normalizes Windows 10 and 11 user agents", () => {
    expect(
      resolveGenerationOsInfo(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      ),
    ).toEqual({
      osName: "Windows",
      osVersion: "10/11 (NT 10.0)",
    });
  });

  it("normalizes macOS user-agent versions", () => {
    expect(
      resolveGenerationOsInfo(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5_0)",
      ),
    ).toEqual({
      osName: "macOS",
      osVersion: "14.5.0",
    });
  });

  it("renders injected runtime diagnostics into the report", () => {
    const report = buildGenerationErrorReport({
      context: {
        appVersion: "1.2.3",
        osBuild: "22631",
        osName: "Windows",
        osVersion: "11",
        sourceType: "imageEdit",
        userAgent: "test-agent",
      },
      errorMessage: "生成失败",
    });

    expect(report).toContain("- App Version: 1.2.3");
    expect(report).toContain("- OS: Windows 11");
    expect(report).toContain("- OS Build: 22631");
    expect(report).toContain("## User Agent\ntest-agent");
  });
});
