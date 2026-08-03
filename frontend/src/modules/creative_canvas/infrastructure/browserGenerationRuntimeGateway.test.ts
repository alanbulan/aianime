// Copyright (c) 2026 AI anime
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("browserGenerationRuntimeGateway", () => {
  it("projects browser diagnostics once per runtime session", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });
    const { browserGenerationRuntimeGateway } = await import(
      "./browserGenerationRuntimeGateway"
    );

    const first = browserGenerationRuntimeGateway.getRuntimeDiagnostics();
    const second = browserGenerationRuntimeGateway.getRuntimeDiagnostics();

    expect(second).toBe(first);
    await expect(first).resolves.toMatchObject({
      osName: "Windows",
      osVersion: "10/11 (NT 10.0)",
      osBuild: "unknown",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });
    expect(browserGenerationRuntimeGateway.runtimeSessionId).toMatch(
      /^runtime-\d+-[a-z0-9]+$/,
    );
  });
});
